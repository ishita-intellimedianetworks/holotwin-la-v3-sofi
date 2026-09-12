"use client";

import { useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { Container } from "@react-three/uikit";
import {
  SEAT_VB_H,
  SEAT_VB_W,
  layoutSeats,
} from "@/components-v5/shared/seat-layout";
import type { Destination } from "@/components-v5/shared/types";
import type { VRLayout } from "@/components/vr/data";
import { PanelList } from "../ui/panel-list";
import { MenuRow } from "../ui/menu-row";
import { PanelHeader } from "../ui/panel-parts";
import { VRText } from "../ui/text";
import { COLOR, RADIUS, SPACE, TEXT } from "../ui/tokens";

/**
 * The bowl, seen from above, with a dot per section.
 *
 * NOT AN SVG, AND IT COULD NOT BE. The flat seat map is an `<svg viewBox>` with
 * an ellipse for the field and a `<circle>` per section; uikit has no SVG
 * primitive and no arbitrary path. What it does have is absolute positioning,
 * and a circle is a container with a full-radius corner — so the marks are
 * rebuilt out of boxes while the PLACEMENT is imported wholesale from
 * `shared/seat-layout`, which is the flat map's own `useMemo` lifted out.
 *
 * That split is the point. If the two views computed their own layouts they
 * would drift, and a seat map that puts the north stand in a different place
 * from the one the flat site shows is worse than no seat map.
 *
 * The plot is normalised into the flat viewBox's units, so everything here is a
 * fraction of that box rather than a pixel count — which is what lets the same
 * numbers drive a panel of any size.
 */

/** The dot, in uikit units. Large enough to be a comfortable ray target. */
const DOT = 34;

/** How tall the plot is, as a share of its width — the flat viewBox's ratio. */
const PLOT_ASPECT = SEAT_VB_W / SEAT_VB_H;

/**
 * How tall the plot is, as a share of the canvas height.
 *
 * SIZED AGAINST HEIGHT FOR THE SAME REASON THE FLOOR PLAN IS. A width of 100%
 * with an `aspectRatio` gives uikit a height it cannot refuse, and on a card
 * that is over a viewport-height wide that height is most of the panel — which
 * pushes the section list out of the card entirely and leaves the footer line
 * hanging below it. See `../map` for the same note.
 */
const PLOT_HEIGHT_SHARE = 0.28;

export function SeatMapPanel({
  seats,
  venueTitle,
  onSelect,
  onBack,
  onClose,
}: {
  seats: VRLayout[];
  venueTitle: string;
  onSelect: (seat: VRLayout) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  /**
   * `layoutSeats` speaks `Destination`, which is the flat shape. The two fields
   * it reads are the id and the camera position, so a VR layout is adapted
   * rather than the function being forked — one placement, two callers.
   */
  const plot = useMemo(() => {
    const asDestinations = seats.map(
      (seat) =>
        ({
          id: seat.id,
          label: seat.title,
          camera: { position: seat.position, rotation: [0, 0, 0] },
        }) as Destination,
    );
    return layoutSeats(asDestinations);
  }, [seats]);

  const byId = useMemo(
    () => new Map(seats.map((seat) => [seat.id, seat])),
    [seats],
  );

  /** Where each section sits in the list, for the dots that carry no number. */
  const order = useMemo(
    () => new Map(seats.map((seat, index) => [seat.id, index + 1])),
    [seats],
  );

  const viewportHeight = useThree((state) => state.size.height);
  const plotHeight = Math.round(viewportHeight * PLOT_HEIGHT_SHARE);
  const plotWidth = Math.round(plotHeight * PLOT_ASPECT);

  return (
    <>
      <PanelHeader
        title="Seat views"
        subtitle={venueTitle}
        onBack={onBack}
        onClose={onClose}
      />

      {plot && (
        <Container
          width={plotWidth}
          height={plotHeight}
          flexShrink={0}
          alignSelf="center"
          borderRadius={RADIUS.row}
          borderWidth={1}
          borderColor={COLOR.rowBorder}
          backgroundColor={COLOR.rowRest}
        >
          {/* The pitch. An ellipse in the flat map; here the roundest box
              uikit can draw, which at this size reads the same. */}
          <Container
            positionType="absolute"
            positionLeft={`${((plot.field.px - 46) / SEAT_VB_W) * 100}%`}
            positionTop={`${((plot.field.py - 28) / SEAT_VB_H) * 100}%`}
            width={`${(92 / SEAT_VB_W) * 100}%`}
            height={`${(56 / SEAT_VB_H) * 100}%`}
            borderRadius={RADIUS.dot}
            borderWidth={1}
            borderColor={COLOR.rowBorder}
          />

          {plot.seats.map((seat) => {
            const row = byId.get(seat.dest.id);
            if (!row) return null;

            return (
              <Container
                key={seat.dest.id}
                positionType="absolute"
                /*
                  Half the dot is subtracted so the position is its CENTRE, the
                  way an SVG circle's cx/cy works — otherwise every section
                  sits down and to the right of where it belongs, which on a
                  symmetrical bowl looks like a rotation rather than an offset.
                */
                positionLeft={`${(seat.px / SEAT_VB_W) * 100}%`}
                positionTop={`${(seat.py / SEAT_VB_H) * 100}%`}
                transformTranslateX={-DOT / 2}
                transformTranslateY={-DOT / 2}
                width={DOT}
                height={DOT}
                borderRadius={RADIUS.dot}
                backgroundColor={COLOR.rowActive}
                borderWidth={2}
                borderColor={COLOR.rowBorderActive}
                alignItems="center"
                justifyContent="center"
                cursor="pointer"
                hover={{ backgroundColor: COLOR.accent }}
                onPointerDown={() => onSelect(row)}
              >
                <VRText
                  fontSize={TEXT.label}
                  color={COLOR.text}
                  pointerEvents="none"
                  wordBreak="keep-all"
                >
                  {/*
                    THE LIST POSITION WHERE THERE IS NO SECTION NUMBER. Only the
                    stadium authors `section`; the memorial's three seat views
                    carry none, and a dot reading "*" looks like data that failed
                    to load rather than a seat. Numbering by list order keeps the
                    plot and the rows underneath referring to each other.
                  */}
                  {String(row.section ?? order.get(row.id) ?? "")}
                </VRText>
              </Container>
            );
          })}
        </Container>
      )}

      {/*
        THE LIST IS NOT A FALLBACK, it is the other half of the control. A dot
        34 units across is a fine target for a ray but it carries a section
        number and nothing else; the row underneath says which level it is on.
        The flat map solves the same problem with a hover readout, which a
        controller has no equivalent of.
      */}
      <PanelList>
        {seats.length === 0 ? (
          <VRText fontSize={TEXT.body} color={COLOR.muted}>
            This venue has no seat views.
          </VRText>
        ) : (
          seats.map((seat) => (
            <MenuRow
              key={seat.id}
              label={seat.title}
              detail={seat.option}
              onSelect={() => onSelect(seat)}
            />
          ))
        )}
      </PanelList>

      <Container width="100%" flexShrink={0} paddingX={SPACE.listX}>
        <VRText fontSize={TEXT.label} color={COLOR.muted}>
          Picking a seat sits you in it - there is no walk to a seat.
        </VRText>
      </Container>
    </>
  );
}
