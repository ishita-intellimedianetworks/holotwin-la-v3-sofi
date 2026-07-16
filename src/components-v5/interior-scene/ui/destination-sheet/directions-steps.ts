import { navConfig } from "../../nav-config";
import { fmtMeters } from "../nav-hud/format";

export type StepKind = "straight" | "left" | "right" | "arrive";

export interface DirStep {
  kind: StepKind;
  /** Real-world metres for this leg ("" distance for the arrive step). */
  meters: number;
}

type XZ = { x: number; z: number };

/**
 * Turn-by-turn steps from a preview route, mirroring the turn detection the live
 * nav HUD uses (same `turnMinDeg` + cross-sign convention). Each step is the
 * maneuver that BEGINS a leg plus that leg's length, ending with an "arrive"
 * step — so the panel can render "Continue ahead · 120 m → Turn left · 80 m →
 * Arrive". Distances are display-scale metres (1:1 with the cards / HUD).
 */
export function buildSteps(origin: XZ, preview: XZ[]): DirStep[] {
  const mpu = navConfig.logic.displayMetersPerUnit;
  const turnMinDeg = navConfig.logic.turnMinDeg;
  const rightPos = navConfig.logic.rightIsPositiveCross;

  const pts = [origin, ...preview];
  const seg = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dz = pts[i + 1].z - pts[i].z;
    seg.push({ dx, dz, len: Math.hypot(dx, dz) });
  }
  if (seg.length === 0) return [{ kind: "arrive", meters: 0 }];

  const steps: DirStep[] = [];
  let legLen = 0;
  let kind: StepKind = "straight"; // first leg just heads off

  for (let k = 0; k < seg.length; k++) {
    legLen += seg[k].len;
    const a = seg[k];
    const b = seg[k + 1];
    if (!b) {
      steps.push({ kind, meters: legLen * mpu });
      break;
    }
    const dot = (a.dx * b.dx + a.dz * b.dz) / ((a.len || 1) * (b.len || 1));
    const ang = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
    if (ang >= turnMinDeg) {
      steps.push({ kind, meters: legLen * mpu });
      legLen = 0;
      const cross = a.dz * b.dx - a.dx * b.dz;
      kind = cross > 0 === rightPos ? "right" : "left";
    }
  }

  // Drop hairline legs (< 4 m) that add noise, then close with the arrival.
  const cleaned = steps.filter((s, i) => i === 0 || s.meters >= 4);
  cleaned.push({ kind: "arrive", meters: 0 });
  return cleaned;
}

/** Human label for a step. The arrive step names the destination. */
export function stepLabel(step: DirStep, destName: string): string {
  switch (step.kind) {
    case "left": return "Turn left";
    case "right": return "Turn right";
    case "arrive": return `Arrive — ${destName}`;
    default: return "Continue ahead";
  }
}

export { fmtMeters };
