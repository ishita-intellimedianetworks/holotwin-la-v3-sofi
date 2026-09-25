"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Container } from "@react-three/uikit";
import { FootprintsIcon, MapPinIcon } from "@react-three/uikit-lucide";
import {
  CATEGORY_INFO,
  type CategoryIconKey,
} from "@/components-v5/shared/categories";
import type { VRLayout, VRNotice } from "@/components/vr/data";
import { useVenue } from "@/components/vr/data/venue-provider";
import { VRPanel } from "../ui/panel";
import { PanelList } from "../ui/panel-list";
import { MenuRow, ROW_GLYPH } from "../ui/menu-row";
import { PanelHeader } from "../ui/panel-parts";
import { VRText } from "../ui/text";
import { COLOR, SPACE, TEXT } from "../ui/tokens";
import { CATEGORY_ICON } from "../ui/category-icons";
import { crowdLabel } from "../menus/grouping";
import { useVRState } from "../state";
import { distanceLabel, etaLabel, flatDistance } from "../map/pins";
import { CrowdPanel } from "./crowd-panel";
import { NoticesPanel } from "./notices-panel";
import { PlaceDetail } from "./place-detail";
import { SeatMapPanel } from "./seat-map";
import { Pill } from "./parts";

/**
 * Everything the venue has to say about itself, behind one dock button.
 *
 * THIS REPLACES THE LAYOUTS MENU rather than sitting beside it. That menu was
 * already the right idea — one list, categories as headings, one press instead
 * of a rail of buttons in the periphery — and the argument for it is recorded
 * in the file it replaced. What it was missing was everything the flat card
 * carries once you pick a row: the chips, the crowd line, the sample menu, the
 * timetable, the seat picker, the notice board.
 *
 * SO THE SHAPE IS THAT LIST, PLUS BOARDS. The flat site puts its six special
 * categories — seat views, event updates, crowd, infrastructure — in
 * the same rail as ordinary places, and routes each to a panel of its own.
 * Keeping the rail would mean the dock problem all over again, so the boards are
 * the first few rows of the one list instead: named, counted, and one press from
 * the top rather than one press from a button nobody found.
 *
 * WHAT IS NOT HERE, and is not missing: the route, the turn list, the walking
 * ETA along it, and the search box. The first three are readings off a path,
 * and there is no pathfinder here by choice. The fourth wants a keyboard, and
 * the largest category in any venue is thirteen rows — the flat panel only
 * shows its own search box above four.
 */

/**
 * RESOURCES, AS THE 3D SITE LAYS THEM OUT. The flat site gives every category
 * its own flap on the left rail; here there is ONE dock button, and its panel
 * opens on that rail as a list — each category with its own glyph and count.
 * Picking one opens the flat category panel: its title, "N points - nearest
 * first", the subcategory pills, and the destination cards, nearest first.
 */
type View =
  | { kind: "list" }
  | {
      kind: "category";
      key: string;
      /** The active subcategory pill, or null for the first. */
      option: string | null;
      /** Where the player stood when it opened — the list sorts from here. */
      from: { x: number; z: number };
    }
  | {
      kind: "place";
      place: VRLayout;
      distance: string;
      eta: string;
      /** The category list to go back to. */
      back: View;
    }
  | { kind: "seats" }
  | { kind: "notices" }
  | { kind: "crowd" };

/**
 * How often the departure countdowns are recomputed.
 *
 * THIRTY SECONDS, not the flat site's fifteen. Every tick is a React render of
 * a uikit tree, which is a layout pass rather than a DOM diff, and a headset is
 * submitting two eyes against a 13.9 ms budget while it happens. A bus that is
 * "in 7 min" for half a minute longer than it strictly should be is not a
 * defect anyone can perceive; a stutter is.
 */
const CLOCK_MS = 30_000;

const _head = new THREE.Vector3();

/** Seat views are a picker, not a list — the flat site treats them the same. */
const SEAT_CATEGORIES = new Set(["seating", "seatviews"]);

interface ResourceCategory {
  key: string;
  label: string;
  unit: string;
  iconKey: CategoryIconKey;
  /** Subcategory pills above the list, as the flat panel's segment control. */
  tabs: boolean;
  count: number;
  items: VRLayout[];
  /** Opens a board of its own instead of a list. */
  board?: "seats" | "notices" | "crowd";
}

