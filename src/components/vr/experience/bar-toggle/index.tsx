"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useXRInputSourceState } from "@react-three/xr";
import { useVRState } from "../state";

/**
 * B or Y — the upper face button on either controller — brings a hidden dock
 * back. Only the dock's own hide button puts it away.
 *
 * A HIDDEN DOCK HAS NO BUTTON TO BRING IT BACK, so the way back cannot be on
 * screen: it is a physical button, the same on both hands. Neither B nor Y
 * does anything else in the experience, so a stray press costs nothing.
 */
export function BarToggle() {
  const { barHidden, setBarHidden } = useVRState();
  const left = useXRInputSourceState("controller", "left");
  const right = useXRInputSourceState("controller", "right");
  const wasDown = useRef(false);

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
