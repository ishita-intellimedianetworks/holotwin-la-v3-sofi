/**
 * Seat-view destinations → a top-down bowl plot.
 *
 * LIFTED OUT OF `seat-map.tsx`'s `useMemo` so the VR seat picker can place the
 * same sections in the same relative positions as the flat SVG. The maths is
 * unchanged; only the packaging moved.
 *
 * WHY IT TRAVELS AND THE SVG DOES NOT: this is a normalisation, not a drawing.
 * It maps each section's real world XZ into a fixed box, which an `<svg>` can
 * render as `<circle cx cy>` and a uikit panel can render as absolutely
 * positioned containers. uikit has no SVG primitive, so the VR side rebuilds the
 * marks — but it must not rebuild the placement, or the two views would
 * disagree about where the north stand is.
 *
 * The output box is in the flat map's viewBox units, because that is what the
 * existing SVG expects and changing it would move every section in the DOM for
 * no reason. VR scales the numbers to its own panel size.
 */

import type { Destination } from "./types";

/** SVG canvas. Wider than tall to match the bowl footprint (X span ≫ Z span). */
export const SEAT_VB_W = 340;
export const SEAT_VB_H = 224;
export const SEAT_PAD = 30;

export interface SeatPlot {
  /** One entry per seat destination that carries a camera, in input order. */
  seats: { dest: Destination; px: number; py: number }[];
  /** The centroid of every section — where the pitch/field marker goes. */
  field: { px: number; py: number };
  innerW: number;
  innerH: number;
}

/**
 * Plot the sections, or `null` when not one of them carries a camera.
 *
 * NULL RATHER THAN AN EMPTY PLOT: a bowl with no seats in it is a drawing of
 * nothing, and both callers want to fall back to something else rather than
 * render an empty ellipse.
 *
 * The span guards (`Math.max(1, …)`) matter for a venue with a single authored
 * seat view, where the extent is zero and the mapping would divide by it.
 */
export function layoutSeats(dests: Destination[]): SeatPlot | null {
  const pts = dests.flatMap((p) =>
    p.camera ? [{ dest: p, x: p.camera.position[0], z: p.camera.position[2] }] : [],
  );
  if (pts.length === 0) return null;

  const xs = pts.map((p) => p.x);
  const zs = pts.map((p) => p.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const spanX = Math.max(1, maxX - minX);
  const spanZ = Math.max(1, maxZ - minZ);
  const innerW = SEAT_VB_W - 2 * SEAT_PAD;
  const innerH = SEAT_VB_H - 2 * SEAT_PAD;

  const map = (x: number, z: number) => ({
    px: SEAT_PAD + ((x - minX) / spanX) * innerW,
    py: SEAT_PAD + ((z - minZ) / spanZ) * innerH,
  });

  const seats = pts.map((p) => ({ dest: p.dest, ...map(p.x, p.z) }));
  const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const cz = zs.reduce((a, b) => a + b, 0) / zs.length;

  return { seats, field: map(cx, cz), innerW, innerH };
}
