/**
 * Departure-board formatting for a transit hub's routes.
 *
 * LIFTED OUT OF `bus-timetable.tsx`. Every function here is a pure string or
 * number transform over `DestinationTransitRoute`, with no JSX and no DOM, so
 * the VR departures panel and the flat one can render the same board from the
 * same maths rather than each inventing a line code.
 *
 * The countdown itself is not here — that is `nextInMin` in
 * `interior-scene/ui/destination-sheet/transit-time.ts`, which is already pure
 * and already importable from anywhere.
 */

import type { DestinationTransitRoute } from "./types";

/** Short line badge code, e.g. "Metro E Line" → "E", "Village Loop" → "VL". */
export function lineCode(route: DestinationTransitRoute): string {
  const metro = /metro\s+([a-z0-9]+)/i.exec(route.name);
  if (route.mode === "train" && metro) return metro[1].toUpperCase();
  const words = route.name.split(/\s+/).filter(Boolean);
  return words
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Mode tag under the badge code. */
export function modeTag(route: DestinationTransitRoute): string {
  if (route.mode === "train") return "METRO";
  if (/shuttle/i.test(route.name)) return "SHTL";
  return "BUS";
}

/**
 * Crowding indicator from seats-left: fewer filled bars = emptier; yellow/red
 * flags busy/full. Mirrors the design's 3-segment occupancy strip.
 *
 * `undefined` is NOT the same as zero here — an unauthored seat count means the
 * route simply does not report occupancy, and it gets the middle, unalarming
 * reading rather than "Full".
 */
export function occupancy(seats: number | undefined): {
  filled: number;
  color: string;
  label: string;
} {
  if (seats === 0) return { filled: 3, color: "#E8453C", label: "Full" };
  if (seats == null) return { filled: 2, color: "#30D158", label: "Seats free" };
  if (seats <= 10) return { filled: 3, color: "#FFD426", label: "Busy" };
  if (seats <= 25) return { filled: 2, color: "#30D158", label: "Seats free" };
  return { filled: 1, color: "#30D158", label: "Plenty of seats" };
}

/** now + N minutes → "9:42". */
export function depClock(now: number, mins: number): string {
  const d = new Date(now + mins * 60000);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}
