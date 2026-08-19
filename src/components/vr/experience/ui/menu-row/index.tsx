"use client";

import { useRef, type ReactNode } from "react";
import { Container } from "@react-three/uikit";
import * as THREE from "three";
import { COLOR, RADIUS, ROW_HEIGHT, SPACE, TEXT } from "../tokens";
import { VRText } from "../text";

/**
 * The one row every list is built from.
 *
 * Left-aligned and fixed-height: a centred label in a full-width row is a
 * button pretending to be a list item, and a stack of them has no edge to scan.
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

export function MenuRow({
  label,
  detail,
  icon,
  active = false,
  onSelect,
}: {
  label: string;
  /** A quiet trailing note — a category, a crowd level. Optional. */
  detail?: string;
  /** Optional leading glyph. Sized and coloured by the caller. */
  icon?: ReactNode;
  /** Marks the row you are currently at. */
  active?: boolean;
  onSelect: () => void;
}) {
  /**
   * Where this row was pressed, keyed by pointer.
   *
   * A map rather than one slot because a headset has two hands, and a press
   * from the left controller must not be closed out by the right one lifting.
   */
  const pressed = useRef(new Map<number, THREE.Vector3>());

  return (
    <Container
      width="100%"
      height={ROW_HEIGHT}
      flexShrink={0}
      flexDirection="row"
      alignItems="center"
      justifyContent="flex-start"
      gap={SPACE.icon}
      paddingX={SPACE.rowX}
      borderRadius={RADIUS.row}
      borderWidth={1}
      borderColor={active ? COLOR.rowBorderActive : COLOR.rowBorder}
      backgroundColor={active ? COLOR.rowActive : COLOR.rowRest}
      cursor="pointer"
      hover={{ backgroundColor: COLOR.rowHover }}
      onPointerDown={(event) => {
        if (event.pointerId == null) return;
        pressed.current.set(event.pointerId, event.point.clone());
      }}
      // Not `onPointerUp` alone: a release outside the row it started in is a
      // miss, and the same drag that scrolls the list ends on a different row.
      //
      // Rarely fires once uikit's scroll handler has captured the pointer — a
      // captured pointer reports the captured object as its intersection, so it
      // cannot leave. It is here for the press that never reached that handler.
      onPointerLeave={(event) => {
        if (event.pointerId != null) pressed.current.delete(event.pointerId);
      }}
      onPointerCancel={(event) => {
        if (event.pointerId != null) pressed.current.delete(event.pointerId);
      }}
      onPointerUp={(event) => {
        if (event.pointerId == null) return;
        const from = pressed.current.get(event.pointerId);
        pressed.current.delete(event.pointerId);
        if (from && from.distanceTo(event.point) <= DRAG_SLOP) onSelect();
      }}
    >
      {icon}
      <VRText
        flexGrow={1}
        flexShrink={1}
        minWidth={0}
        fontSize={TEXT.body}
        color={COLOR.text}
        // One line. A wrapping row would break the fixed height, and these
        // labels are titles — if one is too long it wants shortening in
        // `scenes.json`, not two lines here.
        wordBreak="keep-all"
      >
        {label}
      </VRText>
      {!!detail && (
        <VRText
          flexShrink={0}
          fontSize={TEXT.label}
          color={COLOR.muted}
          wordBreak="keep-all"
        >
          {detail}
        </VRText>
      )}
    </Container>
  );
}
