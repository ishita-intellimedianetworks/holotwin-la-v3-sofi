import { create } from "zustand";

/**
 * world-store — the active model's world bounds (centre + bounding-sphere
 * radius), published by the model loader after each load. The environment
 * reads it to fit the sun + shadow camera and to scale the cloud layer to the
 * model, since the two models live in very different (and very large) world
 * units.
 */
export interface WorldBounds {
  center: [number, number, number];
  radius: number;
}

interface WorldState {
  bounds: WorldBounds | null;
  version: number;
  setBounds: (b: WorldBounds) => void;
}

export const useWorldStore = create<WorldState>((set) => ({
  bounds: null,
  version: 0,
  setBounds: (b) => set((s) => ({ bounds: b, version: s.version + 1 })),
}));
