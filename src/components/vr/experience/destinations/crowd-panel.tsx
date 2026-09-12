"use client";

import { Container } from "@react-three/uikit";
import { ZapIcon } from "@react-three/uikit-lucide";
import { CROWD_DOT, CROWD_WORD } from "@/components-v5/shared/crowd-display";
import type { VRCrowdRow } from "@/components/vr/data";
import { PanelList } from "../ui/panel-list";
import { MenuRow } from "../ui/menu-row";
import { PanelHeader } from "../ui/panel-parts";
import { VRText } from "../ui/text";
import { COLOR, RADIUS, SPACE, TEXT } from "../ui/tokens";

/**
 * How busy each way in is, clearest first.
 *
 * BUILT FROM WHAT IS ACTUALLY AUTHORED, which is less than the flat app's types
 * suggest and more than it ever shows. `FloorConfig` declares a `crowdFeed`
 * array and a `crowdFlowGlb` heat-map overlay; neither is filled in for any
 * venue in `scenes.json`, the feed component is imported by nothing, and the
 * overlay never mounts. What IS authored is `crowd` and `crowdNote` on
 * individual POIs — seven of them across the memorial and the stadium — and
 * that data has been reaching VR all along, one badge at a time on whichever
 * card happened to be open.
 *
 * So this panel is not a port of a feed that exists elsewhere. It is the same
 * readings, gathered into the list they were always describing: the question
 * "which gate should I use?" answered in one place instead of by opening six
 * cards and remembering them.
 *
 * The ranking is `data`'s, done once at load. Ties keep authoring order, which
 * groups a venue's gates together.
 */

/** The recommendation strip. Drawn only when something is actually clearest. */
function FastestEntry({ row }: { row: VRCrowdRow }) {
  return (
    <Container
      width="100%"
      flexShrink={0}
      flexDirection="row"
      alignItems="center"
      gap={SPACE.icon}
      paddingX={SPACE.row}
      paddingY={SPACE.row}
      borderRadius={RADIUS.row}
      borderWidth={1}
      borderColor={COLOR.rowBorderActive}
      backgroundColor={COLOR.rowActive}
    >
      <ZapIcon
        width={22}
        height={22}
        color={COLOR.accentBright}
        pointerEvents="none"
      />
      <Container
        flexGrow={1}
        flexShrink={1}
        minWidth={0}
        flexDirection="column"
        gapRow={4}
      >
        <VRText fontSize={TEXT.label} color={COLOR.accentBright}>
          Fastest way in
        </VRText>
        <VRText fontSize={TEXT.body} color={COLOR.text}>
          {row.title}
        </VRText>
      </Container>
    </Container>
  );
}

export function CrowdPanel({
  rows,
  venueTitle,
  onSelect,
  onBack,
  onClose,
}: {
  rows: VRCrowdRow[];
  venueTitle: string;
  /** Open the destination this reading belongs to, if it is one you can go to. */
  onSelect: (destinationId: string) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  /**
   * The head of the list is the recommendation — but only if it is genuinely
   * clear. A "fastest way in" that is itself heavy is not advice, it is the
   * least bad of several bad options dressed up as a suggestion.
   */
  const fastest = rows[0]?.crowd === "low" ? rows[0] : null;

  return (
    <>
      <PanelHeader
        title="Crowd"
        subtitle={venueTitle}
        onBack={onBack}
        onClose={onClose}
      />

      <PanelList align="flex-start">
        {rows.length === 0 ? (
          <VRText fontSize={TEXT.body} color={COLOR.muted}>
            No crowd readings are published for this venue.
          </VRText>
        ) : (
          <>
            {fastest && <FastestEntry row={fastest} />}

            {rows.map((row) => (
              <MenuRow
                key={row.destinationId}
                label={row.title}
                detail={row.note ?? CROWD_WORD[row.crowd]}
                icon={
                  <Container
                    width={12}
                    height={12}
                    borderRadius={RADIUS.dot}
                    backgroundColor={CROWD_DOT[row.crowd] ?? COLOR.muted}
                    pointerEvents="none"
                  />
                }
                onSelect={() => onSelect(row.destinationId)}
              />
            ))}
          </>
        )}
      </PanelList>
    </>
  );
}
