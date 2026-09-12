"use client";

import { useVenueContext } from "@/components/vr/data/venue-provider";
import { useVenueLoad } from "../load-progress";
import { useVRState } from "../state";
import { DestinationsPanel } from "../destinations";
import { MapPanel } from "../map";
import { InstructionsMenu } from "./instructions";
import { VenuesMenu } from "./venues";

/**
 * Menu controller: renders whichever panel is open, and nothing else. Only one
 * is ever mounted.
 *
 * What OPENS them is the dock in `../toolbar`: one button each for the
 * destination sheet, the floor plan, the venue list and the instructions.
 */
export function VRMenus() {
  const {
    view,
    openMenu: open,
    setOpenMenu,
    goToDollHouse,
  } = useVRState();

  const { venueId, setVenue } = useVenueContext();
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

  /*
    Both of these take over their own travel, rather than reporting a choice
    back up here to be acted on. That is the difference between them and the
    menu they replaced: a list of viewpoints has one thing it can do with a
    press, and a sheet with a timetable, a seat plot and a notice board in it
    has several. Handing each panel the state hooks directly keeps this file a
    router, which is all it ever claimed to be.
  */
  if (open === "destinations") {
    return <DestinationsPanel onClose={close} />;
  }

  if (open === "map") {
    return <MapPanel onClose={close} />;
  }

  return null;
}
