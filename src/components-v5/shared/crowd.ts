/**
 * Crowd congestion — one shared model for every surface (3D area blocks, the
 * minimap, and the UI badge). Congestion is authored in scenes.json as a few
 * circular zones (world XZ); this module is the single sampler + palette so the
 * route stays plain blue and only the crowded patches read green/amber/red.
 */
import type { CrowdLevel, CrowdZone } from "./types";

export const CROWD_COLOR: Record<CrowdLevel, string> = {
  low: "#4a9d6e",
  med: "#f5a623",
  high: "#e8453c",
};

/** Short label for the UI badge — matches the wayfinding design. */
export const CROWD_LABEL: Record<CrowdLevel, string> = {
  low: "Clear",
  med: "Moderate",
  high: "Heavy",
};

const RANK: Record<CrowdLevel, number> = { low: 0, med: 1, high: 2 };

/** Worst congestion level at world (x,z), or null if outside every zone. */
export function sampleCrowdLevel(
  zones: CrowdZone[] | undefined,
  x: number,
  z: number,
): CrowdLevel | null {
  if (!zones?.length) return null;
  let best: CrowdLevel | null = null;
  let bestRank = -1;
  for (const zn of zones) {
    const dx = x - zn.center[0];
    const dz = z - zn.center[1];
    if (dx * dx + dz * dz <= zn.radius * zn.radius && RANK[zn.level] > bestRank) {
      bestRank = RANK[zn.level];
      best = zn.level;
    }
  }
  return best;
}
