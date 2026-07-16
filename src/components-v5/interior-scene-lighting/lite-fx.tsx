"use client";

/**
 * LiteFx — the /lighting-lite vignette, with ZERO per-frame GPU work.
 *
 * With post={false} the rig mounts no EffectComposer, and nothing here may
 * lean on the GPU either — no canvas passes and no backdrop-filter (a
 * backdrop filter re-filters the live canvas every frame on the compositor:
 * a hidden fullscreen pass, exactly the per-device cost the lite route
 * exists to avoid). What remains of the composer's cinematic set:
 *
 *   • Vignette → this pointer-transparent radial-gradient div. A plain
 *     gradient is rasterised ONCE and then alpha-blended like any other UI
 *     element (the dock, the overlays) — no per-frame filter work on any
 *     device. It fades with a CSS opacity transition timed like the
 *     sky-dome ease.
 *   • Grade (contrast/saturation) → not an overlay any more: baked into the
 *     scene recipe itself. ENV_MODES[mode].lite swaps in lower ambient/hemi
 *     fill (see presets) so shadows deepen the way the grade's contrast
 *     term darkened them — plain light-uniform writes, nothing extra drawn.
 *   • Bloom → dropped entirely: /lighting-lite is /lighting minus the
 *     composer, and the scene recipe (real fixture lights, boosted
 *     emissives) carries the night look on its own. (LiteGlow's small
 *     glow buffer survives behind LITE_GLOW in view-rig, off by default.)
 */

import { useState } from "react";
import { ENV_MODES, type EnvMode } from "./presets";
import { useLightingStore } from "./view-store";

// Matches SKY_FADE_SEC in view-rig.tsx — the sky/fog ease the vignette rides.
const FADE_MS = 1600;

export default function LiteFx() {
  const mode = useLightingStore((s) => s.environment);
  const fx = ENV_MODES[mode].fx;

  // Keep the last real recipe so a switch to Day (fx: undefined) eases the
  // vignette OUT under its old shape instead of popping (the FadingSky /
  // ModeFog pattern). ENV_MODES is static, so identity comparison is stable.
  const [last, setLast] = useState<NonNullable<EnvMode["fx"]> | null>(fx ?? null);
  if (fx && fx !== last) setLast(fx);
  if (!last) return null;

  const { vignette } = last;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        opacity: fx ? 1 : 0,
        transition: `opacity ${FADE_MS}ms ease`,
        background: `radial-gradient(ellipse at center, rgba(0,0,0,0) ${Math.round(
          vignette.offset * 100,
        )}%, rgba(0,0,0,${vignette.darkness}) 135%)`,
      }}
    />
  );
}
