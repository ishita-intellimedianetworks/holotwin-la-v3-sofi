import { create } from "zustand";

/**
 * view-store — /lighting-only environment mode (Day / Dusk / Night).
 *
 * Lives in its own store, consumed only by the /lighting scene wrapper, so the
 * default route's rendering path is completely unaffected.
 */

export type LightingMode = "day" | "dusk" | "night";

interface LightingState {
  environment: LightingMode;
  setEnvironment: (e: LightingMode) => void;
}

export const useLightingStore = create<LightingState>((set) => ({
  environment: "day",
  setEnvironment: (environment) => set({ environment }),
}));
