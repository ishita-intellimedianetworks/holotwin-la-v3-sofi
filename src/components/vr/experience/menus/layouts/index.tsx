"use client";

import { Fragment, useMemo } from "react";
import type { VRLayout } from "@/components/vr/data";
import { VRPanel } from "../../ui/panel";
import { PanelList } from "../../ui/panel-list";
import { MenuRow } from "../../ui/menu-row";
import { PanelHeader, SectionLabel } from "../../ui/panel-parts";
import { COLOR, TEXT } from "../../ui/tokens";
import { VRText } from "../../ui/text";
import { crowdLabel, groupByCategoryAndOption } from "../grouping";

/**
 * EVERY destination in the venue, in one list.
 *
 * ONE BUTTON, NOT A RAIL. This briefly mirrored the flat site's bottom bar
 * literally — a button per category, each opening its own panel. In a headset
 * that turned out to be the wrong trade: it puts six to eight extra discs in a
 * dock that is already competing for the comfortable middle of the view, and it
 * makes finding a place a two-step guess ("which category was the medical post
 * under?") instead of one scroll through a list that is already labelled.
 *
 * The categories did not go away — they became the HEADINGS. Everything is
 * still filed the way `scenes.json` files it, category then subcategory, so the
 * organisation the flat rail expresses as buttons is expressed here as
 * structure. Same information, one press instead of two, and no rail.
 *
 * PICKING A ROW DOES BOTH THINGS AT ONCE: travels to the viewpoint the
 * destination was authored to be seen from, and reveals its markers. In the
 * flat site a destination and its map pins are one object, so splitting them
 * across two menus made two lists out of one idea.
 */
export function LayoutsMenu({
  layouts,
  venueTitle,
  onSelect,
  onClose,
}: {
  layouts: VRLayout[];
  venueTitle: string;
  onSelect: (destinationId: string) => void;
  onClose: () => void;
}) {
  /**
   * EVERY ROW IS SOMEWHERE YOU CAN GO. Nothing else is listed.
   *
   * This briefly also carried destinations that exist only as markers — a pin
   * with no authored viewpoint. Pressing one revealed it and did not move you,
   * so the list mixed two different promises under one appearance: most rows
   * took you somewhere, some silently did not. `venue.layouts` is already
   * exactly the set with a camera (and `data` keeps notices like Event Updates
   * out of it), so this is now just that set.
   */
  const rows = layouts;

  const groups = useMemo(() => groupByCategoryAndOption(rows), [rows]);

  return (
    <VRPanel onDismiss={onClose}>
      {/* "Layouts" is what the rest of the product calls these — the
          `scenes.json` key and the flat viewer's own label. */}
      <PanelHeader title="Layouts" subtitle={venueTitle} onClose={onClose} />

      <PanelList>
        {rows.length === 0 ? (
          <VRText fontSize={TEXT.body} color={COLOR.muted}>
            This venue has no saved viewpoints.
          </VRText>
        ) : (
          groups.map((group) => (
            <Fragment key={group.group}>
              {/* The category — what the flat rail draws as a button. */}
              <SectionLabel>{group.group}</SectionLabel>

              {group.sections.map((section) => (
                <Fragment key={section.option ?? "_"}>
                  {/*
                    The subcategory — `scenes.json`'s `option`, the flat panel's
                    chip rail. Only drawn where the venue authored more than
                    one; a lone heading under its category says nothing the
                    category did not.
                  */}
                  {section.option && group.sections.length > 1 && (
                    <SectionLabel indent>{section.option}</SectionLabel>
                  )}

                  {section.items.map((row) => (
                    <MenuRow
                      key={row.id}
                      label={row.title}
                      detail={crowdLabel(row.crowd)}
                      onSelect={() => {
                        onSelect(row.destinationId);
                        onClose();
                      }}
                    />
                  ))}
                </Fragment>
              ))}
            </Fragment>
          ))
        )}
      </PanelList>
    </VRPanel>
  );
}
