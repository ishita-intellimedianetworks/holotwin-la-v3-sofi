import { create } from "zustand";
import type { ResolvedLights } from "@/components-v5/shared/types";

/**
 * lights-store — bridges the in-canvas <SceneLights> with the out-of-canvas
 * lighting controls overlay.
 *
 * A venue whose `lights.controls` is true seeds this store with its resolved
 * lighting values; the overlay panel then edits them live and SceneLights
 * renders from `values` instead of the static config. Seeding is keyed on the
 * venue id so switching venues re-loads that venue's values (and never clobbers
 * a different venue's live edits).
 */
interface LightsState {
  /** True when the active venue requested the live controls panel. */
  enabled: boolean;
  /** The live, editable resolved values. Null until a venue seeds it. */
  values: ResolvedLights | null;
  /** Live shadows on/off toggle (separate from `values` — it's a scene-level
   *  field, not a light value). */
  shadows: boolean;
  /** Venue id the current `values` were seeded from. */
  seedKey: string | null;
  /** Field-level override merged OVER whatever SceneLights would otherwise
   *  render (config or live panel values). Used by the /lighting environment modes
   *  (dusk/night); null — the default — leaves rendering exactly as before. */
  override: Partial<ResolvedLights> | null;
  /** Set by the /lighting dusk/night modes: hides the drifting cloud layer (clouds
   *  read as daytime) and keeps the first-person backdrop black (their sky
   *  dome fades in over it instead of the day blue). False — the default —
   *  leaves rendering as before. */
  cloudsHidden: boolean;
  /** (Re)seed for a venue. No-op if the same venue is already seeded so live
   *  edits survive unrelated re-renders. */
  seed: (key: string, values: ResolvedLights, enabled: boolean, shadows: boolean) => void;
  /** Patch a single field from the controls panel. */
  setField: <K extends keyof ResolvedLights>(k: K, v: ResolvedLights[K]) => void;
  /** Toggle shadows on/off from the controls panel. */
  setShadows: (v: boolean) => void;
  /** Set (or clear, with null) the environment-mode override. */
  setOverride: (o: Partial<ResolvedLights> | null) => void;
  /** Show/hide the cloud layer + day backdrop (environment-mode driven). */
  setCloudsHidden: (v: boolean) => void;
}

export const useLightsStore = create<LightsState>((set) => ({
  enabled: false,
  values: null,
  shadows: true,
  seedKey: null,
  override: null,
  cloudsHidden: false,
  seed: (key, values, enabled, shadows) =>
    set((s) => (s.seedKey === key ? { enabled } : { seedKey: key, values, enabled, shadows })),
  setField: (k, v) =>
    set((s) => (s.values ? { values: { ...s.values, [k]: v } } : {})),
  setShadows: (v) => set({ shadows: v }),
  setOverride: (o) => set({ override: o }),
  setCloudsHidden: (v) => set({ cloudsHidden: v }),
}));
