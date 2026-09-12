"use client";

import { Container } from "@react-three/uikit";
import type { VRLayout } from "@/components/vr/data";
import { PanelList } from "../ui/panel-list";
import { PanelHeader, PrimaryButton } from "../ui/panel-parts";
import { SPACE } from "../ui/tokens";
import { Bullet, ChipRow, CrowdLine, Prose, Stat } from "./parts";

/**
 * One destination, in full — the flat site's directions card.
 *
 * THE TELEPORT BRANCH, AND ONLY THE TELEPORT BRANCH. The flat card has two:
 * walk there following a route, or travel instantly when there is no route to
 * follow. VR has no pathfinder by choice, so every destination takes the second
 * one — which is not a degraded version of the first. It is the branch the flat
 * card already shows for the stadium's upper concourse and every seat view, its
 * own copy and all, because those were never walkable either.
 *
 * What is missing compared to the flat card is therefore the turn list and the
 * route ETA, both of which are readings off a path that does not exist here.
 * Distance still does: it is measured straight-line, which is the shortest a
 * walk could be.
 */
export function PlaceDetail({
  place,
  distance,
  eta,
  onTravel,
  onBack,
  onClose,
}: {
  place: VRLayout;
  /** Straight-line distance, already formatted. */
  distance: string;
  /** Walking time over that distance, already formatted. */
  eta: string;
  onTravel: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <PanelHeader
        title={place.title}
        subtitle={place.option ?? place.group}
        onBack={onBack}
        onClose={onClose}
      />

      <PanelList align="flex-start">
        <ChipRow items={place.tags} />

        {/*
          Two figures side by side. Both are straight-line readings — see the
          note above — so they agree with each other and with the pin labels on
          the floor plan, which are measured the same way.
        */}
        <Container
          width="100%"
          flexShrink={0}
          flexDirection="row"
          gap={SPACE.section}
        >
          <Stat label="Distance" value={distance} />
          <Stat label="On foot" value={eta} />
        </Container>

        <CrowdLine crowd={place.crowd} note={place.crowdNote} />

        {!!place.note && <Prose>{place.note}</Prose>}

        {/* Restaurants author a few sample dishes; practice venues their
            sports. Both are lists of short names and read as bullets. */}
        {place.menu?.map((item) => <Bullet key={item}>{item}</Bullet>)}
        {place.sports?.map((sport) => <Bullet key={sport}>{sport}</Bullet>)}

        {place.open === false && (
          <Prose muted>This location is closed right now.</Prose>
        )}

        {/*
          Said plainly rather than by disabling the button. `teleportOnly`
          means the authors recorded that there is no walking route here — and
          since nothing in VR walks you anywhere, the button still works. The
          line exists so the two views do not disagree about the place.
        */}
        {place.teleportOnly && (
          <Prose muted>No step-free walking route reaches this spot.</Prose>
        )}
      </PanelList>

      <Container width="100%" flexShrink={0} paddingX={SPACE.listX}>
        <PrimaryButton label="Travel here" onSelect={onTravel} fullWidth />
      </Container>
    </>
  );
}
