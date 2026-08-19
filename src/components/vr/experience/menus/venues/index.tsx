"use client";

import { BuildingIcon } from "@react-three/uikit-lucide";
import { SITE_LABEL, VENUES } from "@/components/vr/data";
import { VRPanel } from "../../ui/panel";
import { PanelList } from "../../ui/panel-list";
import { MenuRow } from "../../ui/menu-row";
import { PanelHeader } from "../../ui/panel-parts";
import { COLOR, TEXT } from "../../ui/tokens";
import { VRText } from "../../ui/text";

/**
 * The whole site, from inside the headset.
 *
 * THIS IS WHAT MAKES `/vr` A VR PAGE FOR THE SITE RATHER THAN FOR ONE MODEL.
 * The flat site swaps venues through its sidebar without a reload; doing it any
 * other way here would mean leaving the session, taking the headset off, using
 * a picker and putting it back on — four venues, three headset removals.
 *
 * A switch drops the player back into the DOLL HOUSE rather than into first
 * person, which is the same thing arriving does. Landing straight inside a
 * building you have never seen, at a spawn point chosen for a different visit,
 * is disorienting in a way that looking at the model first is not.
 *
 * The row you are already in is marked and still pressable — pressing it is a
 * no-op by design (`setVenue` guards on identity), so a mis-aimed press costs
 * nothing rather than reloading the model you are standing in.
 */
export function VenuesMenu({
  activeVenueId,
  onSelect,
  onClose,
}: {
  activeVenueId: string;
  onSelect: (venueId: string) => void;
  onClose: () => void;
}) {
  return (
    <VRPanel onDismiss={onClose}>
      <PanelHeader title="Venues" subtitle={SITE_LABEL} onClose={onClose} />

      <PanelList>
        {VENUES.length === 0 ? (
          <VRText fontSize={TEXT.body} color={COLOR.muted}>
            No venues are available.
          </VRText>
        ) : (
          VENUES.map((venue) => (
            <MenuRow
              key={venue.id}
              label={venue.title}
              active={venue.id === activeVenueId}
              detail={venue.id === activeVenueId ? "Here" : undefined}
              icon={
                <BuildingIcon
                  width={18}
                  color={
                    venue.id === activeVenueId
                      ? COLOR.accentBright
                      : COLOR.muted
                  }
                />
              }
              onSelect={() => {
                onSelect(venue.id);
                onClose();
              }}
            />
          ))
        )}
      </PanelList>
    </VRPanel>
  );
}
