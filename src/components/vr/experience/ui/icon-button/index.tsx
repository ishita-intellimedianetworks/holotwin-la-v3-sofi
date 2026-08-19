"use client";

import type { ReactNode } from "react";
import { Container } from "@react-three/uikit";
import { COLOR, RADIUS } from "../tokens";

/**
 * A round icon button — the site's bottom dock button, rebuilt on these tokens.
 *
 * Round, because a circular target has no dead corners for a ray to land in.
 *
 * 64 px, where the flat dock's is 44: that is ~3.7° at panel distance,
 * comfortably clear of `MIN_TARGET_DEGREES`. A mouse is not a hand-held ray.
 */
const SIZE = 64;

export function IconButton({
  icon,
  tone = "default",
  active = false,
  disabled = false,
  onSelect,
}: {
  icon: ReactNode;
  /** `danger` for the one button that ends the session. */
  tone?: "default" | "danger";
  /** Marks the view you are already in. */
  active?: boolean;
  /**
   * Drawn flat and inert. The button KEEPS ITS SPACE rather than being hidden,
   * so the dock does not shuffle sideways as buttons come and go. The caller
   * dims the glyph to match; this only handles the disc.
   */
  disabled?: boolean;
  onSelect: () => void;
}) {
  const danger = tone === "danger";

  return (
    <Container
      width={SIZE}
      height={SIZE}
      flexShrink={0}
      alignItems="center"
      justifyContent="center"
      borderRadius={RADIUS.dot}
      borderWidth={1}
      borderColor={
        danger ? COLOR.danger : active ? COLOR.rowBorderActive : COLOR.rowBorder
      }
      backgroundColor={
        disabled
          ? COLOR.panel
          : danger
            ? COLOR.danger
            : active
              ? COLOR.rowActive
              : COLOR.rowRest
      }
      cursor={disabled ? "default" : "pointer"}
      /*
        SPREAD, so that a disabled button carries NO `hover` key at all.

        `hover={undefined}` is not the same thing and uikit crashes on it:
        `properties/index.js` guards with `!(layerSection in properties)`, and
        `in` tests for the KEY, not its value — so an explicit undefined passes
        the guard and reaches `Object.entries(undefined)`, which throws and
        takes the canvas with it. The same is true of `active` and `focus`.
      */
      {...(disabled
        ? {}
        : {
            hover: {
              backgroundColor: danger ? COLOR.dangerHover : COLOR.rowHover,
            },
          })}
      // `onPointerDown`, never `onClick`: a click needs press and release on
      // the same object, and a hand-held ray drifts between the two.
      onPointerDown={disabled ? undefined : onSelect}
    >
      {/*
        The glyph is wrapped rather than trusted to behave.

        It sits dead centre of the disc — exactly where the ray is aimed — and
        as a child it would win the hit test over the button behind it,
        swallowing the press. The effect is a button that only responds on the
        ring AROUND its icon. Doing it in the wrapper means no caller can
        forget; children inherit it, since uikit resolves
        `object.pointerEvents ?? parentPointerEvents`.

        Full size, so the centring is the wrapper's and not the glyph's. With no
        dimensions this hugs whatever the icon reports, and an icon whose
        intrinsic box is not square then sits off to one side of the disc.
      */}
      <Container
        pointerEvents="none"
        width="100%"
        height="100%"
        alignItems="center"
        justifyContent="center"
      >
        {icon}
      </Container>
    </Container>
  );
}