export function DestinationsPanel({ onClose }: { onClose: () => void }) {
  const venue = useVenue();
  const { teleportTo, revealDestination } = useVRState();
  const camera = useThree((state) => state.camera);

  const [view, setView] = useState<View>({ kind: "list" });
  const [now, setNow] = useState(() => Date.now());

  /** Only ticking while a hub's departures are actually on screen. */
  const showingTransport =
    view.kind === "place" && !!view.place.transitRoutes?.length;

  /**
   * The interval only. The clock is re-read when the board is OPENED, in the
   * handler that opens it — reading it here as well would be a setState in an
   * effect body, which cascades a second render for a value the press already
   * knew.
   */
  useEffect(() => {
    if (!showingTransport) return;
    const id = setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => clearInterval(id);
  }, [showingTransport]);

  /**
   * Seats are pulled OUT of the ordinary list, because they are a picker.
   *
   * The stadium authors twelve of them and the memorial three, all under one
   * category, and as rows they are twelve near-identical names differing by a
   * level number. The bowl plot says the same thing in one glance.
   */
  const seats = useMemo(
    () => venue.layouts.filter((l) => SEAT_CATEGORIES.has(l.category)),
    [venue.layouts],
  );

  const places = useMemo(
    () => venue.layouts.filter((l) => !SEAT_CATEGORIES.has(l.category)),
    [venue.layouts],
  );

  /**
   * The rail: every category this venue has, in the site's canonical order,
   * with its site glyph. Seat views, event updates and crowd open their boards
   * rather than a plain list — as their flat panels do.
   */
  const categories = useMemo(() => {
    const byKey = new Map<string, VRLayout[]>();
    for (const place of places) {
      const list = byKey.get(place.category) ?? [];
      list.push(place);
      byKey.set(place.category, list);
    }

    const out: ResourceCategory[] = [];
    for (const info of CATEGORY_INFO) {
      const base = {
        key: info.key,
        label: info.label,
        unit: info.unit,
        iconKey: info.iconKey,
        tabs: info.segmentBy === "option" && !info.flatOptions,
      };
      if (SEAT_CATEGORIES.has(info.key)) {
        if (seats.length > 0 && !out.some((c) => c.board === "seats")) {
          out.push({ ...base, count: seats.length, items: [], board: "seats" });
        }
        continue;
      }
      if (info.key === "eventupdates" && venue.notices.length > 0) {
        byKey.delete(info.key);
        out.push({
          ...base,
          count: venue.notices.length,
          items: [],
          board: "notices",
        });
        continue;
      }
      if (info.key === "crowdflow" && venue.crowdRows.length > 0) {
        byKey.delete(info.key);
        out.push({
          ...base,
          count: venue.crowdRows.length,
          items: [],
          board: "crowd",
        });
        continue;
      }
      const items = byKey.get(info.key);
      if (!items?.length) continue;
      byKey.delete(info.key);
      out.push({ ...base, count: items.length, items });
    }

    // Anything the table does not know still gets a row, under its own name.
    for (const [key, items] of byKey) {
      out.push({
        key,
        label: items[0].group,
        unit: "places",
        iconKey: "layout-grid",
        tabs: true,
        count: items.length,
        items,
      });
    }
    return out;
  }, [places, seats.length, venue.notices.length, venue.crowdRows.length]);

  const openCategory = useCallback(
    (category: ResourceCategory) => {
      if (category.board) {
        setView({ kind: category.board });
        return;
      }
      camera.getWorldPosition(_head);
      setView({
        kind: "category",
        key: category.key,
        option: null,
        from: { x: _head.x, z: _head.z },
      });
    },
    [camera],
  );

  /**
   * Distance is measured ONCE, when a row is picked.
   *
   * Not every frame, and not on a timer. The alternative is re-rendering a
   * uikit panel as the player walks, to update a figure they are standing still
   * to read — the live reading is the floor plan's job, where it is drawn onto
   * a texture instead of through React. See `../map`.
   */
  const openPlace = useCallback(
    (place: VRLayout, backTo: View = { kind: "list" }) => {
      camera.getWorldPosition(_head);
      const units = flatDistance(
        _head.x,
        _head.z,
        place.position[0],
        place.position[2],
      );
      setNow(Date.now());
      setView({
        kind: "place",
        place,
        distance: distanceLabel(units),
        eta: etaLabel(units),
        back: backTo,
      });
    },
    [camera],
  );

  const travelTo = useCallback(
    (place: VRLayout) => {
      teleportTo({
        position: place.position,
        rotationY: place.rotationY,
        exactPose: place.exactPose,
      });
      revealDestination(place.destinationId);
      onClose();
    },
    [onClose, revealDestination, teleportTo],
  );

  const travelToNotice = useCallback(
    (notice: VRNotice) => {
      if (!notice.camera) return;
      teleportTo({
        position: notice.camera.position,
        rotationY: notice.camera.rotationY,
      });
      onClose();
    },
    [onClose, teleportTo],
  );

  const back = useCallback(() => setView({ kind: "list" }), []);

  const body = (() => {
    switch (view.kind) {
      case "place":
        return (
          <PlaceDetail
            place={view.place}
            distance={view.distance}
            eta={view.eta}
            now={now}
            onTravel={() => travelTo(view.place)}
            onBack={() => setView(view.back)}
            onClose={onClose}
          />
        );

      case "seats":
        return (
          <SeatMapPanel
            seats={seats}
            onSelect={travelTo}
            onBack={back}
            onClose={onClose}
          />
        );

      case "notices":
        return (
          <NoticesPanel
            notices={venue.notices}
            onTravel={travelToNotice}
            onBack={back}
            onClose={onClose}
          />
        );

      case "crowd":
        return (
          <CrowdPanel
            rows={venue.crowdRows}
            onSelect={(destinationId) => {
              const place = venue.layouts.find(
                (l) => l.destinationId === destinationId,
              );
              if (place) openPlace(place, { kind: "crowd" });
            }}
            onBack={back}
            onClose={onClose}
          />
        );

      case "category": {
        const category = categories.find((c) => c.key === view.key);
        if (!category) return null;

        const options = [
          ...new Set(
            category.items
              .map((item) => item.option)
              .filter((o): o is string => !!o),
          ),
        ];
        const showTabs = category.tabs && options.length > 1;
        const active = view.option ?? options[0] ?? null;

        const rows = (
          showTabs
            ? category.items.filter((item) => item.option === active)
            : category.items
        )
          .map((item) => ({
            item,
            units: flatDistance(
              view.from.x,
              view.from.z,
              item.position[0],
              item.position[2],
            ),
          }))
          .sort((x, y) => x.units - y.units);

        return (
          <>
            <PanelHeader
              title={category.label}
              subtitle={`${rows.length} ${category.unit} - nearest first`}
              onBack={back}
              onClose={onClose}
            />

            {/* The subcategory pills — the flat panel's segment control. */}
            {showTabs && (
              <Container
                width="100%"
                flexShrink={0}
                flexDirection="row"
                flexWrap="wrap"
                gap={SPACE.row}
                paddingX={SPACE.listX}
              >
                {options.map((option) => (
                  <Pill
                    key={option}
                    active={option === active}
                    onSelect={() => setView({ ...view, option })}
                  >
                    {option}
                  </Pill>
                ))}
              </Container>
            )}

            <PanelList>
              {rows.length === 0 ? (
                <VRText fontSize={TEXT.body} color={COLOR.muted}>
                  No places match those filters
                </VRText>
              ) : (
                rows.map(({ item, units }) => (
                  <MenuRow
                    key={item.id}
                    label={item.title}
                    icon={
                      <MapPinIcon
                        width={ROW_GLYPH}
                        height={ROW_GLYPH}
                        color={COLOR.muted}
                      />
                    }
                    subline={etaLabel(units)}
                    subIcon={
                      <FootprintsIcon
                        width={18}
                        height={18}
                        color={COLOR.muted}
                      />
                    }
                    distance={distanceLabel(units)}
                    detail={crowdLabel(item.crowd)}
                    onSelect={() => openPlace(item, view)}
                  />
                ))
              )}
            </PanelList>
          </>
        );
      }

      default:
        return (
          <>
            <PanelHeader
              title="Resources"
              subtitle={venue.title}
              onClose={onClose}
            />

            <PanelList>
              {categories.length === 0 ? (
                <VRText fontSize={TEXT.body} color={COLOR.muted}>
                  No data for this venue yet
                </VRText>
              ) : (
                categories.map((category) => {
                  const Icon = CATEGORY_ICON[category.iconKey];
                  return (
                    <MenuRow
                      key={category.key}
                      label={category.label}
                      icon={
                        <Icon
                          width={ROW_GLYPH}
                          height={ROW_GLYPH}
                          color={COLOR.muted}
                        />
                      }
                      subline={`${category.count} ${category.unit}`}
                      onSelect={() => openCategory(category)}
                    />
                  );
                })
              )}
            </PanelList>
          </>
        );
    }
  })();

  return <VRPanel onDismiss={onClose}>{body}</VRPanel>;
}
