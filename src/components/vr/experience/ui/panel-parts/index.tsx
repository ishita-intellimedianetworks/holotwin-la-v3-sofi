"use client";

import { Container } from "@react-three/uikit";
import { XIcon } from "@react-three/uikit-lucide";
import { COLOR, POINTER_ORDER, RADIUS, SPACE, TEXT } from "../tokens";
import { VRText } from "../text";

/**
 * Shared panel furniture, so every panel's title and close control sit in the
 * same place at the same size.
 */

// `string`, not `ReactNode`: the atlas-safe wrapper transliterates text, and it
// can only do that to text it can see. A ReactNode would let a raw uikit `Text`
// slip through with an em dash in it.
export function PanelTitle({ children }: { children: string }) {
  return (
    <VRText fontSize={TEXT.heading} color={COLOR.text}>
      {children}
    </VRText>
  );
}

/**
 * The close control: a round disc, in the flow rather than absolute.
 *
 * A disc, not a square icon button, because a circular target has no dead
 * corners for a ray to land in. 56 px is ~3.2° of arc at panel distance.
 */
const CLOSE_TARGET = 56;
const CLOSE_GLYPH = 22;

/** Matches ROW_HEIGHT so a button and a row read as the same family. */
const PRIMARY_HEIGHT = 56;

export function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <Container
      width={CLOSE_TARGET}
      height={CLOSE_TARGET}
      flexShrink={0}
      /**
       * Outranks everything else in the panel. Every element inherits the same
       * order from `VRPanel`, so among them the winner would be decided by
       * which surface is a fraction nearer — not something layout guarantees.
       * Raising this one settles it: if the ray is on the disc, the disc gets
       * the press.
       */
      pointerEventsOrder={POINTER_ORDER.overlay}
      borderRadius={RADIUS.dot}
      backgroundColor={COLOR.danger}
      alignItems="center"
      justifyContent="center"
      cursor="pointer"
      hover={{ backgroundColor: COLOR.dangerHover }}
      onPointerDown={onClose}
    >
      {/*
        pointerEvents="none" is load-bearing, not decoration. The glyph sits
        dead centre of the disc — exactly where the ray is aimed — and as a
        child it wins the hit test over the Container behind it, swallowing the
        press. The effect is a close button that only responds on the ring
        AROUND the X.
      */}
      <XIcon
        width={CLOSE_GLYPH}
        height={CLOSE_GLYPH}
        color={COLOR.text}
        pointerEvents="none"
      />
    </Container>
  );
}

/**
 * Title left, close right, in a row that OCCUPIES SPACE — so content below can
 * never end up underneath the close button, which is what an absolutely
 * positioned one does. The title shrinks; the disc never does.
 */
export function PanelHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  /** A quiet second line — which venue, which category. Optional. */
  subtitle?: string;
  onClose?: () => void;
}) {
  return (
    <Container
      width="100%"
      flexDirection="row"
      flexShrink={0}
      alignItems="center"
      justifyContent="space-between"
      gap={SPACE.icon}
    >
      <Container
        flexGrow={1}
        flexShrink={1}
        minWidth={0}
        flexDirection="column"
        gapRow={4}
      >
        <PanelTitle>{title}</PanelTitle>
        {!!subtitle && (
          <VRText fontSize={TEXT.label} color={COLOR.muted}>
            {subtitle}
          </VRText>
        )}
      </Container>
      {onClose && <CloseButton onClose={onClose} />}
    </Container>
  );
}

/** A hairline rule, in the card's own palette. */
export function Divider() {
  return (
    <Container width="100%" height={1} backgroundColor={COLOR.rowBorder} />
  );
}

/**
 * A quiet section heading, for a list broken up by category and subcategory.
 *
 * `indent` marks the SECOND level. It is the only thing separating the two —
 * no rule, no second colour, no smaller type — because a subcategory sits
 * directly under its category and the eye only needs one cue to read one as
 * inside the other. Adding more would make a two-level list look like two
 * lists.
 */
export function SectionLabel({
  children,
  indent = false,
}: {
  children: string;
  indent?: boolean;
}) {
  return (
    <Container
      width="100%"
      flexShrink={0}
      paddingTop={SPACE.row}
      paddingLeft={indent ? SPACE.rowX : 0}
    >
      <VRText
        fontSize={TEXT.label}
        color={indent ? COLOR.muted : COLOR.accentBright}
      >
        {children}
      </VRText>
    </Container>
  );
}

/**
 * The single affirmative action on a panel. Filled, so it does not read as one
 * more row.
 */
export function PrimaryButton({
  label,
  onSelect,
  fullWidth = false,
}: {
  label: string;
  onSelect: () => void;
  /**
   * Span the card instead of hugging the label.
   *
   * For a panel whose ONLY action this is. A pill sized to its own text is a
   * small target for a hand-held ray — whatever makes a small target awkward,
   * tremor or a fraction of a degree of aim, applies here — and when there is
   * nothing else to press, there is nothing for the extra width to compete
   * with. Off by default: a button that spans the card reads as the primary
   * action, which is a claim worth making deliberately.
   */
  fullWidth?: boolean;
}) {
  return (
    <Container
      height={PRIMARY_HEIGHT}
      width={fullWidth ? "100%" : undefined}
      paddingX={SPACE.primaryX}
      flexShrink={0}
      alignItems="center"
      justifyContent="center"
      borderRadius={RADIUS.row}
      backgroundColor={COLOR.accent}
      cursor="pointer"
      hover={{ backgroundColor: COLOR.accentHover }}
      onPointerDown={onSelect}
    >
      <VRText fontSize={TEXT.body} color={COLOR.text}>
        {label}
      </VRText>
    </Container>
  );
}
