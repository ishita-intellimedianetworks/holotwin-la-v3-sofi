/**
 * Live "next departure" timing for a transit route, derived purely from its
 * headway + a stable per-route phase offset (no real schedule). Shared by the
 * selected-destination transit hop and the on-arrival bus/train timetable so
 * both show the same countdown for the same route.
 */

/** A stable 0..headway phase offset hashed from a seed, so each route's
 *  countdown is staggered (not all arriving on the same minute). */
function routeOffset(seed: string, headway: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % headway;
}

/** Minutes until the next departure of a route with the given headway. */
export function nextInMin(headway: number, seed: string, now: number): number {
  const mins = now / 60000 + routeOffset(seed, headway);
  return Math.max(1, Math.ceil(headway - (mins % headway)));
}
