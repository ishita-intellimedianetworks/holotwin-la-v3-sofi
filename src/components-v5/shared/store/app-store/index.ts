import { create } from "zustand";

const INTERIOR_INSTRUCTIONS_KEY = "interior_instructions_seen";

interface AppStore {
  /** False while a scene-swap blackout is up; true once the scene is visible.
   *  Gates the interior UI entrance so panels slide in after any blackout
   *  clears. Defaults true so the direct interior route is unaffected. */
  sceneRevealed: boolean;
  setSceneRevealed: (v: boolean) => void;
  /** Persisted flag — once the dollhouse overlay "Enter" is clicked, never show again */
  isInteriorInstructionsSeen: boolean;
  setInteriorInstructionsSeen: () => void;
}

export const useAppStore = create<AppStore>()((set) => ({
  sceneRevealed: true,
  // Read localStorage only on the client; always false on the server (SSR-safe).
  isInteriorInstructionsSeen:
    typeof window !== "undefined" && localStorage.getItem(INTERIOR_INSTRUCTIONS_KEY) === "true",

  setSceneRevealed: (v) => set({ sceneRevealed: v }),
  setInteriorInstructionsSeen: () => {
    try { localStorage.setItem(INTERIOR_INSTRUCTIONS_KEY, "true"); } catch {}
    set({ isInteriorInstructionsSeen: true });
  },
}));
