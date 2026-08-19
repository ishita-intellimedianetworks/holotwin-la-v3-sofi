"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { DEFAULT_VENUE_ID, getVenue, type VRVenue } from ".";

/**
 * Which venue the session is in, and how to change it.
 *
 * SEPARATE FROM `experience/state`, which owns everything about the CURRENT
 * visit — where you are standing, which panel is open, whether a glide is in
 * flight. This owns the one fact that outlives all of that: which of the four
 * places you are in.
 *
 * The split is what makes switching venues cheap to reason about. Changing the
 * venue here re-keys the state provider (see `experience`), so every scrap of
 * per-visit state is thrown away and rebuilt rather than carried across — a
 * hotspot revealed in the stadium must not still be revealed after landing in
 * the hotel room, and a half-finished glide to a stadium gate must not continue
 * into a room four metres wide.
 *
 * It sits OUTSIDE `<Canvas>` so the DOM gate can read it too — R3F bridges React
 * context across its reconciler boundary, so the overlay and the 3D tree see
 * the same value.
 */

interface VenueContextValue {
  venue: VRVenue;
  venueId: string;
  /** Change venue. A no-op if it is already the active one. */
  setVenue: (id: string) => void;
}

const VenueContext = createContext<VenueContextValue | null>(null);

export function VRVenueProvider({
  initialVenueId,
  children,
}: PropsWithChildren<{ initialVenueId?: string }>) {
  const [venueId, setVenueId] = useState(
    () => getVenue(initialVenueId ?? DEFAULT_VENUE_ID).id,
  );

  const setVenue = useCallback((id: string) => {
    // Guarded, not because a redundant set is expensive in itself, but because
    // it would re-key the state provider and throw away a perfectly good visit.
    setVenueId((current) => (current === id ? current : getVenue(id).id));
  }, []);

  const value = useMemo<VenueContextValue>(
    () => ({ venue: getVenue(venueId), venueId, setVenue }),
    [venueId, setVenue],
  );

  return (
    <VenueContext.Provider value={value}>{children}</VenueContext.Provider>
  );
}

export function useVenueContext(): VenueContextValue {
  const ctx = useContext(VenueContext);
  if (!ctx) {
    throw new Error("useVenueContext must be used inside <VRVenueProvider>");
  }
  return ctx;
}

/** The active venue. What almost everything in the tree actually wants. */
export function useVenue(): VRVenue {
  return useVenueContext().venue;
}
