"use client";

import type { ReactNode } from "react";
import { Container } from "@react-three/uikit";
import { COLOR, RADIUS, SPACE } from "../tokens";

/**
 * Thin, because in a headset the ray drags the body directly and the bar is
 * only an indicator.
 */
const SCROLLBAR = 6;

/** The scrolling body of a panel, so every list shares a gap and an inset. */
export function PanelList({
  children,
  align = "stretch",
}: {
  children: ReactNode;
  /** `stretch` so rows share a left and right edge. */
  align?: "stretch" | "center" | "flex-start";
}) {
  return (
    <Container
      /*
        Deliberately no `maxHeight="100%"`. That resolves against the panel's
        whole content box while the list is only one of its children, so the
        list claims the entire card, the card's content exceeds the card, and
        the clamp forces the list to shrink — an overflow, which draws a bar.
        Every menu would open at its ceiling with a scrollbar it did not need.
        `flexShrink` and `minHeight={0}` below do the real work.
      */
      /**
       * These three are what make scrolling actually happen.
       *
       * `flexGrow` so the list takes the space a fixed-height panel leaves
       * after its header; `flexShrink` with `minHeight={0}` so it is allowed to
       * be SHORTER than its content — a flex item's floor is its content size
       * by default, which makes the list push the card taller instead of
       * scrolling inside it.
       *
       * In a panel with no fixed height there is no spare space to grow into,
       * so this stays a card that hugs its rows — but `flexShrink` still earns
       * its keep there: a panel capped with `maxHeight` clamps below its
       * content, and this is the child that gives way and scrolls. Scrolling
       * needs a bounded parent, not specifically a fixed one.
       */
      flexGrow={1}
      flexShrink={1}
      minHeight={0}
      overflow="scroll"
      scrollbarWidth={SCROLLBAR}
      scrollbarColor={COLOR.accentBright}
      // Four corners individually: uikit's panel properties carry no shorthand
      // `borderRadius`, so `scrollbarBorderRadius` is not a prop that exists.
      scrollbarBorderTopLeftRadius={RADIUS.chip}
      scrollbarBorderTopRightRadius={RADIUS.chip}
      scrollbarBorderBottomLeftRadius={RADIUS.chip}
      scrollbarBorderBottomRightRadius={RADIUS.chip}
      flexDirection="column"
      gapRow={SPACE.row}
      /**
       * `flex-start`, not `center`. Centring the main axis of a SCROLL
       * container pushes overflow out of both ends, and what goes off the top
       * is unreachable — scroll clamps at zero, already past it.
       */
      justifyContent="flex-start"
      alignItems={align}
      width="100%"
      /**
       * EVEN ON BOTH SIDES, and it already clears the bar — no gutter is
       * reserved for it. uikit draws the bar against the container's BORDER
       * inset while padding shrinks the content box the rows lay out in, so a
       * 16 px inset already leaves the 6 px bar its own lane. Adding a
       * `paddingRight` for it would push every list off-centre whether it
       * scrolls or not, which is what a reserved gutter looks like when there
       * is nothing in it.
       *
       * Nothing else is needed to hide the bar itself: uikit only reports a
       * `maxScrollPosition` on an axis that actually overflows, and without one
       * the bar is drawn at zero size.
       */
      paddingX={SPACE.listX}
    >
      {children}
    </Container>
  );
}
