"use client";

import { Container } from "@react-three/uikit";
import { CROWD_DOT, CROWD_WORD } from "@/components-v5/shared/crowd-display";
import { VRText } from "../ui/text";
import { COLOR, RADIUS, SPACE, TEXT } from "../ui/tokens";

/**
 * The small marks a destination card is made of.
 *
 * The chip and the bullet were written twice before this file existed — once in
 * the hotspot panel and once here — and a chip that is a pixel rounder in one
 * panel than the other is exactly the kind of drift nobody notices until both
 * are on screen at once. The hotspot panel draws from here now.
 *
 * ITS CROWD LINE STAYED WHERE IT WAS, deliberately. That panel colours only the
 * "high" tier, on the argument that a warning which fires at every level is not
 * a warning; the sheet's `CrowdLine` below shows the tier as a dot and a word
 * because it is read beside a floor plan whose pins are coloured the same way.
 * Two surfaces, two jobs, and neither one is the other's mistake.
 */

/** A tag chip, matching the flat card's pills. */
export function Chip({ children }: { children: string }) {
  return (
    <Container
      flexShrink={0}
      paddingX={SPACE.row}
      paddingY={4}
      borderRadius={RADIUS.chip}
      borderWidth={1}
      borderColor={COLOR.rowBorder}
      backgroundColor={COLOR.rowRest}
    >
      <VRText fontSize={TEXT.label} color={COLOR.muted} wordBreak="keep-all">
        {children}
      </VRText>
    </Container>
  );
}

/** A row of chips that wraps. Renders nothing at all when there are none. */
export function ChipRow({ items }: { items: string[] | undefined }) {
  if (!items?.length) return null;
  return (
    <Container
      width="100%"
      flexShrink={0}
      flexDirection="row"
      flexWrap="wrap"
      gap={SPACE.row}
    >
      {items.map((item) => (
        <Chip key={item}>{item}</Chip>
      ))}
    </Container>
  );
}

/** The leading dot on a bullet line. Small, because the line is the content. */
const BULLET = 6;

export function Bullet({ children }: { children: string }) {
  return (
    <Container
      width="100%"
      flexShrink={0}
      flexDirection="row"
      alignItems="center"
      gap={SPACE.icon}
    >
      <Container
        width={BULLET}
        height={BULLET}
        flexShrink={0}
        borderRadius={RADIUS.dot}
        backgroundColor={COLOR.accentBright}
      />
      <VRText
        flexGrow={1}
        flexShrink={1}
        fontSize={TEXT.body}
        color={COLOR.text}
      >
        {children}
      </VRText>
    </Container>
  );
}

/** A paragraph of authored prose. */
export function Prose({
  children,
  muted,
}: {
  children: string;
  muted?: boolean;
}) {
  return (
    <Container width="100%" flexShrink={0}>
      <VRText
        fontSize={TEXT.body}
        color={muted ? COLOR.muted : COLOR.text}
      >
        {children}
      </VRText>
    </Container>
  );
}

/**
 * How busy it is: the tier's own colour as a dot, the tier as a word, and the
 * authored note beside it.
 *
 * NEVER A DOT ALONE. The flat card's own comment makes the point — a bare
 * coloured dot does not read as crowding to someone who has not been told what
 * the colours mean, and a headset has no tooltip to explain it. The colours are
 * the shared `CROWD_DOT` pair, so a gate that is amber on the floor plan is
 * amber here.
 *
 * THE NOTE WINS OVER THE WORD where both exist, rather than being appended to
 * it. Every `crowdNote` in `scenes.json` already opens with its own tier —
 * "Heavy flow - expect queues", "Low flow - fastest way in right now" — so
 * printing the word first produced "Heavy - Heavy flow - expect queues". The
 * word is the fallback for a tier authored with no note, which is what the
 * stadium's entrances are.
 */
export function CrowdLine({
  crowd,
  note,
}: {
  crowd: string | undefined;
  note?: string;
}) {
  if (!crowd && !note) return null;

  const color = crowd ? CROWD_DOT[crowd] : undefined;
  const word = crowd ? CROWD_WORD[crowd] : undefined;

  return (
    <Container
      width="100%"
      flexShrink={0}
      flexDirection="row"
      alignItems="center"
      gap={SPACE.icon}
    >
      {!!color && (
        <Container
          width={10}
          height={10}
          flexShrink={0}
          borderRadius={RADIUS.dot}
          backgroundColor={color}
        />
      )}
      <VRText
        flexGrow={1}
        flexShrink={1}
        fontSize={TEXT.body}
        color={COLOR.muted}
      >
        {note ?? word ?? ""}
      </VRText>
    </Container>
  );
}

/**
 * A labelled figure — "Distance / 180 m".
 *
 * Stacked rather than inline so two of them side by side line up on both rows
 * whatever the numbers are; a headset reads a column of aligned figures far
 * faster than a sentence containing them.
 */
export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Container flexGrow={1} flexShrink={1} minWidth={0} flexDirection="column" gapRow={4}>
      <VRText fontSize={TEXT.label} color={COLOR.muted} wordBreak="keep-all">
        {label}
      </VRText>
      <VRText fontSize={TEXT.body} color={COLOR.text} wordBreak="keep-all">
        {value}
      </VRText>
    </Container>
  );
}
