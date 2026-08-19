"use client";

import { useVenue } from "@/components/vr/data/venue-provider";
import { useVRState } from "../state";
import { HotspotMarker } from "./marker";
import { HotspotPanel } from "./panel";

/**
 * Venue hotspots: in-world markers plus the panel one opens. The selection
 * lives in the session store because a marker and a Resources row both set it.
 */
export function Hotspots() {
  const {
    openHotspot: selected,
    setOpenHotspot: onSelect,
    panelIsOpen,
    revealedDestinationId,
  } = useVRState();
  const venue = useVenue();

  return (
    <>
      {/*
        EVERY MARKER IS MOUNTED, ALWAYS. Only `visible` and `pointerEvents` move.

        Two things gate a marker and both are tempting to do by mounting:

          - a panel is open, and a marker left in front of ANY panel is nearer
            than it, so it wins the ray;
          - it is not the hotspot that was asked for, which is every marker
            until one is.

        Mounting would pay for both with a stall. Each marker owns a troika
        `Text` that lays out glyphs and re-measures its plate on mount, and the
        stadium has twenty-three. Picking a row in Resources closes the menu,
        reveals one marker and starts the glide in a single commit — so all
        twenty-three would rebuild themselves on the first frame of the travel,
        which is the frame that can least afford it.
      */}
      {venue.hotspots.map((hotspot) => {
        /**
         * NOTHING IS SHOWN UNTIL SOMETHING IS ASKED FOR — the revealed id is
         * null on landing and matches nothing, so the venue starts clean.
         *
         * Matched on DESTINATION, so a destination with several pins reveals
         * all of them at once. See the note in `../state`.
         */
        const shown =
          hotspot.destinationId === revealedDestinationId && !panelIsOpen;

        return (
          <group
            key={hotspot.id}
            visible={shown}
            /**
             * Explicit on both sides, never `undefined` to mean "inherit".
             *
             * Both gates have to be resolved into ONE value, because uikit
             * reads `object.pointerEvents ?? parentPointerEvents` — so an
             * "auto" here to say "revealed" would also override a parent's
             * "none" saying "a panel is open", and the marker would take rays
             * through the panel covering it.
             */
            pointerEvents={shown ? "auto" : "none"}
          >
            <HotspotMarker hotspot={hotspot} onOpen={() => onSelect(hotspot)} />
          </group>
        );
      })}

      {selected && (
        <HotspotPanel hotspot={selected} onClose={() => onSelect(null)} />
      )}
    </>
  );
}
