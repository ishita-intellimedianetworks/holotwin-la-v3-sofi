"use client";

import { Container } from "@react-three/uikit";
import { COLOR, OPACITY, RADIUS } from "../tokens";

/**
 * The translucent backing behind a panel — the 3D stand-in for the site's
 * `NAV_GLASS`.
 *
 * Separate absolutely-positioned layers rather than props on the card, because
 * uikit 1.x has no `backgroundOpacity` and `opacity` CASCADES — setting it on
 * the card would fade its own text. Two layers because the fill and the border
 * want different opacities.
 *
 * The border is 2 px, not the site's 1 px: at headset resolution a 1 px
 * hairline disappears and the panel loses its edge against a bright venue.
 *
 * NEITHER LAYER IS EVER A RAY TARGET, and that is a fix, not tidiness.
 *
 * Both stretch across 100% of whatever holds them — the dock pill, the card —
 * and both inherit that surface's `pointerEventsOrder`. uikit settles a tie on
 * order by DISTANCE, and these sit within a fraction of a millimetre of the
 * controls drawn on top of them, so which one the ray reports is effectively
 * arbitrary. That is what "the dock works, then it doesn't" looks like:
 * presses that land on the glass instead of the button under the aim do
 * nothing at all.
 *
 * uikit resolves `object.pointerEvents ?? parentPointerEvents`, so setting this
 * here cannot be overridden by a parent and needs no cooperation from callers.
 */
export function GlassSurface({
  radius = RADIUS.panel,
  fill = COLOR.panel,
  fillOpacity = OPACITY.panel,
  border = true,
}: {
  radius?: number;
  fill?: string;
  fillOpacity?: number;
  border?: boolean;
}) {
  const fillsParent = {
    positionType: "absolute",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  } as const;

  return (
    <>
      <Container
        {...fillsParent}
        borderRadius={radius}
        backgroundColor={fill}
        opacity={fillOpacity}
      />
      {border && (
        <Container
          {...fillsParent}
          borderRadius={radius}
          borderWidth={2}
          borderColor={COLOR.border}
          opacity={OPACITY.border}
        />
      )}
    </>
  );
}
