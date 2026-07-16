// stores/useOrientation.ts
import { create } from "zustand";

type OrientationState = {
  isLandscape: boolean;
  setLandscape: (val: boolean) => void;
};

export const useOrientation = create<OrientationState>((set) => ({
  isLandscape: true,
  setLandscape: (val) => set({ isLandscape: val }),
}));