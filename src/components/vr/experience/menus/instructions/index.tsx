"use client";

import type { ReactNode } from "react";
import { Container } from "@react-three/uikit";
import {
  BoxIcon,
  BuildingIcon,
  HouseIcon,
  InfoIcon,
  LayersIcon,
  LogOutIcon,
  MapPinIcon,
} from "@react-three/uikit-lucide";
import { useVenue } from "@/components/vr/data/venue-provider";
import { VENUES } from "@/components/vr/data";
import { VRPanel } from "../../ui/panel";
import { PanelList } from "../../ui/panel-list";
import { PrimaryButton } from "../../ui/panel-parts";
import { COLOR, RADIUS, SPACE, TEXT } from "../../ui/tokens";
import { VRText } from "../../ui/text";

/**
 * Controls. A separate set per view, because the controls genuinely differ.
 *
 * A TWO-COLUMN TABLE, following the ARCHVIZ VR panel: the control on the left,
 * what it does on the right, one line each. It was a list of sentences, and the
 * sentence form is what made it long — "Click on the Layouts Button to travel
 * to a saved viewpoint" spends six words restating that a button is a button
 * before it says anything. A column of controls beside a column of outcomes
 * says the same thing in three words and can be scanned rather than read, which
 * is what a panel you see once on arrival has to survive.
 *
 * THE CONTROL COLUMN IS THE DOCK'S OWN ICON WHEREVER THERE IS ONE, drawn in a
 * chip so it reads as the button it is, at the same size relationship the dock
 * uses. Naming them in words meant reading a word, remembering it, and then
 * hunting the bar for whichever glyph might mean it. Words stay for the things
 * that are not buttons — the sticks, the trigger — because those have no icon
 * to point at.
 *
 * IT STAYS A SMALL CARD. Extra lines are paid for by scrolling, not by growing.
 */

/** Matches the dock's glyphs, scaled to sit inside a row. */
const GLYPH = 20;

/** The chip the icon sits in — round, like the dock's discs. */
const CHIP = 34;

/**
 * What the control column has to itself.
 *
 * Wide enough for "Left stick ← →", which is the longest thing in it.
 * Fixed rather than sized to content so every description shares a left edge —
 * a ragged second column is what makes a table read as a list again.
 */
const CONTROL_COL = 176;

/** One row: the control, then what it does. */
function Row({ control, children }: { control: ReactNode; children: string }) {
  return (
    <Container
      flexDirection="row"
      alignItems="center"
      justifyContent="flex-start"
      gap={SPACE.icon}
      width="100%"
      // Keeps its height in the scrolling list.
      flexShrink={0}
    >
      <Container
        width={CONTROL_COL}
        flexShrink={0}
        flexDirection="row"
        alignItems="center"
        justifyContent="flex-start"
      >
        {control}
      </Container>
      {/*
        A `Text` in a flex row has no intrinsic width to wrap against, so
        without `flexShrink` it lays out at its full single-line length and runs
        straight out of the card.
      */}
      <VRText
        flexGrow={1}
        flexShrink={1}
        fontSize={TEXT.body}
        color={COLOR.muted}
      >
        {children}
      </VRText>
    </Container>
  );
}

/**
 * A dock button, in its chip.
 *
 * The glyph keeps the dock's own white; the chip is the row's resting fill with
 * a hairline, which is what the dock's discs look like on their glass. Drawn
 * this way the row and the button are recognisably one thing.
 */
const button = (Icon: typeof HouseIcon) => (
  <Container
    width={CHIP}
    height={CHIP}
    flexShrink={0}
    alignItems="center"
    justifyContent="center"
    borderRadius={RADIUS.dot}
    backgroundColor={COLOR.rowRest}
    borderWidth={1}
    borderColor={COLOR.rowBorder}
  >
    <Icon width={GLYPH} height={GLYPH} color={COLOR.text} />
  </Container>
);

/**
 * A CONTROLLER action, named rather than drawn, in the accent.
 *
 * Deliberately not the buttons' white. A stick is something in your hands; the
 * white glyphs are things on the dock you can point at, and drawn alike they
 * would read as more buttons, two of which do not exist.
 */
const stick = (label: string) => (
  <VRText fontSize={TEXT.body} color={COLOR.accentBright}>
    {label}
  </VRText>
);

