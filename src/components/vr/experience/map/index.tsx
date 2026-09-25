"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Container, Image } from "@react-three/uikit";
import * as THREE from "three";
import type { ImageRect } from "@/components-v5/interior-scene/minmap/utils/draw-fns";
import {
  pixelToWorld,
  worldToPixel,
} from "@/components-v5/interior-scene/minmap/utils/coord-utils";
import { useVenue } from "@/components/vr/data/venue-provider";
import { useModelBounds } from "@/components/vr/hooks/use-model-bounds";
import { VRPanel, panelWidthPx } from "../ui/panel";
import { PanelList } from "../ui/panel-list";
import { PanelHeader, PrimaryButton } from "../ui/panel-parts";
import { VRText } from "../ui/text";
import { COLOR, RADIUS, SPACE, TEXT } from "../ui/tokens";
import { useVRState } from "../state";
import { drawPlan, type ClickMarker } from "./draw";
import { buildPins, flatDistance, planBounds } from "./pins";
import { PLAN_TEXELS, usePlanCanvas, type PlanCanvas } from "./plan-canvas";

/**
 * The floor plan, in the headset.
 *
 * A DRAWING ON A TEXTURE, NOT A MODEL. The plan is the same PNG the flat map
 * shows, with the same dots drawn on it by the same code — see `./draw`. What
 * is rebuilt here is only what the DOM used to provide: the element that shows
 * the canvas, and the input that used to arrive as wheel, mouse and touch.
 *
 * PRESS TARGETS, NOT A CURSOR. The flat map hit-tests a pin within 18 px of a
 * mouse click. A controller ray is nowhere near that accurate at two metres, so
 * the radius here is generous.
 *
 * NO ZOOM. The plan is always shown whole: the +/- buttons cost a column of
 * the card and a pile of pan state for something the list under the plan
 * already does better — every pin is a row there, and a row is easier to aim
 * at than a dot however far the plan is magnified.
 */

/**
 * How near the player has to be to count as standing AT a destination, in world
 * units. The flat site polls this every 200 ms against its route target; there
 * is no route here, so it is a plain proximity test.
 *
 * Three units rather than one: the pin is the thing being labelled — a gate, a
 * desk — and the viewpoint authored for it stands back far enough to see it.
 */
const HERE_RADIUS = 3;

/**
 * Press radius on the plan, in canvas pixels at 1× zoom.
 *
 * 36 rather than the flat map's 18, and the canvas is three times the size, so
 * in plan terms this is TIGHTER than the mouse version — about 12 flat pixels.
 * A ray is less accurate than a mouse but this canvas is far larger, and being
 * looser would make two adjacent gates impossible to tell apart.
 */
const HIT_PX = 36;

/**
 * A press that travels further than this is a scroll of the card, not a tap on
 * the plan. In UV units.
 */
const DRAG_SLOP_UV = 0.012;

/**
 * The plan's side, as a share of the view height. Large on purpose — the plan
 * is the point of this panel.
 *
 * THE LIST SITS BESIDE THE PLAN, NOT UNDER IT. Stacked, a plan this size plus a
 * few rows of list made a card three quarters of the view tall. Side by side,
 * the card is only as tall as the plan plus its header, and the wide card's
 * spare width goes to the list.
 */
const MAP_SHARE = 0.4;

/**
 * THE CARD'S HEIGHT IS COMPUTED, NOT GUESSED. It was a percentage, and the
 * chips above the plan wrapped onto a second and third row on venues with many
 * categories — pushing the plan past the bottom of a fixed card, where it drew
 * over the list and the header. Now nothing sits above the plan but the title,
 * so the card is exactly: padding + title + gap + plan + padding.
 */
const HEADER_H = 52;

/** The filter pills' one row — it scrolls sideways rather than wrapping. */
const CHIP_ROW_H = 52;

/**
 * NUMBERED DOTS ON EVERY VENUE, names only in the list beside the plan.
 *
 * The site switches to this for its crowded venues (`mapListMode`) and draws a
 * name pill on every pin elsewhere. At headset size the pills of neighbouring
 * pins run into each other and the plan turns into overlapping text; the list
 * is right beside it here, so the number is all the plan has to carry.
 */
const NUMBERED = true;

/** How far a row press may travel and still count as a pick, in metres. */
const ROW_DRAG_SLOP = 0.02;

/** No zoom, so the plan is always drawn at 1x with no pan. */
const NO_PAN = { x: 0, y: 0 };

