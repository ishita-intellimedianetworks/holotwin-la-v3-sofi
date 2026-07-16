/**
 * mode-anim — the shared per-frame animation state of a Day/Dusk/Night
 * transition. ONE writer (SunCycle's useFrame) and many readers (the rig's
 * fixture/emissive/hemi writes, LiteGlow's composite, LiteBakedLights'
 * sprites), all mutating/reading a plain module singleton so the whole
 * choreography stays off React state — no re-renders, no allocations.
 *
 * The realism choreography lives in the WRITER: the sun phase (direction /
 * colour / exposure / hemi) runs over the full transition, while the lamp
 * phase (`lampK`, and every value derived from it below) is staggered like
 * real street lights — turning ON only once the sun is already low
 * (day→dusk/night), turning OFF early while the sun comes back up
 * (→day), and tracking the sun 1:1 on a dusk↔night switch.
 */
import type { LightingMode } from "./view-store";

export interface ModeAnimState {
  /** Which mode's ENVIRONMENT (PMREM sky / venue HDR + clouds visibility)
   *  should currently be applied. SunCycle flips this at the transition's
   *  MIDPOINT — the envIntensity dip's trough — so the un-crossfadable
   *  texture swap lands where it's least visible instead of jerking the
   *  whole scene fill at click time. The rig applies it in useFrame. */
  envMode: LightingMode;
  /** Eased 0..1 progress of the LAMP phase of the current transition —
   *  per-material emissive lerps (view-rig) interpolate their captured
   *  from→to values with this. 1 = settled. */
  lampK: number;
  /** Animated fixture multiplier (the real lights' intensity scale AND the
   *  lite spill sprites' opacity scale — ENV_MODES.fixtureMul, eased). */
  fixtureMul: number;
  /** Animated bloom drive for LiteGlow's composite (0 = overlay hidden). */
  bloomIntensity: number;
  bloomThreshold: number;
  /** Animated twilight/moonlight hemisphere fill intensity. */
  hemiIntensity: number;
}

export const modeAnim: ModeAnimState = {
  envMode: "day",
  lampK: 1,
  fixtureMul: 0,
  bloomIntensity: 0,
  bloomThreshold: 0.75,
  hemiIntensity: 0,
};
