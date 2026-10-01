"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/**
 * An offscreen 2D canvas and the texture that shows it.
 *
 * THE FLOOR PLAN IS DRAWN, NOT MODELLED, and it is drawn by the flat site's own
 * code. `minmap/utils/draw-fns.ts` touches nothing but a
 * `CanvasRenderingContext2D` — no window, no document, no devicePixelRatio, no
 * CSS variables — so the whole 650-line drawing layer imports into a headset
 * unchanged. Every pin, pill, leader line and declutter pass is the same code
 * the flat map runs, which is the only way the two views can be guaranteed to
 * agree about where a gate is.
 *
 * WHAT DOES NOT COME ACROSS is the DOM around it: the canvas element, the
 * resize observer, the device-pixel-ratio transform, the wheel and touch
 * handlers. Those are replaced here and in `./index`.
 *
 * NO DPR TRANSFORM. The flat map sizes its backing store to the display size
 * times `window.devicePixelRatio` and scales the context to match, because a
 * CSS pixel is not a device pixel. A texture has no CSS size — it has texels,
 * and how many of them land on a headset's retina depends on how close you
 * hold the panel. So the size is chosen outright and the drawing code is handed
 * it as its width and height, which is what its `markerScale` and `zoom`
 * arguments are for.
 */

/**
 * Texels on a side. 1024 rather than 2048: the panel is a little over half a
 * metre wide at arm's length and a Quest 3 resolves roughly 20 pixels per
 * degree, so 2048 would be storing detail the display cannot show while
 * costing four megabytes of GPU memory on a device that drops the whole
 * context when it runs out. See the context-loss note in `../index`.
 */
export const PLAN_TEXELS = 1024;

/**
 * Margin for the sticker labels, in canvas pixels, matching the flat map's
 * intent: the plan shrinks to leave a strip for labels that would otherwise be
 * drawn off the edge. Scaled up from the flat map's 4 px because this canvas is
 * about three times its size.
 */
export const PLAN_MARGIN = 12;

export interface PlanCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  /** The floor-plan PNG, once it has decoded. `null` until then. */
  imageRef: { current: HTMLImageElement | null };
}

/**
 * Build the canvas, the context and the texture once, and load the plan into
 * it.
 *
 * ONE OF EACH FOR THE LIFE OF THE PANEL. A texture is a GPU allocation and
 * rebuilding it per venue would leak one per switch unless every path disposed
 * it; instead the same canvas is redrawn and `needsUpdate` re-uploads it. The
 * image is the only thing that changes when the venue does.
 */
export function usePlanCanvas(
  imageUrl: string | undefined,
  /**
   * Set when the PNG arrives. The panel only redraws when something is dirty
   * or the head moves, so without this a viewer holding still kept a plate
   * with pins and no plan until they looked away.
   */
  dirty?: { current: boolean },
): PlanCanvas | null {
  const imageRef = useRef<HTMLImageElement | null>(null);

  /**
   * A LAZY INITIALISER, NOT A MEMO. `useMemo` is a hint the compiler is allowed
   * to discard and recompute, which for a value holding a GPU allocation would
   * mean quietly leaking a texture per render. `useState`'s initialiser is
   * guaranteed to run exactly once for the life of the component, which is the
   * actual requirement here.
   */
  const [plan] = useState<PlanCanvas | null>(() => {
    // Server render, or a venue with no plan — the hotel room has none.
    if (typeof document === "undefined") return null;

    const canvas = document.createElement("canvas");
    canvas.width = PLAN_TEXELS;
    canvas.height = PLAN_TEXELS;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const texture = new THREE.CanvasTexture(canvas);
    /**
     * sRGB, or the plan comes out washed. Everything else in the scene is a
     * glTF texture that three tags for us; a canvas is raw and defaults to the
     * linear working space, which renders a mid grey as near-white.
     */
    texture.colorSpace = THREE.SRGBColorSpace;
    /**
     * No mipmaps. The panel is viewed roughly head-on at a roughly fixed
     * distance, so a mip chain would be generated on every single redraw —
     * which is every frame the player moves — to serve levels nothing samples.
     */
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    return { canvas, ctx, texture, imageRef };
  });

  /** Dispose on unmount — a CanvasTexture holds a GPU allocation. */
  useEffect(() => {
    if (!plan) return;
    return () => plan.texture.dispose();
  }, [plan]);

  /**
   * Load the plan PNG — from the preload cache, so the map is normally drawn
   * complete on the frame it opens instead of pins-first with the plan landing
   * a second later. See `preloadPlanImage`.
   */
  useEffect(() => {
    if (!plan || !imageUrl) {
      imageRef.current = null;
      return;
    }

    let cancelled = false;
    void preloadPlanImage(imageUrl).then((img) => {
      if (cancelled || !img) return;
      imageRef.current = img;
      if (dirty) dirty.current = true;
    });

    return () => {
      cancelled = true;
      imageRef.current = null;
    };
  }, [plan, imageUrl, dirty]);

  return plan;
}

/** Decoded plan images by url, for the life of the page. Three small PNGs. */
const planImages = new Map<string, Promise<HTMLImageElement | null>>();

/**
 * Fetch AND DECODE a floor plan ahead of the map opening.
 *
 * Called when a venue loads, so by the time anyone presses the map button the
 * PNG is already a bitmap. Loading it on open was what made the plan arrive
 * late or not at all on a headset: a 0.5–0.9 MB PNG decoded lazily on the
 * first `drawImage`, on the main thread, inside a frame.
 *
 * Same-origin `/floorplan/*.png`, so no `crossOrigin` and no CORS taint. A
 * failed load resolves to null and the panel draws its empty state rather
 * than throwing — a missing PNG should cost the map, not the session.
 */
export function preloadPlanImage(url: string): Promise<HTMLImageElement | null> {
  const cached = planImages.get(url);
  if (cached) return cached;

  const img = new Image();
  img.decoding = "async";
  img.src = url;
  const loaded = img
    .decode()
    .then(() => img)
    .catch(() => {
      console.error(`[VR] floor plan failed to load: ${url}`);
      // Not cached as a failure: the next open tries again.
      planImages.delete(url);
      return null;
    });
  planImages.set(url, loaded);
  return loaded;
}