/**
 * The plan is redrawn at most this often while the player is simply moving.
 *
 * A FULL CANVAS RE-UPLOAD IS NOT FREE: 1024² of RGBA is four megabytes crossing
 * to the GPU, and doing that on all 72 frames would spend more bandwidth on the
 * map than on the venue behind it. Eight times a second is smooth for a dot
 * that represents a walking person, and anything the user actually does —
 * zooming, panning, selecting — bypasses this and redraws immediately.
 */
const WALK_REDRAW_SECONDS = 1 / 8;

const _head = new THREE.Vector3();
const _dir = new THREE.Vector3();

export function MapPanel({ onClose }: { onClose: () => void }) {
  const venue = useVenue();
  const { teleportTo, revealDestination } = useVRState();
  const camera = useThree((state) => state.camera);

  /**
   * THE PLAN IS SIZED IN PIXELS, NOT IN PERCENT, and that is not a preference.
   *
   * `width="100%"` with `aspectRatio={1}` gives uikit a width it can satisfy and
   * a height it cannot refuse, so the square it produces is as tall as the panel
   * is wide — which on a card 1.3 viewport-heights across is roughly twice its
   * own maximum height. It does not clip: it overflows, and takes the header,
   * the chips and the list off the card with it.
   *
   * THE PLAN IS FIXED; ONLY THE LIST BESIDE IT SCROLLS. The plan gets
   * `MAP_SHARE` of the view height and never moves — capped at half the card's
   * width, so the list keeps the other half.
   */
  const viewportHeight = useThree((state) => state.size.height);
  const mapSize = Math.min(
    Math.round((panelWidthPx(viewportHeight) - 2 * SPACE.panelX) / 2),
    Math.round(MAP_SHARE * viewportHeight),
  );
  const panelHeight = 2 * SPACE.panelY + HEADER_H + SPACE.section + mapSize;

  /** Suspends on the model the scene has already loaded — drei caches by path. */
  const { box } = useModelBounds(venue.model);
  const bounds = useMemo(() => planBounds(box), [box]);

  const plan = usePlanCanvas(venue.floorPlan);

  /** Set whenever something the drawing depends on changes. */
  const dirty = useRef(true);

  /**
   * The same canvas, reachable from the frame loop.
   *
   * NOT AN INDIRECTION FOR ITS OWN SAKE. `plan` is a hook return value, and the
   * React Compiler forbids writing to one after render — which uploading the
   * texture (`needsUpdate = true`) plainly is. A ref is the sanctioned way to
   * carry something into a callback that outlives the render, and it is the
   * same reason everything else that runs every frame here is one.
   */
  const planRef = useRef<PlanCanvas | null>(null);

  useEffect(() => {
    planRef.current = plan;
    dirty.current = true;
  }, [plan]);

  /**
   * WHICH CATEGORY IS PINNED. `null` means every one of them at once.
   *
   * The flat map insists on a category before it draws any pin, because its
   * legend is a list beside the plan and an unfiltered memorial would be 26
   * rows. Here the default is everything: a plan with nothing on it is the
   * state a first-time visitor arrives in, and it reads as broken rather than
   * as unfiltered.
   */
  const [category, setCategory] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /** Categories this venue actually authors, in `data`'s display case. */
  const groups = useMemo(() => {
    const seen = new Map<string, string>();
    for (const layout of venue.layouts) {
      if (!seen.has(layout.group)) seen.set(layout.group, layout.category);
    }
    return [...seen.keys()];
  }, [venue.layouts]);

  const rows = useMemo(
    () =>
      category == null
        ? venue.layouts
        : venue.layouts.filter((l) => l.group === category),
    [venue.layouts, category],
  );

  const selected = useMemo(
    () => rows.find((r) => r.destinationId === selectedId) ?? null,
    [rows, selectedId],
  );

  /**
   * Everything the frame loop reads, mirrored into refs.
   *
   * `useFrame` runs outside React's render, so it cannot close over state that
   * changes — it would redraw last render's category forever. Written from an
   * effect rather than during render, which the React Compiler forbids.
   */
  const rowsRef = useRef(rows);
  const selectedRef = useRef<string | null>(selectedId);

  useEffect(() => {
    rowsRef.current = rows;
    dirty.current = true;
  }, [rows]);

  useEffect(() => {
    selectedRef.current = selectedId;
    dirty.current = true;
  }, [selectedId]);

  /** Where the plan image last landed, for decoding the next press. */
  const letterbox = useRef<ImageRect>({
    dx: 0,
    dy: 0,
    dw: PLAN_TEXELS,
    dh: PLAN_TEXELS,
  });

  const click = useRef<ClickMarker | null>(null);

  /** Last drawn pose, so a still player does not re-upload the same canvas. */
  const lastPose = useRef({ x: Infinity, z: Infinity, yaw: Infinity });
  const sinceDraw = useRef(0);

  useFrame((_, delta) => {
    const plan = planRef.current;
    if (!plan) return;

    camera.getWorldPosition(_head);
    camera.getWorldDirection(_dir);
    // The same convention the flat controller reports: yaw about +Y, zero
    // facing -Z, which is what `drawPlayerFOV` rotates the cone by.
    const yaw = Math.atan2(-_dir.x, -_dir.z);

    sinceDraw.current += delta;

    const moved =
      Math.abs(_head.x - lastPose.current.x) > 0.02 ||
      Math.abs(_head.z - lastPose.current.z) > 0.02 ||
      Math.abs(yaw - lastPose.current.yaw) > 0.01;

    const fading = click.current != null;

    if (!dirty.current && !fading) {
      if (!moved) return;
      if (sinceDraw.current < WALK_REDRAW_SECONDS) return;
    }

    dirty.current = false;
    sinceDraw.current = 0;
    lastPose.current = { x: _head.x, z: _head.z, yaw };

    // Standing at a destination? The nearest pin within `HERE_RADIUS`. Drawn as
    // the green "you are here" dot — see `MapHotspot.here`.
    let nearest: string | null = null;
    let nearestDistance = HERE_RADIUS;
    for (const row of rowsRef.current) {
      for (const [px, , pz] of row.pins) {
        const d = flatDistance(_head.x, _head.z, px, pz);
        if (d < nearestDistance) {
          nearestDistance = d;
          nearest = row.destinationId;
        }
      }
    }

    letterbox.current = drawPlan({
      ctx: plan.ctx,
      size: PLAN_TEXELS,
      image: plan.imageRef.current,
      bounds,
      pins: buildPins(
        rowsRef.current,
        { x: _head.x, z: _head.z },
        NUMBERED,
        nearest,
      ),
      player: { x: _head.x, z: _head.z },
      rotationY: yaw,
      zoom: 1,
      offset: NO_PAN,
      selectedId: selectedRef.current,
      numbered: NUMBERED,
      click: click.current,
    });

    if (click.current && click.current.alpha <= 0) click.current = null;

    plan.texture.needsUpdate = true;
  });

  /**
   * Press state, keyed by pointer so two controllers cannot confuse each other
   * — the same reason `MenuRow` keys its own map that way.
   */
  const press = useRef(new Map<number, { u: number; v: number }>());

  /** UV on the plate → canvas pixel, then → the plan's own pixel space. */
  const toPlanPixel = useCallback((u: number, v: number) => {
    const cx = u * PLAN_TEXELS;
    // Canvas Y runs down from the top; UV runs up from the bottom.
    const cy = (1 - v) * PLAN_TEXELS;

    const lb = letterbox.current;
    return { ipx: cx - lb.dx, ipy: cy - lb.dy, lb };
  }, []);

  const handleTap = useCallback(
    (u: number, v: number) => {
      const { ipx, ipy, lb } = toPlanPixel(u, v);

      // The margin around the plan is not the plan.
      if (ipx < 0 || ipy < 0 || ipx > lb.dw || ipy > lb.dh) return;

      // Nearest pin, if one is near enough.
      let best = HIT_PX;
      let hit: string | null = null;

      for (const row of rowsRef.current) {
        for (const [px, , pz] of row.pins) {
          const p = worldToPixel(px, pz, bounds, lb.dw, lb.dh);
          const d = Math.hypot(p.px - ipx, p.py - ipy);
          if (d < best) {
            best = d;
            hit = row.destinationId;
          }
        }
      }

      if (hit) {
        // A second press on the selected pin clears it, matching the flat
        // card's "tap again to deselect".
        setSelectedId((current) => (current === hit ? null : hit));
        return;
      }

      /**
       * AN EMPTY PRESS IS A PLACE TO STAND.
       *
       * The flat map refuses this in its numbered venues — the memorial and the
       * stadium — because there the plan is a legend for the list beside it and
       * a stray click would start a walk nobody asked for. That reasoning does
       * not survive the trip: here the list is a scroll away inside the same
       * panel, and pointing at a spot on a plan is the most direct thing a
       * person can do with one.
       *
       * Where it lands is the teleport driver's problem, and it is already
       * solved: every landing is snapped onto walkable ground near the authored
       * height, which is what keeps a press over the stadium's stands from
       * dropping the player forty metres onto the pitch.
       */
      const world = pixelToWorld(ipx, ipy, bounds, lb.dw, lb.dh);
      click.current = { px: ipx, py: ipy, alpha: 1 };
      dirty.current = true;
      setSelectedId(null);
      teleportTo({ position: [world.x, 0, world.z], rotationY: 0 });
      onClose();
    },
    [bounds, onClose, teleportTo, toPlanPixel],
  );

  const travel = useCallback(() => {
    if (!selected) return;
    teleportTo({
      position: selected.position,
      rotationY: selected.rotationY,
      exactPose: selected.exactPose,
    });
    revealDestination(selected.destinationId);
    onClose();
  }, [onClose, revealDestination, selected, teleportTo]);

  const selectedNum = selected
    ? rows.findIndex((row) => row.destinationId === selected.destinationId) + 1
    : 0;

  return (
    <VRPanel height={panelHeight} onDismiss={onClose}>
      {/* The site's map card title bar: just "Map" and the close disc. */}
      <PanelHeader title="Map" onClose={onClose} />

      {/* The plan on the left, everything else in one column on the right. */}
      <Container
        width="100%"
        height={mapSize}
        flexShrink={0}
        flexDirection="row"
        gapColumn={SPACE.section}
      >
        <Container
          width={mapSize}
          height={mapSize}
          flexShrink={0}
          borderRadius={RADIUS.row}
          borderWidth={1}
          borderColor={COLOR.rowBorder}
          backgroundColor={COLOR.rowRest}
          alignItems="center"
          justifyContent="center"
          overflow="hidden"
        >
          {plan ? (
            // Not a DOM <img>: a uikit element whose `src` takes a THREE.Texture.
            // There is no alt attribute to give it.
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image
              src={plan.texture}
              width={mapSize}
              height={mapSize}
              flexShrink={0}
              borderRadius={RADIUS.row}
              /*
                The plate is the ray target for the whole plan, so the press
                handlers live here rather than on a wrapper — `event.uv` is
                only meaningful on the element the ray actually hit.
              */
              onPointerDown={(event) => {
                if (event.pointerId == null || !event.uv) return;
                press.current.set(event.pointerId, {
                  u: event.uv.x,
                  v: event.uv.y,
                });
              }}
              onPointerLeave={(event) => {
                if (event.pointerId != null)
                  press.current.delete(event.pointerId);
              }}
              onPointerCancel={(event) => {
                if (event.pointerId != null)
                  press.current.delete(event.pointerId);
              }}
              onPointerUp={(event) => {
                const from =
                  event.pointerId == null
                    ? undefined
                    : press.current.get(event.pointerId);
                if (event.pointerId != null)
                  press.current.delete(event.pointerId);
                if (!from || !event.uv) return;

                // A press that travelled is not a tap.
                const travelled = Math.hypot(
                  event.uv.x - from.u,
                  event.uv.y - from.v,
                );
                if (travelled > DRAG_SLOP_UV) return;

                handleTap(from.u, from.v);
              }}
            />
          ) : (
            <VRText fontSize={TEXT.body} color={COLOR.muted}>
              This venue has no floor plan.
            </VRText>
          )}
        </Container>

        <Container
          flexGrow={1}
          flexShrink={1}
          minWidth={0}
          height="100%"
          flexDirection="column"
          gapRow={SPACE.row}
        >
          {/*
            The category pills, ONE ROW THAT SCROLLS SIDEWAYS. Wrapping them
            was what grew the card and pushed the plan over everything else.
          */}
          {groups.length > 1 && (
            <Container
              width="100%"
              height={CHIP_ROW_H}
              flexShrink={0}
              flexDirection="row"
              alignItems="center"
              gapColumn={SPACE.row}
              overflow="scroll"
              scrollbarWidth={0}
            >
              <Chip
                label="All"
                active={category == null}
                onSelect={() => setCategory(null)}
              />
              {groups.map((group) => (
                <Chip
                  key={group}
                  label={group}
                  active={category === group}
                  onSelect={() => setCategory(group)}
                />
              ))}
            </Container>
          )}

          {/*
            The picked place — the site's selected-destination card: a blue
            ring, its number and name, and the one action.
          */}
          {selected && (
            <Container
              width="100%"
              flexShrink={0}
              flexDirection="column"
              gapRow={SPACE.row}
              padding={16}
              borderRadius={RADIUS.card}
              borderWidth={2}
              borderColor={COLOR.accentBright}
              backgroundColor={COLOR.rowActive}
            >
              <Container
                width="100%"
                flexDirection="row"
                alignItems="center"
                gapColumn={SPACE.icon}
              >
                <NumberBadge num={selectedNum} active />
                <VRText
                  flexGrow={1}
                  flexShrink={1}
                  minWidth={0}
                  fontSize={TEXT.name}
                  fontWeight="semi-bold"
                  color={COLOR.text}
                >
                  {selected.title}
                </VRText>
              </Container>
              <PrimaryButton label="Travel here" onSelect={travel} fullWidth />
            </Container>
          )}

          {/* Only the list scrolls; it takes whatever the column has left. */}
          <PanelList>
            {rows.length === 0 ? (
              <VRText fontSize={TEXT.body} color={COLOR.muted}>
                Nothing is pinned in this category.
              </VRText>
            ) : (
              rows.map((row, index) => (
                <MapRow
                  key={row.id}
                  num={index + 1}
                  title={row.title}
                  active={row.destinationId === selectedId}
                  onSelect={() =>
                    setSelectedId((current) =>
                      current === row.destinationId ? null : row.destinationId,
                    )
                  }
                />
              ))
            )}
          </PanelList>
        </Container>
      </Container>
    </VRPanel>
  );
}

