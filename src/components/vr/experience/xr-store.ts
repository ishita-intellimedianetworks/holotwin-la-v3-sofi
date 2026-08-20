"use client";

import { createXRStore } from "@react-three/xr";

/**
 * The one XR store, at module scope.
 *
 * Its own file so anything can end the session without importing the whole
 * experience tree — the dock's exit button is the obvious caller, but so is any
 * future flow that has to drop out of VR to show something the headset browser
 * owns.
 */
export const store = createXRStore({
  /**
   * Full fixed-foveated rendering: the headset shades the edges of each eye at
   * a lower rate than the centre, where you are actually looking.
   *
   * The device default is no foveation at all. These venues need it — the SoFi
   * model is the heaviest thing on the site and VR draws it twice per frame,
   * once per eye — and the cost is softness in the far periphery, which is not
   * where anyone reads a panel.
   *
   * Fill rate only. It does nothing for the draw-call count.
   */
  foveation: 1,

  /**
   * ASK FOR THE LOWEST FRAME RATE THE HEADSET OFFERS, not the highest.
   *
   * The library's default is `"high"`, and `"high"` resolves to
   * `supportedFrameRates[last]` — 90 Hz on a Quest 2, 120 on a Quest 3. That is
   * the app asking to be given LESS time per frame:
   *
   *   120 Hz →  8.3 ms      90 Hz → 11.1 ms      72 Hz → 13.9 ms
   *
   * These venues cannot make 8.3 ms. `npm run vr:check` puts the village at
   * 2,541k triangles per frame in stereo and the stadium at 2,286k, against a
   * ceiling of 1,000k. A missed deadline in WebXR is not a slow frame, it is NO
   * frame — the compositor reprojects the last one or shows nothing — so a
   * scene that misses most of them strobes or goes black. 72 Hz gives every
   * frame two thirds more time to finish, on a scene where nothing moves except
   * the viewer and the extra smoothness bought nothing.
   *
   * IT IS NOT A FIX. It buys headroom for models that are over budget; the
   * triangles still have to come down. See `scripts/vr-model-check.mjs`.
   *
   * `frameBufferScaling` is the next lever if this is not enough — a number
   * below 1 renders fewer pixels per eye — and it is deliberately not set here
   * because it softens the menu text, which foveation does not.
   */
  frameRate: "low",
});
