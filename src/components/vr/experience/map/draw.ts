"use client";

import {
  drawClickMarker,
  drawFloorPlan,
  drawHotspots,
  drawPlayerFOV,
  type ImageRect,
  type MapHotspot,
} from "@/components-v5/interior-scene/minmap/utils/draw-fns";
import type { MinimapData } from "@/components-v5/interior-scene/minmap/types/types";
import { DEFAULT_MAP_SIZE } from "@/components-v5/interior-scene/minmap/utils/constants";
import { PLAN_MARGIN, PLAN_TEXELS } from "./plan-canvas";

/**
 * One frame of the floor plan, drawn with the flat site's own functions.
 *
 * THE ORDER AND THE NESTING ARE COPIED DELIBERATELY from the flat draw loop
 * (`use-minimap.ts`), because both are load-bearing. The pan/zoom transform
 * wraps everything so the plan and its pins move together; the letterbox
 * translate wraps only the overlays, because `drawFloorPlan` returns where the
 * image actually landed and every world-to-pixel mapping below it is relative
 * to that rect rather than to the canvas.
 *
 * WHAT IS NOT DRAWN HERE, and why:
 *
 *   - THE ROUTE (`drawPath`). There is no pathfinder in VR by choice, so there
 *     is no polyline to draw. Not a stub, not an empty line — the map simply
 *     shows where things are rather than how to walk to them.
 *   - THE CROWD ZONES. The flat loop fills `crowdFlowZones` from the heat-map
 *     mesh, and that mesh is never configured: no scene in `scenes.json`
 *     defines `crowdFlowGlb`, so the array it reads is empty in every venue.
 *     Drawing from it would be drawing nothing, carefully. The authored crowd
 *     data reaches the map the way it reaches the cards — as the pin's own
 *     colour, via `MapHotspot.crowdColor`.
 *   - THE STICKERS. `MinimapData.stickers` are authored per floor in the flat
 *     scene config and no venue in `scenes.json` carries any.
 */

/**
 * Marker size, rescaled for a canvas three times the flat map's.
 *
 * THE FLAT MAP'S 1.25 IS NOT A PORTABLE NUMBER. It is a multiplier over a
 * canvas that is `DEFAULT_MAP_SIZE` (330) logical pixels on a side, and the
 * drawing code sizes dots, pills and the player cone against it directly. This
 * canvas is 1024 texels, so passing 1.25 draws everything at roughly a third of
 * the size it has on the flat map — legible on a desktop monitor a foot away,
 * and a scattering of specks through a headset.
 *
 * Expressing it as the flat proportion times the size ratio keeps the two maps
 * looking alike, and keeps `PLAN_TEXELS` free to change without silently
 * shrinking every pin.
 */
const MARKER_SCALE = 1.25 * (PLAN_TEXELS / DEFAULT_MAP_SIZE);

export interface ClickMarker {
  px: number;
  py: number;
  alpha: number;
}

export interface DrawPlanArgs {
  ctx: CanvasRenderingContext2D;
  /** Canvas size in texels — square, see `PLAN_TEXELS`. */
  size: number;
  image: HTMLImageElement | null;
  bounds: MinimapData["bounds"];
  pins: MapHotspot[];
  player: { x: number; z: number };
  /** Player yaw in radians, as the flat controller reports it. */
  rotationY: number;
  zoom: number;
  offset: { x: number; y: number };
  selectedId: string | null;
  /** Numbered dots tied to a list, instead of name pills. `mapListMode`. */
  numbered: boolean;
  /** The fading ripple from the last press, mutated in place as it fades. */
  click: ClickMarker | null;
}

/**
 * Draws, and returns where the plan image landed.
 *
 * THE RETURN VALUE IS NOT INCIDENTAL — it is what a press is decoded against.
 * A press arrives as a UV on the panel, which becomes a canvas pixel, which
 * only means something once the letterbox rect says which part of the canvas is
 * plan and which part is margin. Keeping the rect as this function's output
 * rather than recomputing it at press time is what guarantees the two agree
 * even mid-zoom.
 */
export function drawPlan(args: DrawPlanArgs): ImageRect {
  const {
    ctx,
    size,
    image,
    bounds,
    pins,
    player,
    rotationY,
    zoom,
    offset,
    selectedId,
    numbered,
    click,
  } = args;

  /**
   * High-quality interpolation for the plan PNG. The source is roughly
   * 1000 px on a side and is being drawn into a 1024-texel square, so the
   * resampling is gentle — but the browser default is inconsistent and reads
   * as soft, and unlike the flat map there is no CSS here to blame.
   */
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  /**
   * Cleared every frame rather than painted over. The plan is letterboxed
   * inside a square canvas, so the bands beside it are never covered by the
   * image — without this, zooming and panning accumulate stale copies and the
   * plan appears several times at once.
   */
  ctx.clearRect(0, 0, size, size);

  ctx.save();
  ctx.translate(offset.x, offset.y);
  ctx.scale(zoom, zoom);

  const lb: ImageRect = image
    ? drawFloorPlan(ctx, image, size, size, PLAN_MARGIN, PLAN_MARGIN)
    : {
        dx: PLAN_MARGIN,
        dy: PLAN_MARGIN,
        dw: Math.max(1, size - 2 * PLAN_MARGIN),
        dh: Math.max(1, size - 2 * PLAN_MARGIN),
      };

  // Everything below is in image-relative space.
  ctx.save();
  ctx.translate(lb.dx, lb.dy);

  if (pins.length) {
    /**
     * `zoom` is passed so the drawing code can divide by it: markers are under
     * the zoom transform, so keeping them a constant screen size makes zooming
     * SPREAD a cluster of dots apart rather than magnify the pile-up. That is
     * the whole reason to zoom a plan with 36 pins on it.
     */
    drawHotspots(
      ctx,
      pins,
      bounds,
      lb.dw,
      lb.dh,
      MARKER_SCALE,
      selectedId,
      numbered,
      zoom,
    );
  }

  drawPlayerFOV(ctx, player, rotationY, bounds, lb.dw, lb.dh, MARKER_SCALE);

  if (click) {
    drawClickMarker(ctx, click, MARKER_SCALE);
    click.alpha -= 0.02;
  }

  ctx.restore(); // image-relative
  ctx.restore(); // pan + zoom

  return lb;
}
