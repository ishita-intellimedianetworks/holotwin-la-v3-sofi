"use client";

import { Container } from "@react-three/uikit";
import { useVenueLoad } from "../load-progress";
import { VRPanel } from "../ui/panel";
import { ProgressBar } from "../ui/progress-bar";
import { COLOR, SPACE, TEXT } from "../ui/tokens";
import { VRText } from "../ui/text";

/**
 * The in-world wait — what you see through the headset while a venue loads.
 *
 * IT CARRIES A REAL BAR, fed by the same byte counter the DOM gate reads (see
 * `../load-progress`). It briefly did not, on the argument that the number is
 * already on the gate and nobody can act on it anyway. That argument is wrong
 * for the case this panel exists for: switching venue from inside a session has
 * no gate, the headset is on, and a spinner alone gives no sense of whether a
 * nine-megabyte model is nearly there or has stalled. In a headset that
 * ambiguity is worse than on a screen — you cannot glance at anything else
 * while you wait.
 *
 * FIXED HEIGHT, not sized to content. A head-locked card that grows as its
 * content arrives appears to lunge at you.
 */
export function LoadingPanel({ title }: { title: string }) {
  const { percent, indeterminate } = useVenueLoad();

  return (
    <VRPanel width="38%" height="24%">
      <Container
        width="100%"
        height="100%"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        paddingX={SPACE.panelX}
        gapRow={SPACE.section}
      >
        <VRText fontSize={TEXT.body} color={COLOR.text} textAlign="center">
          {`Loading ${title}`}
        </VRText>

        <ProgressBar percent={percent} indeterminate={indeterminate} />

        {/*
          The number goes away when it stops meaning anything.

          While the decode runs — or behind a tunnel that sends no
          Content-Length — there is no honest percentage, and printing the last
          one it happened to reach would be a figure frozen on screen next to a
          bar that is still moving. "Preparing" says the same thing without
          claiming a measurement.
        */}
        <VRText fontSize={TEXT.label} color={COLOR.muted} textAlign="center">
          {indeterminate ? "Preparing…" : `${percent}%`}
        </VRText>
      </Container>
    </VRPanel>
  );
}
