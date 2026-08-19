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
});
