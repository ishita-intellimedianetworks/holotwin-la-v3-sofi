import { create } from "zustand";

type ProgressState = {
  progress: number;
  /**
   * Smoothed monotonic load progress in [0..1]. Single source of truth for
   * the HUD bar AND the in-scene reveal (glow / model dither) uniforms, so
   * they cannot drift out of sync. Written from inside the R3F canvas by
   * ProgressSmoother (uses useFrame), read by HUD and ScenePreview.
   */
  revealProgress: number;
  isLoaded: boolean;
  isRevealed: boolean;
  /**
   * Byte-level cache-warming progress in [0..1]. Driven by CacheWarmer, which
   * prefetches every apartment's floor[0] (model + navmesh + plan PNG) and the
   * furniture library into the browser HTTP cache during the initial exterior
   * load. Feeds the unified loading bar alongside the exterior download so the
   * user sees ONE bar that covers both. Session-lifetime — NOT cleared by
   * reset() (the cache stays warm for the whole session).
   */
  prefetchProgress: number;
  /** True once CacheWarmer has finished warming every apartment asset. Gates
   *  both the loading-bar completion and the exterior reveal so the "one big
   *  bar" waits for the cache to be fully warm. Session-lifetime. */
  assetsWarmed: boolean;

  setProgress: (p: number) => void;
  setRevealProgress: (p: number) => void;
  setLoaded: (v: boolean) => void;
  setRevealed: (v: boolean) => void;
  setPrefetchProgress: (p: number) => void;
  setAssetsWarmed: (v: boolean) => void;
  reset: () => void;
};

export const useProgressStore = create<ProgressState>((set) => ({
  progress: 0,
  revealProgress: 0,
  isLoaded: false,
  isRevealed: false,
  prefetchProgress: 0,
  assetsWarmed: false,

  setProgress: (p) => set((state) => ({ progress: Math.max(state.progress, p) })),
  setRevealProgress: (p) => set((state) => ({ revealProgress: Math.max(state.revealProgress, p) })),
  setLoaded: (v) => set({ isLoaded: v }),
  setRevealed: (v) => set({ isRevealed: v }),
  // Monotonic — warming only ever moves forward.
  setPrefetchProgress: (p) => set((state) => ({ prefetchProgress: Math.max(state.prefetchProgress, p) })),
  setAssetsWarmed: (v) => set({ assetsWarmed: v }),

  // NOTE: prefetchProgress / assetsWarmed are deliberately NOT reset here —
  // the HTTP cache stays warm for the whole session, so the warm-all pass runs
  // once and its progress must survive scene resets (interior nav, int→ext).
  reset: () =>
    set({
      progress: 0,
      revealProgress: 0,
      isLoaded: false,
      isRevealed: false,
    }),
}));