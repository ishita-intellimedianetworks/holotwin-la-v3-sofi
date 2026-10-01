"use client";

import { useRef, type ReactNode } from "react";
import { Container } from "@react-three/uikit";
import * as THREE from "three";
import { ChevronRightIcon } from "@react-three/uikit-lucide";
import { COLOR, RADIUS, ROW_HEIGHT, SPACE, TEXT } from "../tokens";
import { VRText } from "../text";

/**
 * The one row every list is built from — the 3D site's destination card
 * (`destination-sheet/destination-card.tsx`), drawn in uikit.
 *
 * The same anatomy: a dark rounded card, a round icon tile on the left, the
 * name in semibold with a quiet line under it (the walk time, a count), and on
 * the right a bold figure over a faint chevron. The row you are standing at is
 * the blue "You're here" card.
 *
 * A ROW SELECTS ON RELEASE, and it is the only control here that does.
 *
 * Every other control fires on `onPointerDown`, and should — press and release
 * drift apart on a hand-held ray, so a small button is more reliable acted on
 * at press. A row is not a small button: it lives in a scroll container, and
 * dragging a list is exactly a press on a row followed by movement. uikit
 * registers the drag on the SAME gesture (its scroll handler is on the
 * ancestor, so the row's handler has already run), so a press-to-select row
 * makes a long list impossible to scroll — the stadium's thirty-five seat views
 * would teleport you on the first one you touched.
 *
 * So: press, then release without travelling, is a choice. Press and drag is a
 * scroll. `onClick` would nearly do this on its own — @pmndrs/pointer-events
 * only emits it for a same-object press and release — but it also imposes a
 * 300 ms `clickThresholdMs`, and a deliberate press in a headset routinely runs
 * longer than that. Measuring the distance instead has no clock in it.
 */

/**
 * How far the ray may travel between press and release and still count as a
 * choice, in world metres at the surface.
 *
 * 2 cm on a panel 2 m away is ~0.6° — inside the tremor a wrist adds to a
 * hand-held ray, and an order of magnitude short of the row-to-row movement a
 * scroll needs.
 */
const DRAG_SLOP = 0.02;

/** `h-9 w-9` — the leading tile. */
const TILE = 56;
/** `size={16}` inside it. */
const TILE_GLYPH = 26;
/** `size={15}` — the disclosure chevron. */
const CHEVRON = 24;

/**
 * Press-then-release-in-place handlers, for anything that sits inside a
 * scrolling container — see the note at the top of this file. `MenuRow` uses
 * it; so does every other row or chip that lives in a list a person drags.
 * Pass `undefined` for an inert target.
 */
/** The two fields of a uikit pointer event this needs. */
type RayPress = { pointerId?: number | null; point: THREE.Vector3 };

export function useReleaseSelect(onSelect: (() => void) | undefined) {
  /**
   * Where this target was pressed, keyed by pointer.
   *
   * A map rather than one slot because a headset has two hands, and a press
   * from the left controller must not be closed out by the right one lifting.
   */
  const pressed = useRef(new Map<number, THREE.Vector3>());
  if (!onSelect) return {};

  const forget = (event: RayPress) => {
    if (event.pointerId != null) pressed.current.delete(event.pointerId);
  };

  return {
    onPointerDown: (event: RayPress) => {
      if (event.pointerId == null) return;
      pressed.current.set(event.pointerId, event.point.clone());
    },
    // Not `onPointerUp` alone: a release outside the target it started on is
    // a miss, and the same drag that scrolls the list ends somewhere else.
    //
    // Rarely fires once uikit's scroll handler has captured the pointer — a
    // captured pointer reports the captured object as its intersection, so it
    // cannot leave. It is here for the press that never reached that handler.
    onPointerLeave: forget,
    onPointerCancel: forget,
    onPointerUp: (event: RayPress) => {
      if (event.pointerId == null) return;
      const from = pressed.current.get(event.pointerId);
      pressed.current.delete(event.pointerId);
      if (from && from.distanceTo(event.point) <= DRAG_SLOP) onSelect();
    },
  };
}

export function MenuRow({
  label,
  detail,
  subline,
  subIcon,
  distance,
  icon,
  active = false,
  chevron = true,
  onSelect,
}: {
  label: string;
  /** A quiet trailing note — a category, a crowd level. Optional. */
  detail?: string;
  /** The quiet line under the name — a walk time, a count. */
  subline?: string;
  /** A small glyph before `subline` (footprints before a walk time). */
  subIcon?: ReactNode;
  /** The bold figure on the right — the distance. */
  distance?: string;
  /**
   * The glyph drawn in the leading tile. Sized by the caller — use
   * `ROW_GLYPH` — and coloured `COLOR.muted` to match the flat card.
   */
  icon?: ReactNode;
  /** The "You're here" / selected card. */
  active?: boolean;
  /** The disclosure chevron. On by default, as on every flat card. */
  chevron?: boolean;
  onSelect: () => void;
}) {
  const selectOnRelease = useReleaseSelect(onSelect);

  return (
    <Container
      width="100%"
      minHeight={ROW_HEIGHT}
      flexShrink={0}
      flexDirection="row"
      alignItems="center"
      justifyContent="flex-start"
      gap={SPACE.icon}
      paddingX={22}
      paddingY={18}
      borderRadius={RADIUS.card}
      backgroundColor={active ? COLOR.here : COLOR.rowRest}
      cursor="pointer"
      hover={{ backgroundColor: active ? COLOR.here : COLOR.tile }}
      {...selectOnRelease}
    >
      {!!icon && (
        <Container
          width={TILE}
          height={TILE}
          flexShrink={0}
          borderRadius={RADIUS.dot}
          backgroundColor={active ? COLOR.accentBright : COLOR.tile}
          alignItems="center"
          justifyContent="center"
          pointerEvents="none"
        >
          {icon}
        </Container>
      )}

      <Container
        flexGrow={1}
        flexShrink={1}
        minWidth={0}
        flexDirection="column"
        gapRow={4}
        pointerEvents="none"
      >
        <VRText fontSize={TEXT.name} fontWeight="semi-bold" color={COLOR.text}>
          {label}
        </VRText>
        {!!subline && (
          <Container flexDirection="row" alignItems="center" gap={8}>
            {subIcon}
            <VRText
              fontSize={TEXT.label}
              color={active ? COLOR.accentBright : COLOR.muted}
            >
              {subline}
            </VRText>
          </Container>
        )}
      </Container>

      {(!!detail || !!distance || chevron) && (
        <Container
          flexShrink={0}
          flexDirection="column"
          alignItems="flex-end"
          gapRow={2}
          pointerEvents="none"
        >
          {!!distance && (
            <VRText
              fontSize={TEXT.name}
              fontWeight="bold"
              color={COLOR.text}
              wordBreak="keep-all"
            >
              {distance}
            </VRText>
          )}
          {!!detail && (
            <VRText
              fontSize={TEXT.label}
              color={COLOR.muted}
              wordBreak="keep-all"
            >
              {detail}
            </VRText>
          )}
          {chevron && (
            <ChevronRightIcon
              width={CHEVRON}
              height={CHEVRON}
              color={COLOR.faint}
            />
          )}
        </Container>
      )}
    </Container>
  );
}

/** The glyph size a `MenuRow` tile expects. */
export const ROW_GLYPH = TILE_GLYPH;
