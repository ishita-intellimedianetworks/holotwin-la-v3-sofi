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
import { VRText } from "../ui/text";
import { COLOR, RADIUS, SPACE, TEXT } from "../ui/tokens";

/**
 * A transport hub's departures board, drawn on the hub's own place card (see
 * `./place-detail`). The board is the hub's `transit.routes`, which reach VR on
 * the layout for the hub itself.
 *
 * There used to be a separate "Transport" list of onward venues as well; for
 * the village that was the one bus stop listed a second time, so it went.
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
export function Timetable({ hub, now }: { hub: VRLayout; now: number }) {
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
