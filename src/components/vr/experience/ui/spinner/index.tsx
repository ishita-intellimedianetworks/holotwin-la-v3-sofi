"use client";

import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { signal, type Signal } from "@preact/signals-core";
import { Container } from "@react-three/uikit";
import { LoaderCircleIcon } from "@react-three/uikit-lucide";
import { COLOR } from "../tokens";

/**
 * The busy indicator.
 *
 * The angle is a preact SIGNAL, not React state: every uikit property accepts
 * one, and writing to it updates that property in place with no render and no
 * relayout. Through `setState` this would cost 72 uikit layout passes a second.
 */
const DEGREES_PER_SECOND = 220;

/**
 * A plain function outside the component: writing to a value that came out of a
 * hook trips `react-hooks/immutability`, which does not know a signal exists to
 * be written to.
 */
function advance(rotate: Signal<number>, delta: number) {
  rotate.value = (rotate.value - delta * DEGREES_PER_SECOND) % 360;
}

export function Spinner({
  size = 40,
  // `accentBright`, not `accent` — this is a stroke, not a fill.
  color = COLOR.accentBright,
}: {
  size?: number;
  color?: string;
}) {
  // One signal for the life of the component, or the angle resets each render.
  const rotate = useMemo(() => signal(0), []);

  useFrame((_, delta) => advance(rotate, delta));

  return (
    <Container
      width="100%"
      height="100%"
      alignItems="center"
      justifyContent="center"
      // It covers the middle of the panel; it must not catch a press.
      pointerEvents="none"
    >
      <Container
        width={size}
        height={size}
        alignItems="center"
        justifyContent="center"
        transformRotateZ={rotate}
      >
        <LoaderCircleIcon width={size} height={size} color={color} />
      </Container>
    </Container>
  );
}