export function InstructionsMenu({
  view,
  onDismiss,
}: {
  view: "doll-house" | "first-person";
  onDismiss: () => void;
}) {
  const venue = useVenue();
  const isFirstPerson = view === "first-person";

  /**
   * The same predicates the dock gates its buttons on. A panel that describes a
   * control the venue does not have is worse than one that stays quiet: the
   * hotel room has no POIs at all, so it has neither button, and naming them
   * sends someone hunting for something that was never there.
   */
  const hasPlaces = venue.layouts.length > 0;
  const hasResources = venue.hotspots.length > 0;
  const hasVenues = VENUES.length > 1;

  return (
    // A CEILING, NOT A HEIGHT — the card hugs its lines and only scrolls once
    // there are too many. The count genuinely varies: first person in the
    // stadium is nine rows, the doll house in the hotel room is five, and a
    // fixed height sized for the longest leaves the shortest with a third of
    // its card empty. A panel with a hole in the bottom of it reads as
    // something that failed to load.
    <VRPanel maxHeight="62%" onDismiss={onDismiss}>
      {/*
        A CENTRED TITLE, not the shared `PanelHeader`. That component is a row —
        title left, close disc right — and this is the one panel with no close
        button, since the dismiss below does the job. Left-aligning a title
        against nothing just leaves a hole where the disc would be.

        It also NAMES THE VIEW. Both sets of instructions are the same card in
        the same place and only the rows differ, so without this there is
        nothing to say which of the two you are reading — or that the other one
        exists.
      */}
      <Container
        width="100%"
        flexShrink={0}
        paddingTop={SPACE.section}
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        gapRow={4}
      >
        <VRText fontSize={TEXT.heading} color={COLOR.text} textAlign="center">
          {isFirstPerson ? "Walking the venue" : "The model"}
        </VRText>
        <VRText fontSize={TEXT.label} color={COLOR.muted} textAlign="center">
          {venue.title}
        </VRText>
      </Container>

      <PanelList align="flex-start">
        {isFirstPerson ? (
          <>
            <Row control={stick("Left stick")}>Walk</Row>
            <Row control={stick("Right stick")}>Turn on the spot</Row>
            <Row control={stick("Right trigger")}>Press what you point at</Row>
          </>
        ) : (
          <>
            {/*
              THE SAME HANDS DOING THE SAME JOBS AS FIRST PERSON. Left drives
              the world, right points and presses — so the only thing to learn
              when you step inside is that the left stick now moves you instead
              of the model.

              The stick is split across two rows because it does two different
              things on its two axes, and one row saying "spin it" leaves the
              tilt undiscovered. `use-doll-house-rotation` maps x to yaw and y
              to tilt, so both are real.

              The right STICK is deliberately unbound here, which is why it is
              not listed: aiming and turning would fight each other, and there
              is nothing in this view to turn.
            */}
            <Row control={stick("Left stick ← →")}>
              Spin the model round
            </Row>
            <Row control={stick("Left stick ↑ ↓")}>
              Tip it towards you or away
            </Row>
            <Row control={stick("Right trigger")}>
              Press the model to step inside
            </Row>
          </>
        )}

        {/* No heading over these. The chips are the same glyphs on screen at
            the bottom of the view, which says "these are those" without a row
            of type to say it. */}
        <Row control={button(HouseIcon)}>
          {isFirstPerson ? "Back to where you started" : "Re-frame the model"}
        </Row>

        {isFirstPerson && hasPlaces && (
          <Row control={button(MapPinIcon)}>Travel to a saved viewpoint</Row>
        )}

        {isFirstPerson && hasResources && (
          <Row control={button(LayersIcon)}>
            Find a place — markers only appear this way
          </Row>
        )}

        {isFirstPerson && (
          <Row control={button(BoxIcon)}>See the whole venue on a table</Row>
        )}

        {hasVenues && (
          <Row control={button(BuildingIcon)}>Move to another venue</Row>
        )}

        <Row control={button(InfoIcon)}>Show this again</Row>
        <Row control={button(LogOutIcon)}>Leave VR</Row>
      </PanelList>

      {/*
        FULL WIDTH, as the reference panel has it — see `PrimaryButton`'s
        `fullWidth` for why that is the right call on this one panel.
      */}
      <Container width="100%" flexShrink={0}>
        <PrimaryButton
          label={isFirstPerson ? "Start walking" : "Start exploring"}
          onSelect={onDismiss}
          fullWidth
        />
      </Container>
    </VRPanel>
  );
}
