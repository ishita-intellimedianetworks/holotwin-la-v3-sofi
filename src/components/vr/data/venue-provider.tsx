"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
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

/**
 * A venue change, as the headset sees it: `in` while the view fades to black,
 * `hold` while it stays black and the new venue loads — the loading line is
 * drawn on the black — then `idle` once `experience/blackout` has let it fade
 * back. The swap itself happens at the in → hold step, out of sight.
 */
export type VenueSwitchPhase = "idle" | "in" | "hold";

/** How long the fade to black takes before the venue is actually swapped. */
export const VENUE_FADE_IN_MS = 450;

interface VenueContextValue {
  venue: VRVenue;
  venueId: string;
  /** Change venue. A no-op if it is already the active one. */
  setVenue: (id: string) => void;
  /**
   * Change venue BEHIND A BLACKOUT, the way the ARCHVIZ reference crosses
   * between places: fade out, swap, load on black, fade back in. Returns false
   * — and does nothing — for the venue you are already in or mid-switch.
   */
  switchVenue: (id: string) => boolean;
  switchPhase: VenueSwitchPhase;
  /** Called by the blackout once the new venue is loaded and settled. */
  finishSwitch: () => void;
}

const VenueContext = createContext<VenueContextValue | null>(null);

export function VRVenueProvider({
  initialVenueId,
  children,
}: PropsWithChildren<{ initialVenueId?: string }>) {
  const [venueId, setVenueId] = useState(
    () => getVenue(initialVenueId ?? DEFAULT_VENUE_ID).id,
  );

  /** The active id, readable from a callback without re-creating it. Every
   *  write to `venueId` goes through one of the two setters here, and both
   *  keep this in step. */
  const venueIdRef = useRef(venueId);

  const setVenue = useCallback((id: string) => {
    // Guarded, not because a redundant set is expensive in itself, but because
    // it would re-key the state provider and throw away a perfectly good visit.
    const next = getVenue(id).id;
    venueIdRef.current = next;
    setVenueId((current) => (current === next ? current : next));
  }, []);

  const [switchPhase, setSwitchPhase] = useState<VenueSwitchPhase>("idle");
  const phaseRef = useRef<VenueSwitchPhase>("idle");

  const switchVenue = useCallback((id: string) => {
    const next = getVenue(id).id;
    if (phaseRef.current !== "idle" || next === venueIdRef.current)
      return false;

    phaseRef.current = "in";
    setSwitchPhase("in");
    window.setTimeout(() => {
      venueIdRef.current = next;
      setVenueId(next);
      phaseRef.current = "hold";
      setSwitchPhase("hold");
    }, VENUE_FADE_IN_MS);
    return true;
  }, []);

  const finishSwitch = useCallback(() => {
    if (phaseRef.current !== "hold") return;
    phaseRef.current = "idle";
    setSwitchPhase("idle");
  }, []);

  const value = useMemo<VenueContextValue>(
    () => ({
      venue: getVenue(venueId),
      venueId,
      setVenue,
      switchVenue,
      switchPhase,
      finishSwitch,
    }),
    [venueId, setVenue, switchVenue, switchPhase, finishSwitch],
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
