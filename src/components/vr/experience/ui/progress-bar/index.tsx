"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { signal, type Signal } from "@preact/signals-core";
import { Container } from "@react-three/uikit";
import { RADIUS } from "../tokens";

/**
 * The loading line — the flat site's `HoloTwinHud` bar, drawn in the headset.
 *
 * ONE COLOUR: a faint cyan track, a solid cyan fill (#0fb7ff) and a soft glow
 * around it — the CSS version's `box-shadow`. uikit has no shadows, so the glow
 * is two wider, fainter copies of the fill behind it. (It had a mint head on
 * the leading edge standing in for the site's gradient; VR drops it.)
 *
 * ALWAYS PROGRESSIVE. The number it is given only moves forward (see
 * `../../load-progress`), and the drawn width EASES toward it rather than
 * jumping, which is what the site's `transition: width 120ms` does. A load
 * reads as a line growing, not as a counter ticking.
 */

/** The line itself. Thicker than the site's 2 px: this is read at 2 m. */
const LINE = 6;

/** How far the glow spreads above and below the line, per layer. */
const GLOW_NEAR = 6;
const GLOW_FAR = 14;

/** How quickly the drawn width catches up with the real one, per second. */
const EASE_RATE = 6;

const CYAN = "#0fb7ff";

/**
 * A plain function outside the component: writing to a value that came out of a
 * hook trips `react-hooks/immutability`, which does not know a signal exists to
 * be written to.
 */
function ease(
  width: Signal<`${number}%`>,
  shown: { value: number },
  target: number,
  delta: number,
) {
  const k = 1 - Math.exp(-EASE_RATE * delta);
  shown.value += (target - shown.value) * k;
  if (Math.abs(target - shown.value) < 0.05) shown.value = target;
  width.value = `${shown.value}%`;
}

export function ProgressBar({ percent }: { /** 0–100. */ percent: number }) {
  const target = Math.max(0, Math.min(100, percent));

  /**
   * The drawn width is a preact SIGNAL, not React state: every uikit property
   * accepts one and updates in place with no render or relayout. Through
   * `setState` an animation at frame rate would cost a uikit layout pass every
   * frame, in a view locked to the user's head.
   */
  const width = useMemo<Signal<`${number}%`>>(() => signal("0%"), []);
  const shown = useRef({ value: 0 });

  useFrame((_, delta) => {
    if (shown.current.value !== target)
      ease(width, shown.current, target, delta);
  });

  /** One fill-shaped layer, positioned over the track's left end. */
  const layer = (spread: number, color: string, opacity: number) => (
    <Container
      positionType="absolute"
      positionLeft={0}
      positionTop={-spread}
      width={width}
      height={LINE + spread * 2}
      borderRadius={RADIUS.dot}
      backgroundColor={color}
      opacity={opacity}
    />
  );

  return (
    <Container
      width="100%"
      height={LINE}
      flexShrink={0}
      // Decoration. Nothing here is a target.
      pointerEvents="none"
    >
      {/* The track: the site's `color-mix(… 12%, transparent)`. */}
      <Container
        positionType="absolute"
        width="100%"
        height="100%"
        borderRadius={RADIUS.dot}
        backgroundColor={CYAN}
        opacity={0.16}
      />

      {/* The glow, far then near — the CSS `box-shadow: 0 0 12px`. */}
      {layer(GLOW_FAR, CYAN, 0.12)}
      {layer(GLOW_NEAR, CYAN, 0.28)}

      {/* The line. */}
      <Container
        positionType="absolute"
        positionLeft={0}
        width={width}
        height="100%"
        borderRadius={RADIUS.dot}
        backgroundColor={CYAN}
      />
    </Container>
  );
}