/** The round number the plan draws on a pin, repeated beside its name. */
const BADGE = 40;

function NumberBadge({ num, active }: { num: number; active: boolean }) {
  return (
    <Container
      width={BADGE}
      height={BADGE}
      flexShrink={0}
      borderRadius={RADIUS.dot}
      borderWidth={2}
      borderColor="#ffffff"
      backgroundColor={active ? "#0a84ff" : "#161618"}
      alignItems="center"
      justifyContent="center"
      pointerEvents="none"
    >
      <VRText fontSize={TEXT.label} fontWeight="bold" color="#ffffff">
        {String(num)}
      </VRText>
    </Container>
  );
}

/**
 * One place in the plan's list: its pin number and its name, nothing else.
 *
 * DELIBERATELY NOT `MenuRow`. That is a full destination card — icon tile, a
 * second line, a trailing figure and a chevron — and squeezed into the column
 * beside the plan those parts ran into each other. The plan already says where
 * each place is; the list only has to say which number is which.
 *
 * Selects on release without travel, like `MenuRow`, so dragging the list
 * scrolls it instead of picking the row under the ray.
 */
function MapRow({
  num,
  title,
  active,
  onSelect,
}: {
  num: number;
  title: string;
  active: boolean;
  onSelect: () => void;
}) {
  const pressed = useRef(new Map<number, THREE.Vector3>());

  return (
    <Container
      width="100%"
      flexShrink={0}
      flexDirection="row"
      alignItems="center"
      gapColumn={SPACE.icon}
      paddingX={16}
      paddingY={12}
      borderRadius={RADIUS.card}
      backgroundColor={active ? COLOR.here : COLOR.rowRest}
      cursor="pointer"
      hover={{ backgroundColor: active ? COLOR.here : COLOR.tile }}
      onPointerDown={(event) => {
        if (event.pointerId == null) return;
        pressed.current.set(event.pointerId, event.point.clone());
      }}
      onPointerLeave={(event) => {
        if (event.pointerId != null) pressed.current.delete(event.pointerId);
      }}
      onPointerCancel={(event) => {
        if (event.pointerId != null) pressed.current.delete(event.pointerId);
      }}
      onPointerUp={(event) => {
        if (event.pointerId == null) return;
        const from = pressed.current.get(event.pointerId);
        pressed.current.delete(event.pointerId);
        if (from && from.distanceTo(event.point) <= ROW_DRAG_SLOP) onSelect();
      }}
    >
      <NumberBadge num={num} active={active} />
      <VRText
        flexGrow={1}
        flexShrink={1}
        minWidth={0}
        fontSize={TEXT.body}
        fontWeight="semi-bold"
        color={COLOR.text}
        pointerEvents="none"
      >
        {title}
      </VRText>
    </Container>
  );
}

/** A category pill — the site's rounded filter, blue when on. */
function Chip({
  label,
  active,
  onSelect,
}: {
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <Container
      flexShrink={0}
      paddingX={SPACE.rowX}
      paddingY={10}
      borderRadius={RADIUS.dot}
      borderWidth={1}
      borderColor={active ? COLOR.accent : COLOR.rowBorder}
      backgroundColor={active ? COLOR.accent : COLOR.rowRest}
      hover={{ backgroundColor: active ? COLOR.accentHover : COLOR.tile }}
      onPointerDown={onSelect}
    >
      <VRText
        fontSize={TEXT.label}
        color={active ? "#ffffff" : COLOR.muted}
        fontWeight={active ? "semi-bold" : "medium"}
        wordBreak="keep-all"
      >
        {label}
      </VRText>
    </Container>
  );
}
