"use client";

import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useXRInputSourceState } from "@react-three/xr";
import * as THREE from "three";

/**
 * Spin the doll house with the LEFT thumbstick.
 *
 * The right hand is the pointer: its trigger is what steps you into the model
 * and what presses the dock. Leaving its stick unbound means aiming and turning
 * cannot fight each other — and it matches first person, where the left stick
 * moves you and the right hand selects, so the same hand does the same kind of
 * job in both views.
 *
 * Tilt is clamped; without it you can roll the model over and lose which way is
 * up.
 */
const SPEED = 1;

/** Below this the stick is centred. Matches `locomotion`'s own deadzone. */
const DEADZONE = 0.15;

export function useDollHouseRotation(
  modelRef: RefObject<THREE.Group | null>,
  enabled: boolean,
  /** [min, max] in DEGREES. */
  tiltRange: [number, number] = [12, 90],
) {
  const left = useXRInputSourceState("controller", "left");

  useFrame((_, delta) => {
    const model = modelRef.current;
    if (!model || !enabled) return;

    /**
     * THE LEFT STICK, AND ONLY THE LEFT STICK.
     *
     * Worth stating because the tempting version — `right?.gamepad?.[…] ??
     * left?.gamepad?.[…]` — silently means the right one alone: `??` falls
     * through on null, and a controller's thumbstick OBJECT exists for as long
     * as that controller is connected, centred or not. The left branch would be
     * unreachable whenever both controllers are on, which is always.
     */
    const stick = left?.gamepad?.["xr-standard-thumbstick"];

    const x = stick?.xAxis ?? 0;
    const y = stick?.yAxis ?? 0;
    if (Math.hypot(x, y) < DEADZONE) return;

    model.rotation.y += x * delta * SPEED;
    model.rotation.x = THREE.MathUtils.clamp(
      model.rotation.x + y * delta * SPEED,
      THREE.MathUtils.degToRad(Math.min(tiltRange[0], tiltRange[1])),
      THREE.MathUtils.degToRad(Math.max(tiltRange[0], tiltRange[1])),
    );
  });
}
