"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  CalendarClockIcon,
  BusFrontIcon,
  EyeIcon,
  UsersIcon,
} from "@react-three/uikit-lucide";
import type { TransportDestination } from "@/components-v5/shared/types";
import type { VRLayout, VRNotice } from "@/components/vr/data";
import { useVenue } from "@/components/vr/data/venue-provider";
import { VRPanel } from "../ui/panel";
import { PanelList } from "../ui/panel-list";
import { MenuRow } from "../ui/menu-row";
import { PanelHeader, SectionLabel } from "../ui/panel-parts";
import { VRText } from "../ui/text";
import { COLOR, TEXT } from "../ui/tokens";
import { crowdLabel, groupByCategoryAndOption } from "../menus/grouping";
import { useVRState } from "../state";
import { distanceLabel, etaLabel, flatDistance } from "../map/pins";
import { CrowdPanel } from "./crowd-panel";
import { NoticesPanel } from "./notices-panel";
import { PlaceDetail } from "./place-detail";
import { SeatMapPanel } from "./seat-map";
import { TransportPanel } from "./transport-panel";

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
 * categories — seat views, transport, event updates, crowd, infrastructure — in
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

type View =
  | { kind: "list" }
  | { kind: "place"; place: VRLayout; distance: string; eta: string }
  | { kind: "seats" }
  | { kind: "transport"; venue: TransportDestination | null }
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

export function DestinationsPanel({ onClose }: { onClose: () => void }) {
  const venue = useVenue();
  const { teleportTo, revealDestination } = useVRState();
  const camera = useThree((state) => state.camera);

  const [view, setView] = useState<View>({ kind: "list" });
  const [now, setNow] = useState(() => Date.now());

  /** Only ticking while a timetable is actually on screen. */
  const showingTransport = view.kind === "transport";

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

  const groups = useMemo(
    () => groupByCategoryAndOption(places),
    [places],
  );

  /** Transport hubs, by POI id — what a `TransportDestination.hubId` names. */
  const hubs = useMemo(
    () => new Map(venue.layouts.map((l) => [l.destinationId, l])),
    [venue.layouts],
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
    (place: VRLayout) => {
      camera.getWorldPosition(_head);
      const units = flatDistance(
        _head.x,
        _head.z,
        place.position[0],
        place.position[2],
      );
      setView({
        kind: "place",
        place,
        distance: distanceLabel(units),
        eta: etaLabel(units),
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
            onTravel={() => travelTo(view.place)}
            onBack={back}
            onClose={onClose}
          />
        );

      case "seats":
        return (
          <SeatMapPanel
            seats={seats}
            venueTitle={venue.title}
            onSelect={travelTo}
            onBack={back}
            onClose={onClose}
          />
        );

      case "transport":
        return (
          <TransportPanel
            venues={venue.transport}
            hubs={hubs}
            venueTitle={venue.title}
            now={now}
            selected={view.venue}
            onSelect={(next) => setView({ kind: "transport", venue: next })}
            onTravelToHub={travelTo}
            onBack={back}
            onClose={onClose}
          />
        );

      case "notices":
        return (
          <NoticesPanel
            notices={venue.notices}
            venueTitle={venue.title}
            onTravel={travelToNotice}
            onBack={back}
            onClose={onClose}
          />
        );

      case "crowd":
        return (
          <CrowdPanel
            rows={venue.crowdRows}
            venueTitle={venue.title}
            onSelect={(destinationId) => {
              const place = venue.layouts.find(
                (l) => l.destinationId === destinationId,
              );
              if (place) openPlace(place);
            }}
            onBack={back}
            onClose={onClose}
          />
        );

      default:
        return (
          <>
            <PanelHeader
              title="Destinations"
              subtitle={venue.title}
              onClose={onClose}
            />

            <PanelList>
              {/*
                The boards, above the places.
                Each is gated on its venue actually authoring something: an
                empty "Transport" row that opens an empty panel is worse than
                no row, because it costs a press to learn nothing.
              */}
              {seats.length > 0 && (
                <MenuRow
                  label="Seat views"
                  detail={`${seats.length}`}
                  icon={
                    <EyeIcon width={22} height={22} color={COLOR.accentBright} />
                  }
                  onSelect={() => setView({ kind: "seats" })}
                />
              )}

              {venue.transport.length > 0 && (
                <MenuRow
                  label="Transport"
                  detail={`${venue.transport.length}`}
                  icon={
                    <BusFrontIcon
                      width={22}
                      height={22}
                      color={COLOR.accentBright}
                    />
                  }
                  onSelect={() => {
                    setNow(Date.now());
                    setView({ kind: "transport", venue: null });
                  }}
                />
              )}

              {venue.notices.length > 0 && (
                <MenuRow
                  label="Event updates"
                  detail={`${venue.notices.length}`}
                  icon={
                    <CalendarClockIcon
                      width={22}
                      height={22}
                      color={COLOR.accentBright}
                    />
                  }
                  onSelect={() => setView({ kind: "notices" })}
                />
              )}

              {venue.crowdRows.length > 0 && (
                <MenuRow
                  label="Crowd"
                  detail={`${venue.crowdRows.length}`}
                  icon={
                    <UsersIcon
                      width={22}
                      height={22}
                      color={COLOR.accentBright}
                    />
                  }
                  onSelect={() => setView({ kind: "crowd" })}
                />
              )}

              {places.length === 0 ? (
                <VRText fontSize={TEXT.body} color={COLOR.muted}>
                  This venue has no saved viewpoints.
                </VRText>
              ) : (
                groups.map((group) => (
                  <Fragment key={group.group}>
                    {/* The category — what the flat rail draws as a button. */}
                    <SectionLabel>{group.group}</SectionLabel>

                    {group.sections.map((section) => (
                      <Fragment key={section.option ?? "_"}>
                        {/* The subcategory, only where the venue authored more
                            than one: a lone heading under its category says
                            nothing the category did not. */}
                        {section.option && group.sections.length > 1 && (
                          <SectionLabel indent>{section.option}</SectionLabel>
                        )}

                        {section.items.map((row) => (
                          <MenuRow
                            key={row.id}
                            label={row.title}
                            detail={crowdLabel(row.crowd)}
                            onSelect={() => openPlace(row)}
                          />
                        ))}
                      </Fragment>
                    ))}
                  </Fragment>
                ))
              )}
            </PanelList>
          </>
        );
    }
  })();

  return (
    <VRPanel width="46%" maxHeight="62%" onDismiss={onClose}>
      {body}
    </VRPanel>
  );
}
