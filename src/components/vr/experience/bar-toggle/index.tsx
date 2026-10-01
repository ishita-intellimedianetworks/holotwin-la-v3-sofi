"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useXR, useXRInputSourceState } from "@react-three/xr";
import { useVRState } from "../state";

/**
 * When the last pinch brought the dock back, in `performance.now()` ms.
 *
 * THAT PINCH IS SPENT. The same pinch is also the hand ray's press, so without
 * this it would bring the dock back AND press whatever the ray was on — step
 * into the doll house, open a marker. Scene press handlers ask
 * `pressWasSpentOnDock` and ignore a press that arrives with it.
 */
let dockPinchAt = -Infinity;
const SPENT_WINDOW_MS = 250;

export function pressWasSpentOnDock(): boolean {
  return performance.now() - dockPinchAt < SPENT_WINDOW_MS;
}

/**
 * B or Y — the upper face button on either controller — brings a hidden dock
 * back. Only the dock's own hide button puts it away.
 *
 * A HIDDEN DOCK HAS NO BUTTON TO BRING IT BACK, so the way back cannot be on
 * screen: it is a physical button, the same on both hands. Neither B nor Y
 * does anything else in the experience, so a stray press costs nothing.
 *
 * HANDS HAVE NO B OR Y. With the controllers put down, a pinch is the only
 * input there is, so while the dock is hidden any hand pinch brings it back —
 * otherwise hiding it with a hand is a one-way trip and the system menu is the
 * only exit.
 */
export function BarToggle() {
  const { barHidden, setBarHidden } = useVRState();
  const left = useXRInputSourceState("controller", "left");
  const right = useXRInputSourceState("controller", "right");
  const session = useXR((s) => s.session);
  const wasDown = useRef(false);

  // Read by the session listener, registered once per session.
  const hiddenRef = useRef(barHidden);
  useEffect(() => {
    hiddenRef.current = barHidden;
  }, [barHidden]);

  useEffect(() => {
    if (!session) return;
    const onSelectStart = (event: XRInputSourceEvent) => {
      if (event.inputSource.hand && hiddenRef.current) {
        dockPinchAt = performance.now();
        setBarHidden(false);
      }
    };
    session.addEventListener("selectstart", onSelectStart);
    return () => session.removeEventListener("selectstart", onSelectStart);
  }, [session, setBarHidden]);

  useFrame(() => {
    const down =
      left?.gamepad?.["y-button"]?.state === "pressed" ||
      right?.gamepad?.["b-button"]?.state === "pressed";
    // On the press, not while held — or it would flicker every frame.
    if (down && !wasDown.current && barHidden) setBarHidden(false);
    wasDown.current = down;
  });

  return null;
}
