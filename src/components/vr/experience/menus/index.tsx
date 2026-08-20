"use client";

import { useVenueContext } from "@/components/vr/data/venue-provider";
import { useVenueLoad } from "../load-progress";
import { useVRState } from "../state";
import { LayoutsMenu } from "./layouts";
import { InstructionsMenu } from "./instructions";
import { VenuesMenu } from "./venues";

/**
 * Menu controller: renders whichever panel is open, and nothing else. Only one
 * is ever mounted.
 *
 * What OPENS them is the dock in `../toolbar`: one button each for the layout
 * list, the venue list and the instructions.
 */
export function VRMenus() {
  const {
    view,
    openMenu: open,
    setOpenMenu,
    teleportTo,
    revealDestination,
    goToDollHouse,
  } = useVRState();

  const { venue, venueId, setVenue } = useVenueContext();
  const { ready } = useVenueLoad();

  const close = () => setOpenMenu(null);

  /**
   * NOTHING IS DRAWN UNTIL THE VENUE IS.
   *
   * `openMenu` starts on "instructions" — the panel is how a first-time visitor
   * learns which stick walks — and that initial value is live from the first
   * frame, which is several seconds before the model has decoded. The
   * instructions panel and the loading panel are both centred in front of the
   * face, so both were drawn, overlapping, and the one that says "please wait"
   * was behind the one that says "press the left stick to walk".
   *
   * Held rather than cancelled: the menu is still open, so it appears the
   * moment the venue is ready, which is when it can be acted on anyway. The
   * dock is gated on the same signal — see `../toolbar`.
   */
  if (!ready) return null;

  /**
   * First-person-only panels are gated on the view too. The dock already hides
   * their buttons in the doll house, but this makes it a fact about the tree
   * rather than one call site being careful.
   */
  const isFirstPerson = view === "first-person";

  if (open === "instructions") {
    return <InstructionsMenu view={view} onDismiss={close} />;
  }

  if (open === "venues") {
    return (
      <VenuesMenu
        activeVenueId={venueId}
        onSelect={(id) => {
          setVenue(id);
          /**
           * Back to the doll house on the way in. `setVenue` re-keys the state
           * provider, which resets the view on its own — this is here for the
           * one case that does not remount: picking the venue you are already
           * in, where `setVenue` is a deliberate no-op. Without it that press
           * would close the menu and leave you where you were, which reads as
           * the button not working.
           */
          goToDollHouse();
        }}
        onClose={close}
      />
    );
  }

  if (!isFirstPerson) return null;

  if (open === "layouts") {
    return (
      <LayoutsMenu
        layouts={venue.layouts}
        venueTitle={venue.title}
        onSelect={(destinationId) => {
          /**
           * Travel to the destination's viewpoint if it has one, and reveal its
           * markers either way — the two halves of what the flat site does when
           * you pick a card. A destination with no camera is somewhere to look
           * at rather than somewhere to stand, so refusing the whole action for
           * want of a pose would make those rows dead.
           */
          const layout = venue.layouts.find(
            (l) => l.destinationId === destinationId,
          );
          if (layout) {
            teleportTo({
              position: layout.position,
              rotationY: layout.rotationY,
            });
          }
          revealDestination(destinationId);
        }}
        onClose={close}
      />
    );
  }

  return null;
}
