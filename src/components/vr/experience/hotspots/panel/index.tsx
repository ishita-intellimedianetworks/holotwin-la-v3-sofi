"use client";

import { Container } from "@react-three/uikit";
import type { VRHotspot } from "@/components/vr/data";
import { VRPanel } from "../../ui/panel";
import { PanelList } from "../../ui/panel-list";
import { PanelHeader } from "../../ui/panel-parts";
import { COLOR, RADIUS, SPACE, TEXT } from "../../ui/tokens";
import { VRText } from "../../ui/text";

/**
 * What a marker opens — the flat site's destination card, rebuilt on the kit.
 *
 * IT SHOWS WHAT THE FLAT CARD SHOWS: the tag chips, the crowd line, the note
 * and the bullet points. Those are four separate fields in `scenes.json` and
 * this used to render only one of them, which made the panel look like the data
 * was thin when it was not — the memorial alone authors notes on 15 POIs and
 * tags on 10.
 *
 * TEXT AND CHIPS ONLY, because that is genuinely all the data has. Not one POI
 * across all four venues carries a `thumbnail`, so an image slot would be a
 * frame around nothing, and the media viewers the reference ships have nothing
 * here to view.
 *
 * A hotspot with none of these says so rather than opening an empty card. Most
 * stadium markers are wayfinding points with a name and a position and nothing
 * else, and their panel's whole job is to confirm what you are looking at.
 */

/** The leading dot on a bullet line. Small, because the line is the content. */
const BULLET = 6;

function Bullet({ children }: { children: string }) {
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

/** A tag chip, matching the flat card's pills. */
function Chip({ children }: { children: string }) {
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

/**
 * How busy it is.
 *
 * The flat site colours its cards by crowd level; a headset panel has no card
 * edge to tint, so the line itself carries the weight. Only "high" is
 * coloured — a warning that fires on every level is not a warning.
 */
function Crowd({ crowd, note }: { crowd?: string; note?: string }) {
  if (!note) return null;
  return (
    <Container width="100%" flexShrink={0}>
      <VRText
        fontSize={TEXT.body}
        color={crowd === "high" ? COLOR.dangerHover : COLOR.muted}
      >
        {note}
      </VRText>
    </Container>
  );
}

export function HotspotPanel({
  hotspot,
  onClose,
}: {
  hotspot: VRHotspot;
  onClose: () => void;
}) {
  const points = hotspot.points ?? [];
  const tags = hotspot.tags ?? [];
  const hasBody =
    !!hotspot.note ||
    !!hotspot.crowdNote ||
    points.length > 0 ||
    tags.length > 0;

  /**
   * The subcategory when there is one, else the category. A name alone often
   * does not say what kind of thing it is — "Peristyle" reads very differently
   * under "Gates & Facilities" than under "Safety & Exits" — and the
   * subcategory is the more specific of the two.
   */
  const subtitle = hotspot.option ?? hotspot.group;

  return (
    <VRPanel width="46%" maxHeight="56%" onDismiss={onClose}>
      <PanelHeader
        title={hotspot.label}
        subtitle={subtitle}
        onClose={onClose}
      />

      <PanelList align="flex-start">
        {hasBody ? (
          <>
            {tags.length > 0 && (
              <Container
                width="100%"
                flexShrink={0}
                flexDirection="row"
                flexWrap="wrap"
                gap={SPACE.row}
              >
                {tags.map((tag) => (
                  <Chip key={tag}>{tag}</Chip>
                ))}
              </Container>
            )}

            <Crowd crowd={hotspot.crowd} note={hotspot.crowdNote} />

            {!!hotspot.note && (
              <Container width="100%" flexShrink={0}>
                <VRText fontSize={TEXT.body} color={COLOR.text}>
                  {hotspot.note}
                </VRText>
              </Container>
            )}

            {points.map((point) => (
              <Bullet key={point}>{point}</Bullet>
            ))}
          </>
        ) : (
          <Container width="100%" flexShrink={0}>
            <VRText fontSize={TEXT.body} color={COLOR.muted}>
              No further details are recorded for this location.
            </VRText>
          </Container>
        )}
      </PanelList>
    </VRPanel>
  );
}
