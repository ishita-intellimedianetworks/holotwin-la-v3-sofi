"use client";

import type { ReactNode } from "react";
import { useThree } from "@react-three/fiber";
import { Container } from "@react-three/uikit";
import { POINTER_ORDER, RADIUS, SPACE } from "../tokens";
import { VRFullscreen } from "../fullscreen";
import { GlassSurface } from "../glass-surface";

/**
 * The surface every in-session panel is built on.
 *
 * A centred card sized as a SHARE OF THE VIEWPORT rather than in metres, so it
 * stays balanced at any framing — and, more to the point here, so it looks the
 * same in a four-metre hotel room as it does in the middle of a stadium bowl.
 * A card sized in world units would be a postage stamp in one and a billboard
 * in the other.
 *
 * ITS WIDTH IS MEASURED AGAINST THE VIEWPORT'S HEIGHT, and that is the fix for
 * a card that came out stretched. `Fullscreen` sizes its root from the CANVAS,
 * and in an immersive session the canvas is the whole framebuffer — both eyes,
 * side by side — so it is about twice as wide as one eye sees. A width given as
 * a percentage of that is a card half again as wide as it was drawn on the
 * desktop, and only in session, which is why it looked like it stretched at
 * random. The vertical dimension has no such doubling: one eye's height is the
 * framebuffer's height.
 *
 * So a percentage here means "of the height", scaled by one shared factor —
 * see `WIDTH_PER_HEIGHT`. The card stops being a function of how the runtime
 * chose to lay out two eyes, and how wide panels feel becomes one number rather
 * than a percentage at every call site.
 *
 * THE SCRIM DOES NOT TINT. Dimming the view is the desktop-modal reflex and the
 * wrong one in a headset: a flat panel dims a page you are looking at, but this
 * would dim the ROOM you are standing in. The layer itself stays — see
 * `onDismiss`.
 */

/**
 * How much width one unit of viewport height buys — the single lever every
 * panel's width is scaled by.
 *
 * It started at 16/9, the aspect the existing percentages had been chosen by
 * eye against on a desktop screen, so that measuring them against height
 * instead of width changed nothing about how they looked. That turned out to be
 * the wrong target: matching the desktop is not the goal, and at that value the
 * cards read cramped through a lens — text wrapping early, two columns fighting
 * for a line, everything crowding its own padding.
 *
 * 2.2 is tuned rather than derived. It keeps every panel's width in the same
 * proportion to every other's, because they all pass through here, so the 40%
 * of a menu and the 46% of a hotspot card stay the relationship they were
 * given. Widen or narrow all of them by editing this one number.
 */
const WIDTH_PER_HEIGHT = 2.2;

