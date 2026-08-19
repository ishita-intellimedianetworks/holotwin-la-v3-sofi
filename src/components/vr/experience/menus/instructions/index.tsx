"use client";

import type { ReactNode } from "react";
import { Container } from "@react-three/uikit";
import {
  BoxIcon,
  BuildingIcon,
  CrosshairIcon,
  HouseIcon,
  InfoIcon,
  JoystickIcon,
  LayersIcon,
  LogOutIcon,
  MapPinIcon,
} from "@react-three/uikit-lucide";
import { useVenue } from "@/components/vr/data/venue-provider";
import { VENUES } from "@/components/vr/data";
import { VRPanel } from "../../ui/panel";
import { PanelList } from "../../ui/panel-list";
import { PrimaryButton } from "../../ui/panel-parts";
import { COLOR, SPACE, TEXT } from "../../ui/tokens";
import { VRText } from "../../ui/text";

/**
 * Controls. A separate set per view, because the controls genuinely differ.
 *
 * IT NAMES EVERY BUTTON. The tempting argument against is that the dock is on
 * screen while you read this and its actions speak for themselves. They do not:
 * they are glyphs, not labels, and Resources in particular is the only way a
 * marker appears at all — nothing else in a headset would tell you the
 * empty-looking concourse is deliberate.
 *
 * IT STAYS A SMALL CARD ANYWAY. Extra lines are paid for by scrolling, not by
 * growing.
 *
 * EVERY LINE IS LED BY THE THING IT DESCRIBES. There are no bullets: a bullet
 * only says "a line starts here", which the layout already says. A joystick
 * leads the thumbstick lines and the dock's own icon leads each button.
 *
 * THE WORDING FOLLOWS THE FLAT SITE'S OWN INSTRUCTIONS OVERLAY, which phrases
 * every line as the action then its result. Same two views, same job, so the
 * two should not describe it in two different voices.
 */

/**
 * The leading slot. Every line has one, so their text shares a left edge.
 * Matches the dock's glyphs, scaled to a line of body text.
 */
const GLYPH = 20;

/**
 * One line.
 *
 * `flexShrink={0}` so it keeps its height in the scrolling list, and the text
 * grows into the space the glyph leaves — a `Text` in a flex row has no
 * intrinsic width to wrap against, so without that it lays out at its full
 * single-line length and runs straight out of the card.
 */
function Line({ icon, children }: { icon: ReactNode; children: string }) {
  return (
    <Container
      flexDirection="row"
      alignItems="center"
      justifyContent="flex-start"
      gap={SPACE.icon}
      width="100%"
      flexShrink={0}
    >
      <Container
        width={GLYPH}
        height={GLYPH}
        flexShrink={0}
        alignItems="center"
        justifyContent="center"
      >
        {icon}
      </Container>
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

/** A dock button, at the dock's own colour — same icon, same white, so the two
 *  read as the same control. */
const glyph = (Icon: typeof HouseIcon) => (
  <Icon width={GLYPH} height={GLYPH} color={COLOR.text} />
);

/**
 * A CONTROLLER action, muted.
 *
 * Deliberately not the buttons' white. A joystick is something in your hands;
 * the white glyphs are things on the dock you can point at. Drawn identically
 * they would read as more buttons, two of which do not exist.
 */
const input = (Icon: typeof JoystickIcon) => (
  <Icon width={GLYPH} height={GLYPH} color={COLOR.muted} />
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
    // stadium is nine lines, the doll house in the hotel room is five, and a
    // fixed height sized for the longest leaves the shortest with a third of
    // its card empty. A panel with a hole in the bottom of it reads as
    // something that failed to load.
    //
    // Higher than the 46% default, for the opposite reason that default is low:
    // this is not a list you scroll but a set of lines you read once, so the
    // right outcome is that they all fit and no bar is drawn.
    <VRPanel maxHeight="62%" onDismiss={onDismiss}>
      {/*
        A CENTRED TITLE, not the shared `PanelHeader`. That component is a row —
        title left, close disc right — and this is the one panel with no close
        button, since `Enter` dismisses it. Left-aligning a title against
        nothing just leaves a hole where the disc would be.

        It also NAMES THE VIEW. Both sets of instructions are the same card in
        the same place and only the lines differ, so without this there is
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
          {isFirstPerson
            ? "First Person View Instructions"
            : "Doll House View Instructions"}
        </VRText>
        <VRText fontSize={TEXT.label} color={COLOR.muted} textAlign="center">
          {venue.title}
        </VRText>
      </Container>

      <PanelList align="flex-start">
        {isFirstPerson ? (
          <>
            <Line icon={input(JoystickIcon)}>
              Push the Left Thumbstick to walk in the direction you are looking
            </Line>
            <Line icon={input(JoystickIcon)}>
              Push the Right Thumbstick to turn left/right
            </Line>
            <Line icon={input(CrosshairIcon)}>
              Point at a Marker and press the Trigger to open it
            </Line>
          </>
        ) : (
          <>
            {/* Left rotates, right points — the same division of labour as
                first person, and the reason the right stick is not mentioned
                here is that it deliberately does nothing in this view. */}
            <Line icon={input(JoystickIcon)}>
              Push the Left Thumbstick to rotate the model and look at it from
              different angles
            </Line>
            <Line icon={input(CrosshairIcon)}>
              Point at the Model and press the Trigger to go to First Person
              View
            </Line>
          </>
        )}

        {/* No heading over these. The glyphs are the same ones on screen at the
            bottom of the view, which says "these are those" without a row of
            type to say it. */}
        <Line icon={glyph(HouseIcon)}>
          {isFirstPerson
            ? "Click on the Home Button to reset the view to the starting position"
            : "Click on the Home Button to re-frame the model"}
        </Line>

        {isFirstPerson && hasPlaces && (
          <Line icon={glyph(MapPinIcon)}>
            Click on the Layouts Button to travel to a saved viewpoint
          </Line>
        )}

        {isFirstPerson && hasResources && (
          <Line icon={glyph(LayersIcon)}>
            Click on the Resources Button to find a location and travel to it —
            markers only appear this way
          </Line>
        )}

        {isFirstPerson && (
          <Line icon={glyph(BoxIcon)}>
            Click on the Doll House Button to go back to Doll House View
          </Line>
        )}

        {hasVenues && (
          <Line icon={glyph(BuildingIcon)}>
            Click on the Venues Button to move to another venue without leaving
            VR
          </Line>
        )}

        <Line icon={glyph(InfoIcon)}>
          Click on the Info Button to show these instructions again
        </Line>
        <Line icon={glyph(LogOutIcon)}>
          Click on the Exit Button to leave VR
        </Line>
      </PanelList>

      <Container
        width="100%"
        flexShrink={0}
        justifyContent="center"
        alignItems="center"
      >
        {/*
          Named for the view you are entering, as the flat overlay names its
          own button ("Enter Doll House View"). A bare "Enter" is ambiguous on
          a panel that can be either of two sets — and the flat site is the
          voice this whole panel follows.
        */}
        <PrimaryButton
          label={
            isFirstPerson ? "Enter First Person View" : "Enter Doll House View"
          }
          onSelect={onDismiss}
        />
      </Container>
    </VRPanel>
  );
}
