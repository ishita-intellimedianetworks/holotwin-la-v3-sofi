"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Container, Image } from "@react-three/uikit";
import { MinusIcon, PlusIcon } from "@react-three/uikit-lucide";
import * as THREE from "three";
import type { ImageRect } from "@/components-v5/interior-scene/minmap/utils/draw-fns";
import {
  pixelToWorld,
  worldToPixel,
} from "@/components-v5/interior-scene/minmap/utils/coord-utils";
import {
  MAX_ZOOM,
  MIN_ZOOM,
} from "@/components-v5/interior-scene/minmap/utils/constants";
import { useVenue } from "@/components/vr/data/venue-provider";
import { useModelBounds } from "@/components/vr/hooks/use-model-bounds";
import { VRPanel } from "../ui/panel";
import { PanelList } from "../ui/panel-list";
import { MenuRow } from "../ui/menu-row";
import { IconButton } from "../ui/icon-button";
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
 * the radius here is generous and the zoom buttons exist to make a crowded
 * cluster reachable rather than to magnify it — `drawHotspots` keeps markers a
 * constant screen size under zoom, so zooming spreads a pile of dots apart.
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

/** A press that travels further than this is a pan, not a tap. In UV units. */
const DRAG_SLOP_UV = 0.012;

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
   * A share of the CANVAS HEIGHT sizes it against the axis that actually
   * constrains it. 42% leaves room for a header, a row of chips and a few rows
   * of list inside the panel's own 80% ceiling. `VRPanel` resolves its width the
   * same way and for the same reason — see `WIDTH_PER_HEIGHT` there.
   */
  const viewportHeight = useThree((state) => state.size.height);
  const mapSize = Math.round(viewportHeight * 0.5);

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

  /** Pan and zoom, as refs: neither belongs in a render. */
  const zoom = useRef(1);
  const offset = useRef({ x: 0, y: 0 });

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

  /**
   * Clamp the pan so the plan cannot be dragged off its own canvas.
   *
   * At 1× there is nothing to pan and the offset is pinned to zero; beyond
   * that the visible window is the canvas divided by the zoom, and the offset
   * may range over whatever is left. Copied in spirit from the flat map's own
   * clamp, which is DOM-free maths.
   */
  const clampPan = useCallback(() => {
    const z = zoom.current;
    const slack = PLAN_TEXELS * (z - 1);
    offset.current.x = THREE.MathUtils.clamp(offset.current.x, -slack, 0);
    offset.current.y = THREE.MathUtils.clamp(offset.current.y, -slack, 0);
  }, []);

  /** Zoom about the middle of the plan, which is where the eye already is. */
  const stepZoom = useCallback(
    (factor: number) => {
      const before = zoom.current;
      const after = THREE.MathUtils.clamp(before * factor, MIN_ZOOM, MAX_ZOOM);
      if (after === before) return;

      // Keep the centre of the view fixed across the change.
      const mid = PLAN_TEXELS / 2;
      offset.current.x = mid - ((mid - offset.current.x) / before) * after;
      offset.current.y = mid - ((mid - offset.current.y) / before) * after;
      zoom.current = after;

      clampPan();
      dirty.current = true;
    },
    [clampPan],
  );

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
        venue.mapListMode,
        nearest,
      ),
      player: { x: _head.x, z: _head.z },
      rotationY: yaw,
      zoom: zoom.current,
      offset: offset.current,
      selectedId: selectedRef.current,
      numbered: venue.mapListMode,
      click: click.current,
    });

    if (click.current && click.current.alpha <= 0) click.current = null;

    plan.texture.needsUpdate = true;
  });

  /**
   * Press state, keyed by pointer so two controllers cannot confuse each other
   * — the same reason `MenuRow` keys its own map that way.
   */
  const press = useRef(
    new Map<number, { u: number; v: number; ox: number; oy: number }>(),
  );

  /** UV on the plate → canvas pixel, then → the plan's own pixel space. */
  const toPlanPixel = useCallback((u: number, v: number) => {
    const rawX = u * PLAN_TEXELS;
    // Canvas Y runs down from the top; UV runs up from the bottom.
    const rawY = (1 - v) * PLAN_TEXELS;

    const cx = (rawX - offset.current.x) / zoom.current;
    const cy = (rawY - offset.current.y) / zoom.current;

    const lb = letterbox.current;
    return { ipx: cx - lb.dx, ipy: cy - lb.dy, lb };
  }, []);

  const handleTap = useCallback(
    (u: number, v: number) => {
      const { ipx, ipy, lb } = toPlanPixel(u, v);

      // The margin around the plan is not the plan.
      if (ipx < 0 || ipy < 0 || ipx > lb.dw || ipy > lb.dh) return;

      // Nearest pin, if one is near enough. The radius shrinks with zoom
      // because the dots are drawn at a constant screen size: at 2x they are
      // half as far apart in plan pixels as they look.
      let best = HIT_PX / zoom.current;
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

  return (
    <VRPanel width="42%" maxHeight="80%" onDismiss={onClose}>
      <PanelHeader
        title="Floor plan"
        subtitle={venue.title}
        onClose={onClose}
      />

      {/* The category filter — the flat map's radio column, laid flat. */}
      {groups.length > 1 && (
        <Container
          width="100%"
          flexShrink={0}
          flexDirection="row"
          flexWrap="wrap"
          gapColumn={SPACE.row}
          gapRow={SPACE.row}
          paddingX={SPACE.listX}
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

      <Container
        width="100%"
        flexShrink={0}
        flexDirection="row"
        alignItems="center"
        justifyContent="center"
        gapColumn={SPACE.row}
        paddingX={SPACE.listX}
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
              handlers live here rather than on a wrapper — `event.uv` is only
              meaningful on the element the ray actually hit.
            */
            onPointerDown={(event) => {
              if (event.pointerId == null || !event.uv) return;
              press.current.set(event.pointerId, {
                u: event.uv.x,
                v: event.uv.y,
                ox: offset.current.x,
                oy: offset.current.y,
              });
            }}
            onPointerMove={(event) => {
              const from =
                event.pointerId == null
                  ? undefined
                  : press.current.get(event.pointerId);
              if (!from || !event.uv || zoom.current === 1) return;

              // Drag to pan, but only when there is something to pan to.
              offset.current.x = from.ox + (event.uv.x - from.u) * PLAN_TEXELS;
              offset.current.y = from.oy - (event.uv.y - from.v) * PLAN_TEXELS;
              clampPan();
              dirty.current = true;
            }}
            onPointerLeave={(event) => {
              if (event.pointerId != null) press.current.delete(event.pointerId);
            }}
            onPointerCancel={(event) => {
              if (event.pointerId != null) press.current.delete(event.pointerId);
            }}
            onPointerUp={(event) => {
              const from =
                event.pointerId == null
                  ? undefined
                  : press.current.get(event.pointerId);
              if (event.pointerId != null) press.current.delete(event.pointerId);
              if (!from || !event.uv) return;

              /*
                A press that travelled is a pan, not a tap — the same
                press-then-release-without-moving test `MenuRow` applies, in UV
                rather than metres because this element's own surface is the
                thing being measured across.
              */
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

        {/* Zoom, as buttons. The sticks belong to walking and turning — taking
            one for the map would make a panel change what the controls mean. */}
        <Container flexShrink={0} flexDirection="column" gapRow={SPACE.row}>
          <IconButton
            icon={<PlusIcon width={26} height={26} color={COLOR.text} />}
            onSelect={() => stepZoom(1.5)}
          />
          <IconButton
            icon={<MinusIcon width={26} height={26} color={COLOR.text} />}
            onSelect={() => stepZoom(1 / 1.5)}
          />
        </Container>
      </Container>

      {selected && (
        <Container
          width="100%"
          flexShrink={0}
          flexDirection="column"
          gapRow={SPACE.row}
          paddingX={SPACE.listX}
        >
          <VRText fontSize={TEXT.body} color={COLOR.text}>
            {selected.title}
          </VRText>
          <PrimaryButton label="Travel here" onSelect={travel} fullWidth />
        </Container>
      )}

      {/*
        The list beside the plan, underneath it instead.
        `mapListMode` venues number their dots and put the names here; the rest
        get the same list anyway, because a scrollable list of names is easier
        to aim at than a dot and costs nothing to include.
      */}
      <PanelList>
        {rows.length === 0 ? (
          <VRText fontSize={TEXT.body} color={COLOR.muted}>
            Nothing is pinned in this category.
          </VRText>
        ) : (
          rows.map((row, index) => (
            <MenuRow
              key={row.id}
              label={venue.mapListMode ? `${index + 1}. ${row.title}` : row.title}
              /*
                THE SUBCATEGORY, NOT THE DISTANCE, and that is a deliberate
                division of labour rather than a shortfall. Distance belongs to
                the plan: `drawHotspots` already prints it on each pin's name
                pill, live, from the same walk that moves the player dot.
                Repeating it here would mean re-rendering this whole list every
                time the player took a step — a uikit layout pass over
                thirty-odd rows, several times a second, to restate something
                already on screen a few centimetres above.
              */
              detail={row.option ?? row.group}
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
    </VRPanel>
  );
}

/** A filter chip. Smaller than a `MenuRow` because there are many in a row. */
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
      paddingY={8}
      borderRadius={RADIUS.chip}
      borderWidth={1}
      borderColor={active ? COLOR.rowBorderActive : COLOR.rowBorder}
      backgroundColor={active ? COLOR.rowActive : COLOR.rowRest}
      hover={{ backgroundColor: COLOR.rowHover }}
      onPointerDown={onSelect}
    >
      <VRText
        fontSize={TEXT.label}
        color={active ? COLOR.accentBright : COLOR.muted}
        wordBreak="keep-all"
      >
        {label}
      </VRText>
    </Container>
  );
}