export function VRPanel({
  children,
  width = "40%",
  height,
  maxHeight,
  surface = "glass",
  onDismiss,
}: {
  children: ReactNode;
  width?: `${number}%` | number;
  /**
   * A FIXED height, for panels whose content arrives late. Menus can size to
   * their rows; a panel that starts as a spinner cannot — a head-locked card
   * that grows appears to lunge at you.
   */
  height?: `${number}%` | number;
  /**
   * A CEILING instead of a height, for a panel whose content is all present at
   * mount but varies in amount. The card hugs its rows up to this and scrolls
   * beyond it — so a short list is a short card with no dead space under it,
   * and a long one is capped rather than running past the field of view.
   *
   * The venues differ wildly in how much they have to list: the hotel room has
   * no POIs at all, the stadium has thirty-five. Ignored when `height` is set —
   * that is already an exact answer.
   */
  maxHeight?: `${number}%` | number;
  /**
   * `clear` drops the card's dark fill and keeps only its hairline edge, for a
   * panel whose CONTENT is the surface. A menu still wants the glass: rows are
   * text, and text needs a ground.
   */
  surface?: "glass" | "clear";
  /**
   * Close when anywhere behind the card is pressed.
   *
   * The close button is a 56 px disc; this target is the entire view. Whatever
   * makes a small target awkward with a hand-held ray — tremor, drift between
   * press and release, a fraction of a degree of aim — cannot make this one
   * hard to hit. Aiming anywhere off the card and pressing always works, which
   * is also how every modal on a desktop behaves.
   */
  onDismiss?: () => void;
}) {
  /**
   * The canvas height in pixels, which is what `Fullscreen`'s root is sized in.
   * Reading `size` rather than `viewport` because uikit works in the same
   * pixel units this reports.
   */
  const viewportHeight = useThree((state) => state.size.height);

  const resolvedWidth =
    typeof width === "string"
      ? Math.round((parseFloat(width) / 100) * WIDTH_PER_HEIGHT * viewportHeight)
      : width;

  return (
    <VRFullscreen
      alignItems="center"
      justifyContent="center"
      // 2 m. Inside ~1.5 m a surface is within focus-strain range and reads as
      // shoved in your face. Fullscreen sizes itself from the frustum at this
      // distance, so the angle it subtends — and every percentage inside it —
      // is unchanged by the number.
      distanceToCamera={2}
      pointerEventsOrder={POINTER_ORDER.ui}
      // A panel 2 m from the head intersects walls and furniture, so it must
      // draw last and unconditionally or it comes out half-buried in a wall.
      depthTest={false}
      renderOrder={1000}
    >
      {/*
        Invisible, and still the dismiss target. uikit's `Component extends
        Mesh` with a `panelGeometry` regardless of whether a background is set,
        and `raycast` never consults `backgroundColor` — so dropping the fill
        costs the tint and nothing else. Do not "tidy" this element away.
      */}
      <Container
        positionType="absolute"
        width="100%"
        height="100%"
        onPointerDown={onDismiss}
      />

      <Container
        positionType="relative"
        flexDirection="column"
        justifyContent="center"
        alignItems="center"
        /**
         * THE CARD SWALLOWS THE PRESS, and without this the dismiss above fires
         * on every press INSIDE the panel as well as outside it.
         *
         * The backdrop is a sibling, not an ancestor, so a press on the card
         * does not bubble to it — it reaches it independently, because a ray
         * through the card also intersects the full-size surface behind it and
         * pointer events are dispatched to every object on the ray. Stopping
         * propagation here ends that walk at the card: anything nearer (every
         * child of this panel) has already had the event, and the only thing
         * farther is the backdrop.
         *
         * It went unnoticed until a panel had a control that does NOT close it.
         * Every earlier one — a layout row, a venue row, the instructions
         * button — dismissed the panel as part of its own job, so a second,
         * unasked-for dismissal was invisible. The moment a press was meant to
         * select a map pin or open a sub-view, the panel vanished under it.
         */
        onPointerDown={(event) => event.stopPropagation()}
        paddingX={SPACE.panelX}
        paddingY={SPACE.panelY}
        gapRow={SPACE.section}
        width={resolvedWidth}
        height={height}
        /*
          Only caps a card that sizes to its content; an explicit height must
          not be silently clamped.

          46% rather than something generous, for two reasons. Taller than that
          and a long list runs from well above the eyeline to well below it,
          which means turning your head to read a menu. And uikit sizes a scroll
          thumb as `track² / (overflow + track)`, so a card that only just
          overshoots its content draws a thumb that nearly fills the track — a
          bar that looks broken on a list that looks complete. Capping well
          below the content gives a short thumb with obvious travel.
        */
        maxHeight={height == null ? (maxHeight ?? "46%") : undefined}
        borderRadius={RADIUS.panel}
      >
        {/* The border stays either way — it is what gives a floating card an
            edge against a venue of any colour. Only the fill goes. */}
        <GlassSurface
          radius={RADIUS.panel}
          fillOpacity={surface === "clear" ? 0 : undefined}
        />
        {children}
      </Container>
    </VRFullscreen>
  );
}
