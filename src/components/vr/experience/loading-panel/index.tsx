"use client";

import { useThree } from "@react-three/fiber";
import { Container } from "@react-three/uikit";
import { useVenueLoad } from "../load-progress";
import { VRFullscreen } from "../ui/fullscreen";
import { ProgressBar } from "../ui/progress-bar";
import { COLOR, POINTER_ORDER, SPACE, TEXT } from "../ui/tokens";
import { VRText } from "../ui/text";

/**
 * The in-world wait — what you see through the headset while a venue loads.
 *
 * NO CARD. It used to sit on the shared `VRPanel`, which gave it a glass
 * surface, a border and a fixed 38% × 24% box, and all three were wrong for
 * this one thing. A panel is a surface you ACT on: it takes the ray, it dims
 * what is behind it, it is sized so a list can be read. This takes no input and
 * has three lines in it, so the card was a large empty frame drawn around a
 * short bar — furniture with nothing to hold.
 *
 * What is left is what the wait actually is: the venue's name, a short bar, and
 * the percentage. Nothing else is on screen at the time, so there is nothing
 * for a background to separate it from.
 *
 * IT CARRIES A REAL BAR, fed by the same byte counter the DOM gate reads (see
 * `../load-progress`). It briefly did not, on the argument that the number is
 * already on the gate and nobody can act on it anyway. That argument is wrong
 * for the case this exists for: switching venue from inside a session has no
 * gate, the headset is on, and a spinner alone gives no sense of whether a
 * nine-megabyte model is nearly there or has stalled. In a headset that
 * ambiguity is worse than on a screen — you cannot glance at anything else
 * while you wait.
 */

/**
 * How wide the bar is, as a share of the viewport HEIGHT.
 *
 * Of the height, not the width, for the reason spelled out in `../ui/panel`: in
 * an immersive session the canvas is both eyes side by side, so anything sized
 * against its width comes out stretched.
 *
 * Short is the point — a track running the full width of the view reads as a
 * page loading rather than an object being fetched — but short is not thin.
 * At 0.42 it was a sliver with a venue name floating over it; this is a bar
 * that has enough length for its own fill to be legible as a fraction.
 */
const BAR_SHARE = 0.58;

/** Above the blackout's 900, level with every panel. */
const RENDER_ORDER = 1000;

export function LoadingPanel({ title }: { title: string }) {
  const { percent } = useVenueLoad();
  const viewportHeight = useThree((state) => state.size.height);

  const width = Math.round(BAR_SHARE * viewportHeight);

  return (
    <VRFullscreen
      alignItems="center"
      justifyContent="center"
      // 2 m, matching every panel, so a venue swap does not move the thing you
      // are looking at nearer or further as it changes.
      distanceToCamera={2}
      pointerEventsOrder={POINTER_ORDER.ui}
      // Nothing here is a target — there is no action to take while a model
      // decodes — and leaving it rayable would put an invisible sheet in front
      // of a dock that is already hidden anyway.
      pointerEvents="none"
      // Drawn over the blackout (`../blackout`), which is what it sits on
      // during a venue change, and over walls and seating at 2 m.
      depthTest={false}
      renderOrder={RENDER_ORDER}
    >
      {/*
        The flat site's loader, line for line: a small caps label, the name,
        and the glowing bar with its percentage beside it.
      */}
      <Container
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        gapRow={SPACE.row}
        width={width}
      >
        <VRText
          fontSize={TEXT.label}
          color={COLOR.accentBright}
          textAlign="center"
          letterSpacing={4}
          fontWeight="semi-bold"
        >
          LOADING
        </VRText>
        <VRText fontSize={TEXT.heading} color={COLOR.text} textAlign="center">
          {title}
        </VRText>

        <Container
          width="100%"
          flexDirection="row"
          alignItems="center"
          gapColumn={SPACE.icon}
          marginTop={SPACE.row}
        >
          <Container flexGrow={1} flexShrink={1}>
            <ProgressBar percent={percent} />
          </Container>
          <VRText
            fontSize={TEXT.label}
            color={COLOR.muted}
            width={56}
            textAlign="right"
          >
            {`${percent}%`}
          </VRText>
        </Container>
      </Container>
    </VRFullscreen>
  );
}
