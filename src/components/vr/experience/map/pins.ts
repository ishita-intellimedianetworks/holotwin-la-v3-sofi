"use client";

import type * as THREE from "three";
import type { MapHotspot } from "@/components-v5/interior-scene/minmap/utils/draw-fns";
import type { MinimapData } from "@/components-v5/interior-scene/minmap/types/types";
import { navConfig } from "@/components-v5/interior-scene/nav-config";
import {
  etaSeconds,
  fmtEta,
  fmtMeters,
} from "@/components-v5/interior-scene/ui/nav-hud/format";
import { CROWD_DOT } from "@/components-v5/shared/crowd-display";
import type { VRLayout } from "@/components/vr/data";

/**
 * Turning venue data into the dots the flat drawing code expects.
 *
 * Everything here exists so `drawHotspots` can be called unmodified. It wants a
 * `MapHotspot[]` and a `bounds`, and this file produces both from the VR venue
 * shape.
 */

/**
 * The model's bounding box, as the flat map's `bounds`.
 *
 * BOTH AXES ARE REVERSED, and it is not a mistake to tidy up. The flat site
 * publishes `{ minX: bbox.max.x, maxX: bbox.min.x, … }` from
 * `use-minimap-bounds`, which encodes the 180° rotation between world XZ and
 * the orientation these PNGs were rendered at. `worldToPlan` in
 * `hooks/use-model-bounds` documents the same reversal at length and warns what
 * dropping it looks like: markers land diagonally opposite where they belong,
 * which is plausible enough to ship and wrong everywhere except dead centre.
 *
 * Reproducing it here rather than converting to UVs is what lets `worldToPixel`
 * and `pixelToWorld` be imported and used as they are.
 */
export function planBounds(box: THREE.Box3): MinimapData["bounds"] {
  return {
    minX: box.max.x,
    maxX: box.min.x,
    minZ: box.max.z,
    maxZ: box.min.z,
  };
}

/** World-unit XZ distance → the same label the flat cards show. */
export function distanceLabel(units: number): string {
  return fmtMeters(units * navConfig.logic.displayMetersPerUnit);
}

/** World-unit XZ distance → a walking time, at the flat site's pace. */
export function etaLabel(units: number): string {
  return fmtEta(etaSeconds(units, navConfig.logic.displayMetersPerUnit));
}

/** Straight-line XZ distance in world units. */
export const flatDistance = (
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number => Math.hypot(ax - bx, az - bz);

/**
 * One dot per annotation point, numbered per destination.
 *
 * NUMBERED BY DESTINATION, NOT BY DOT, which is why `num` comes from the index
 * of the layout rather than of the pin. A destination with eight restrooms is
 * one row in the list and eight dots all carrying the number 8 — pull them
 * apart and the list beside the plan stops matching it.
 *
 * `labeled` marks only the first pin of each destination for the same reason:
 * in the un-numbered venues every dot would otherwise carry its own name pill,
 * and eight identical pills is not eight pieces of information.
 *
 * THE DISTANCE IS STRAIGHT-LINE. The flat map measures the A* path, which is
 * longer and more honest about a walk. There is no pathfinder here — that is
 * out of scope by choice — so this is the shortest a route could possibly be,
 * which for picking between two gates on a plan is the comparison that matters
 * anyway.
 */
export function buildPins(
  layouts: VRLayout[],
  player: { x: number; z: number },
  numbered: boolean,
  hereId: string | null,
): MapHotspot[] {
  const pins: MapHotspot[] = [];

  layouts.forEach((layout, index) => {
    layout.pins.forEach((pin, pinIndex) => {
      const [x, , z] = pin;
      pins.push({
        // The DESTINATION id, shared by every pin of one destination — a press
        // on any of them selects the same row.
        id: layout.destinationId,
        name: layout.title,
        x,
        z,
        distLabel: distanceLabel(flatDistance(player.x, player.z, x, z)),
        labeled: pinIndex === 0,
        num: numbered ? index + 1 : undefined,
        here: layout.destinationId === hereId,
        crowdColor: layout.crowd ? CROWD_DOT[layout.crowd] : undefined,
      });
    });
  });

  return pins;
}
