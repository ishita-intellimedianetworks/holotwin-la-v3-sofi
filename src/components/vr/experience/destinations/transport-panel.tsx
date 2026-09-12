"use client";

import { useMemo } from "react";
import { Container } from "@react-three/uikit";
import { nextInMin } from "@/components-v5/interior-scene/ui/destination-sheet/transit-time";
import {
  depClock,
  lineCode,
  modeTag,
  occupancy,
} from "@/components-v5/shared/timetable";
import type { VRLayout } from "@/components/vr/data";
import type { TransportDestination } from "@/components-v5/shared/types";
import { PanelList } from "../ui/panel-list";
import { MenuRow } from "../ui/menu-row";
import { PanelHeader, PrimaryButton } from "../ui/panel-parts";
import { VRText } from "../ui/text";
import { COLOR, RADIUS, SPACE, TEXT } from "../ui/tokens";
import { Prose } from "./parts";

/**
 * Where you can get to from here, and what to catch.
 *
 * TWO LISTS, ONE BOARD. The venues are `transportDestinations` in
 * `scenes.json` — places elsewhere in the city, each naming the hub you board
 * at. The board is that hub's own `transit.routes`, which reach VR on the
 * layout for the hub itself.
 *
 * The countdown is `nextInMin` from the flat site, unchanged: a stable per-route
 * phase hashed from its name, so two routes on the same headway do not depart
 * in lockstep and the same route does not jump around between renders. The
 * clock it is given is passed in rather than read here — see `./index`, which
 * ticks it slowly on purpose.
 */

/** The line badge — a two-letter code over its mode. */
function LineBadge({ code, tag }: { code: string; tag: string }) {
  return (
    <Container
      width={54}
      flexShrink={0}
      flexDirection="column"
      alignItems="center"
      gapRow={2}
      paddingY={6}
      borderRadius={RADIUS.chip}
      backgroundColor={COLOR.rowActive}
      borderWidth={1}
      borderColor={COLOR.rowBorderActive}
    >
      <VRText fontSize={TEXT.body} color={COLOR.text} wordBreak="keep-all">
        {code}
      </VRText>
      <VRText fontSize={TEXT.label} color={COLOR.muted} wordBreak="keep-all">
        {tag}
      </VRText>
    </Container>
  );
}

/**
 * The three-segment occupancy strip, rebuilt as three boxes.
 *
 * The flat card draws three 14x5 spans; uikit has no spans, and three
 * containers is exactly the same drawing. Filled segments take the tier
 * colour, empty ones the row border, which is what makes "1 of 3" read as
 * emptier rather than as broken.
 */
function Occupancy({ seats }: { seats: number | undefined }) {
  const occ = occupancy(seats);

  return (
    <Container flexShrink={0} flexDirection="row" alignItems="center" gap={6}>
      <Container flexDirection="row" gap={2}>
        {[0, 1, 2].map((i) => (
          <Container
            key={i}
            width={14}
            height={5}
            borderRadius={2}
            backgroundColor={i < occ.filled ? occ.color : COLOR.rowBorder}
          />
        ))}
      </Container>
      <VRText fontSize={TEXT.label} color={COLOR.muted} wordBreak="keep-all">
        {occ.label}
      </VRText>
    </Container>
  );
}

/** The departures board for one hub. */
function Timetable({ hub, now }: { hub: VRLayout; now: number }) {
  /**
   * Soonest first. The fallback is inside the memo rather than above it: an
   * `?? []` in the component body is a new array on every render, which would
   * make this dependency change every time and re-sort the board for nothing.
   */
  const departures = useMemo(
    () =>
      (hub.transitRoutes ?? [])
        .map((route) => ({
          route,
          eta: nextInMin(route.headwayMin, route.name, now),
        }))
        .sort((a, b) => a.eta - b.eta),
    [hub.transitRoutes, now],
  );

  if (departures.length === 0) return null;

  return (
    <>
      {departures.map(({ route, eta }) => (
        <Container
          key={route.name}
          width="100%"
          flexShrink={0}
          flexDirection="row"
          alignItems="center"
          gap={SPACE.icon}
          paddingX={SPACE.row}
          paddingY={SPACE.row}
          borderRadius={RADIUS.row}
          borderWidth={1}
          borderColor={COLOR.rowBorder}
          backgroundColor={COLOR.rowRest}
        >
          <LineBadge code={lineCode(route)} tag={modeTag(route)} />

          <Container
            flexGrow={1}
            flexShrink={1}
            minWidth={0}
            flexDirection="column"
            gapRow={4}
          >
            <VRText fontSize={TEXT.body} color={COLOR.text}>
              {route.to ? `${route.name} to ${route.to}` : route.name}
            </VRText>
            <Occupancy seats={route.seats} />
          </Container>

          <Container
            flexShrink={0}
            flexDirection="column"
            alignItems="flex-end"
            gapRow={4}
          >
            <VRText
              fontSize={TEXT.body}
              color={COLOR.accentBright}
              wordBreak="keep-all"
            >
              {`${eta} min`}
            </VRText>
            <VRText
              fontSize={TEXT.label}
              color={COLOR.muted}
              wordBreak="keep-all"
            >
              {depClock(now, eta)}
            </VRText>
          </Container>
        </Container>
      ))}
    </>
  );
}

export function TransportPanel({
  venues,
  hubs,
  venueTitle,
  now,
  selected,
  onSelect,
  onTravelToHub,
  onBack,
  onClose,
}: {
  venues: TransportDestination[];
  /** The hub layouts in this venue, by POI id — what `hubId` points at. */
  hubs: Map<string, VRLayout>;
  venueTitle: string;
  now: number;
  /** The chosen venue, or null while the list is showing. */
  selected: TransportDestination | null;
  onSelect: (venue: TransportDestination | null) => void;
  onTravelToHub: (hub: VRLayout) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const hub = selected ? (hubs.get(selected.hubId) ?? null) : null;

  if (selected) {
    return (
      <>
        <PanelHeader
          title={selected.label}
          subtitle={selected.sport ?? "Transit"}
          onBack={() => onSelect(null)}
          onClose={onClose}
        />

        <PanelList align="flex-start">
          {selected.lines.length > 0 && (
            <Prose muted>
              {`Board ${selected.lines.map((line) => line.name).join(" or ")}${
                hub ? ` at ${hub.title}` : ""
              }.`}
            </Prose>
          )}

          {hub ? (
            <Timetable hub={hub} now={now} />
          ) : (
            <Prose muted>
              The boarding point for this service is not mapped in this venue.
            </Prose>
          )}
        </PanelList>

        {hub && (
          <Container width="100%" flexShrink={0} paddingX={SPACE.listX}>
            <PrimaryButton
              label="Go to the stop"
              onSelect={() => onTravelToHub(hub)}
              fullWidth
            />
          </Container>
        )}
      </>
    );
  }

  return (
    <>
      <PanelHeader
        title="Transport"
        subtitle={venueTitle}
        onBack={onBack}
        onClose={onClose}
      />

      <PanelList>
        {venues.length === 0 ? (
          <VRText fontSize={TEXT.body} color={COLOR.muted}>
            No onward services are listed from this venue.
          </VRText>
        ) : (
          venues.map((venue) => (
            <MenuRow
              key={venue.id}
              label={venue.label}
              detail={venue.sport}
              /*
                A venue the data marks unreachable still opens — its card says
                what would serve it. Refusing the press would leave a row that
                looks broken rather than one that explains itself.
              */
              onSelect={() => onSelect(venue)}
            />
          ))
        )}
      </PanelList>
    </>
  );
}
