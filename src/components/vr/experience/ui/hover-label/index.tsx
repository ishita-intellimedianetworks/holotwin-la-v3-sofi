"use client";

import { Container } from "@react-three/uikit";
import { VRText } from "../text";
import { COLOR, RADIUS } from "../tokens";

/**
 * The name of an icon-only control, shown above it while the ray is on it —
 * the flat site's tooltip. A glyph alone is a guess the first time; the name
 * removes it.
 *
 * Render it as a CHILD of the control, only while hovered (uikit's
 * `onHoverChange`). It positions itself from the control's corner.
 *
 * MATCHES THE REFERENCE BUILD (la_port_v1 `vr/ui/primitives.tsx`, `TIP`): a
 * glass pill above the control, 18 px semi-bold white text, #090b0f at
 * 0.85 with a white 0.35 hairline, mounted instantly with no fade.
 */

/**
 * The label's box. FIXED WIDTH and centred on the control by offset, so the
 * pill inside can hug its text without a transform: uikit places an absolute
 * child from its parent's corner, and half of a known width is the one
 * centring that needs no measuring.
 */
const LABEL_BOX = 320;
/**
 * Gap between the control's top edge and the label. 24 rather than the
 * reference's 12: at 12 the pill sat on the disc's rim and read as part of it.
 */
const LABEL_GAP = 24;

/** The reference's `TIP` values. */
const TIP = { padX: 16, padY: 8, text: 18, fill: 0.85, ring: 0.35, ringWidth: 1.5 };

/** Background and ring as separate layers, so each carries its own opacity. */
const LAYER = {
  positionType: "absolute",
  width: "100%",
  height: "100%",
  borderRadius: RADIUS.dot,
  pointerEvents: "none",
} as const;

export function HoverLabel({
  label,
  targetSize,
}: {
  label: string;
  /** The control's width and height, in uikit pixels — it is a disc. */
  targetSize: number;
}) {
  return (
    <Container
      positionType="absolute"
      positionBottom={targetSize + LABEL_GAP}
      positionLeft={(targetSize - LABEL_BOX) / 2}
      width={LABEL_BOX}
      flexDirection="row"
      justifyContent="center"
      // A label, not a target: it must not steal the ray from the control
      // under it, or the hover would flicker off the moment it appeared.
      pointerEvents="none"
    >
      <Container
        flexDirection="row"
        alignItems="center"
        justifyContent="center"
        paddingX={TIP.padX}
        paddingY={TIP.padY}
        borderRadius={RADIUS.dot}
      >
        <Container {...LAYER} backgroundColor={COLOR.panel} opacity={TIP.fill} />
        <Container
          {...LAYER}
          borderWidth={TIP.ringWidth}
          borderColor="#ffffff"
          opacity={TIP.ring}
        />
        <VRText
          fontSize={TIP.text}
          fontWeight="semi-bold"
          color="#ffffff"
          wordBreak="keep-all"
        >
          {label}
        </VRText>
      </Container>
    </Container>
  );
}
