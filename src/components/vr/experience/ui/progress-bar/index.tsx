"use client";

import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { signal, type Signal } from "@preact/signals-core";
import { Container } from "@react-three/uikit";
import { COLOR, RADIUS } from "../tokens";

/**
 * A progress bar you can read from inside a headset.
 *
 * TWO MODES, because there are two kinds of wait here and only one of them has
 * a number:
 *
 *   determinate    bytes arriving against a known Content-Length — the fill is
 *                  the fraction, and it only moves forward.
 *   indeterminate  no Content-Length (a tunnel re-frames the response as
 *                  chunked), or a Draco decode, which reports nothing at all.
 *                  A short block sweeps the track instead.
 *
 * The indeterminate sweep is what makes this worth having in VR. A still bar
 * and a finished bar look identical through a headset lens, so a wait with no
 * measurable progress needs MOVEMENT to say it is still alive — otherwise the
 * honest answer ("I don't know how long") is indistinguishable from a hang.
 */

/** Track height in uikit units. Thicker than a DOM bar: this is read at 2 m. */
const HEIGHT = 10;

/** One full sweep of the indeterminate block, in seconds. */
const SWEEP_SECONDS = 1.4;

/** How much of the track the sweeping block covers. */
const BLOCK = 0.3;

/**
 * A plain function outside the component: writing to a value that came out of a
 * hook trips `react-hooks/immutability`, which does not know a signal exists to
 * be written to.
 */
function advance(offset: Signal<`${number}%`>, delta: number) {
  const step = (delta / SWEEP_SECONDS) * (1 + BLOCK) * 100;
  const current = parseFloat(offset.value);
  const next = current + step;
  // Off the right-hand end, back to just off the left-hand end.
  offset.value = `${next > 100 ? -BLOCK * 100 : next}%`;
}

export function ProgressBar({
  percent,
  indeterminate = false,
}: {
  /** 0–100. Ignored when `indeterminate`. */
  percent: number;
  indeterminate?: boolean;
}) {
  /**
   * The sweep position is a preact SIGNAL, not React state.
   *
   * Every uikit property accepts one, and writing to it updates that property
   * in place with no render and no relayout. Through `setState` an animation
   * running at frame rate would cost a uikit layout pass every frame, in a view
   * locked to the user's head — which is the one place a dropped frame is
   * actually felt. `Spinner` does the same thing for the same reason.
   */
  const offset = useMemo<Signal<`${number}%`>>(
    () => signal(`${-BLOCK * 100}%`),
    [],
  );

  useFrame((_, delta) => {
    if (indeterminate) advance(offset, delta);
  });

  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <Container
      width="100%"
      height={HEIGHT}
      flexShrink={0}
      borderRadius={RADIUS.dot}
      backgroundColor={COLOR.rowBorder}
      // The fill is positioned against this and must not spill out of the
      // rounded ends while it sweeps.
      overflow="hidden"
      // Decoration. It sits inside a panel that is already a ray target.
      pointerEvents="none"
    >
      {indeterminate ? (
        <Container
          positionType="absolute"
          positionLeft={offset}
          width={`${BLOCK * 100}%`}
          height="100%"
          borderRadius={RADIUS.dot}
          backgroundColor={COLOR.accentBright}
        />
      ) : (
        <Container
          // A cast because a template literal over a number widens to `string`,
          // while uikit's percentage props are typed as `${number}%`.
          width={`${clamped}%` as `${number}%`}
          height="100%"
          borderRadius={RADIUS.dot}
          backgroundColor={COLOR.accentBright}
        />
      )}
    </Container>
  );
}
