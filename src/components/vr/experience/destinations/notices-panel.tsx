"use client";

import { Container } from "@react-three/uikit";
import {
  BanIcon,
  CalendarClockIcon,
  DoorClosedIcon,
  MegaphoneIcon,
  ShieldAlertIcon,
  TrophyIcon,
} from "@react-three/uikit-lucide";
import type { ComponentType } from "react";
import {
  noticeKind,
  postedAtTime,
  type NoticeKindKey,
} from "@/components-v5/shared/notice-kind";
import type { VRNotice } from "@/components/vr/data";
import { PanelList } from "../ui/panel-list";
import { PanelHeader } from "../ui/panel-parts";
import { VRText } from "../ui/text";
import { COLOR, RADIUS, SPACE, TEXT } from "../ui/tokens";

/**
 * The notice board — event updates, closures, schedule changes.
 *
 * THINGS TO KNOW, NOT PLACES TO GO, which is why these come out of the adapter
 * as their own list rather than as destinations. The flat site files them under
 * `pois` with a camera because it frames them for a card; "West Ramp Closed" is
 * still not somewhere to send anybody, and four of the stadium's sit sixteen
 * metres out over the pitch.
 *
 * Travel is offered anyway where a notice has a camera, because the ones that
 * do are usually worth looking at — and the teleport driver snaps every landing
 * onto walkable ground near the authored height, so even the mid-air ones put
 * the player on the nearest real floor rather than in the air above the field.
 *
 * The classification is `shared/notice-kind`, the same rules the flat overlay
 * uses, so a closure is a closure in both views and gets the same colour.
 */

type Glyph = ComponentType<{
  width: number;
  height: number;
  color: string;
  pointerEvents?: "none";
}>;

const KIND_GLYPH: Record<NoticeKindKey, Glyph> = {
  closure: DoorClosedIcon,
  security: ShieldAlertIcon,
  schedule: CalendarClockIcon,
  restriction: BanIcon,
  event: TrophyIcon,
  default: MegaphoneIcon,
};

/** The icon tile beside each notice, sized to sit level with two lines. */
const TILE = 44;
const GLYPH = 22;

function Notice({
  notice,
  onSelect,
}: {
  notice: VRNotice;
  onSelect?: () => void;
}) {
  const { key, color } = noticeKind(notice.option, COLOR.accentBright);
  const Icon = KIND_GLYPH[key];

  /**
   * A posted-at time, from the notice's own tags where one is authored and
   * otherwise hashed from its id. The hash is stable across renders, which is
   * what keeps a board from reshuffling its timestamps every time it opens.
   */
  const when =
    notice.tags?.find((tag) => /^\d{1,2}:\d{2}$/.test(tag)) ??
    postedAtTime(notice.id);

  return (
    <Container
      width="100%"
      flexShrink={0}
      flexDirection="row"
      alignItems="flex-start"
      gap={SPACE.icon}
      paddingX={SPACE.row}
      paddingY={SPACE.row}
      borderRadius={RADIUS.row}
      borderWidth={1}
      borderColor={COLOR.rowBorder}
      backgroundColor={COLOR.rowRest}
      cursor={onSelect ? "pointer" : undefined}
      /**
       * SPREAD, NEVER `hover={undefined}`. uikit tests for the key rather than
       * the value — `Object.entries(properties.hover)` — so passing the prop
       * with an undefined value is not the same as omitting it: it throws
       * "Cannot convert undefined or null to object" while the Container is
       * being constructed, which unmounts the whole VR tree and lands on the
       * error boundary. `IconButton` documents the same trap.
       */
      {...(onSelect ? { hover: { backgroundColor: COLOR.rowHover } } : {})}
      onPointerDown={onSelect}
    >
      <Container
        width={TILE}
        height={TILE}
        flexShrink={0}
        borderRadius={RADIUS.chip}
        backgroundColor={COLOR.rowActive}
        alignItems="center"
        justifyContent="center"
      >
        {/* Same rule as every other glyph in this UI: a child centred on the
            target would otherwise swallow the press aimed at it. */}
        <Icon width={GLYPH} height={GLYPH} color={color} pointerEvents="none" />
      </Container>

      <Container
        flexGrow={1}
        flexShrink={1}
        minWidth={0}
        flexDirection="column"
        gapRow={4}
      >
        <VRText fontSize={TEXT.label} color={COLOR.muted} wordBreak="keep-all">
          {`${notice.option ?? "Update"} - ${when}`}
        </VRText>
        <VRText fontSize={TEXT.body} color={COLOR.text}>
          {notice.title}
        </VRText>
        {!!notice.note && (
          <VRText fontSize={TEXT.label} color={COLOR.muted}>
            {notice.note}
          </VRText>
        )}
      </Container>
    </Container>
  );
}

export function NoticesPanel({
  notices,
  venueTitle,
  onTravel,
  onBack,
  onClose,
}: {
  notices: VRNotice[];
  venueTitle: string;
  onTravel: (notice: VRNotice) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <PanelHeader
        title="Event updates"
        subtitle={venueTitle}
        onBack={onBack}
        onClose={onClose}
      />

      <PanelList align="flex-start">
        {notices.length === 0 ? (
          <VRText fontSize={TEXT.body} color={COLOR.muted}>
            Nothing is posted for this venue.
          </VRText>
        ) : (
          notices.map((notice) => (
            <Notice
              key={notice.id}
              notice={notice}
              onSelect={
                notice.camera ? () => onTravel(notice) : undefined
              }
            />
          ))
        )}
      </PanelList>
    </>
  );
}
