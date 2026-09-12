"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type RefObject,
} from "react";
import type * as THREE from "three";
import type { VRHotspot } from "@/components/vr/data";

/**
 * One store for the whole visit: where the player is, what is open, what is
 * being travelled to.
 *
 * Safe to mount OUTSIDE `<Canvas>`: R3F bridges React context across its
 * reconciler boundary, so the DOM gate and the 3D tree read the same store.
 *
 * WHICH VENUE you are in is deliberately NOT here — that lives in
 * `data/venue-provider`, one level up, and changing it re-keys this provider so
 * every field below starts again from its initial value. See the note there.
 */

export type VRView = "doll-house" | "first-person";
/**
 * Which panel is up. ONE AT A TIME, and everything else keys off that:
 * `panelIsOpen` below is what hides the dock, stops the doll house taking the
 * ray and gates the world markers, so a panel modelled outside this union has
 * to be hand-added there or it will fight the dock for every press.
 *
 * "destinations" replaced "layouts". The layouts menu was a list of viewpoints;
 * the destination sheet is that list plus everything the flat card carries —
 * the subcategories, the transport board, the seat picker, the notices — so it
 * supersedes it rather than sitting beside it.
 */
export type OpenMenu =
  | "destinations"
  | "map"
  | "venues"
  | "instructions"
  | null;

export interface TeleportTarget {
  position: [number, number, number];
  rotationY: number;
  /**
   * PUT THE EYES AT THE AUTHORED HEIGHT AND DO NOT LOOK FOR A FLOOR.
   *
   * For a seat view, which is the only thing that sets this. Those sit above
   * the navmesh — the nearest walkable surface under a stadium seat is the
   * pitch, forty metres down — so the usual snap would land the player on the
   * field every time. See `../teleport-driver`.
   */
  exactPose?: boolean;
}

interface VRStateValue {
  /** The player group. Everything that moves the player writes to this. */
  originRef: RefObject<THREE.Group | null>;

  view: VRView;
  goToDollHouse: () => void;
  goToFirstPerson: () => void;

  /**
   * Where the player is being glided to, or null. State describes the intent;
   * `teleport-driver`, inside the Canvas, performs it.
   */
  moveToLocation: TeleportTarget | null;
  teleportTo: (target: TeleportTarget) => void;
  finishTeleport: () => void;
  isTravelling: boolean;

  openMenu: OpenMenu;
  setOpenMenu: (menu: OpenMenu) => void;

  openHotspot: VRHotspot | null;
  setOpenHotspot: (hotspot: VRHotspot | null) => void;

  /**
   * The one hotspot revealed by a Resources pick — or null, which shows NONE.
   *
   * The venue starts clean of markers and stays that way until something is
   * asked for. The memorial has eighteen and the stadium twenty-three, all at
   * eye level across concourses you are trying to look at; drawn all at once
   * they are clutter you have to see past rather than a feature. Resources is
   * the way in.
   *
   * A DESTINATION id, not a marker id, so a destination with several pins —
   * "all restroom locations", the two Lost & Found desks — reveals all of them
   * together. The flat card and its map markers are one thing there and stay
   * one thing here.
   *
   * An ID rather than the object, because this is only ever compared.
   */
  revealedDestinationId: string | null;
  revealDestination: (id: string | null) => void;

  /** True when anything is covering the view. Input behind a panel is dropped. */
  panelIsOpen: boolean;

  /** Bumped to re-run the venue's landing pose. */
  landToken: number;
  recentre: () => void;

  /**
   * Metres to add to the navmesh floor because the RUNTIME IS NOT SUPPLYING A
   * STANDING HEIGHT. Zero on any headset that is tracking properly.
   *
   * THE FLOOR IS THE ONLY THING THIS PROJECT MEASURES, and that is correct: the
   * XR origin is the player's feet and a headset in a `local-floor` reference
   * space puts their head wherever their head actually is, so the venue's
   * `eyeHeight` must never be added — doing so is what would put someone's eyes
   * through the ceiling.
   *
   * It is only correct while the head pose is real. Where floor-level tracking
   * is unavailable — a runtime that fell back to `local`, a browser emulator,
   * a headset that never got a floor estimate — the head arrives at or near the
   * origin, so feet-on-the-floor puts the VIEW on the floor. Ankle height, in a
   * venue whose viewpoints were authored for someone standing.
   *
   * So this is measured rather than configured: `locomotion` watches how far
   * the head sits above the origin, and only if that is implausibly small does
   * it fill the gap from the venue's `eyeHeight`. A ref rather than state
   * because it is written and read inside the frame loop, and because a change
   * must not re-render the tree that is reading it.
   */
  standingLiftRef: RefObject<number>;
}

const VRStateContext = createContext<VRStateValue | null>(null);

export function VRStateProvider({ children }: PropsWithChildren) {
  const originRef = useRef<THREE.Group | null>(null);
  /** See `standingLiftRef` above. Written by `../locomotion`, read by everything
   *  that puts the player down on a floor. */
  const standingLiftRef = useRef(0);

  const [view, setView] = useState<VRView>("doll-house");
  /**
   * Seeded open. The doll house is the STARTING view, so nothing ever calls
   * `enter` for it and `null` would mean its instructions never appear at all.
   */
  const [openMenu, setOpenMenu] = useState<OpenMenu>("instructions");
  const [openHotspot, setOpenHotspot] = useState<VRHotspot | null>(null);
  const [revealedDestinationId, setRevealedDestinationId] = useState<
    string | null
  >(null);
  const [moveToLocation, setMoveToLocation] = useState<TeleportTarget | null>(
    null,
  );
  const [landToken, setLandToken] = useState(0);

  /**
   * Which views have already introduced themselves. Seeded with `doll-house`:
   * its panel is opened by the `openMenu` initialiser above rather than by
   * `enter`, so without the seed, returning to it would count as a first visit.
   */
  const introducedViews = useRef<Set<VRView>>(new Set<VRView>(["doll-house"]));

  /**
   * Crossing between views resets everything about the previous one.
   *
   * Instructions show once per view, on first arrival. Showing them on every
   * entry means a panel to dismiss on every crossing; the dock's info button
   * reopens either set on demand. Per view rather than once overall, since the
   * two sets describe genuinely different controls.
   */
  const enter = useCallback((next: VRView) => {
    setView(next);
    setOpenHotspot(null);
    // Back to a clean venue. Crossing between views is a fresh start, and a
    // marker left over from a previous visit is one you did not ask for on
    // this one.
    setRevealedDestinationId(null);

    const isFirstVisit = !introducedViews.current.has(next);
    introducedViews.current.add(next);
    setOpenMenu(isFirstVisit ? "instructions" : null);
  }, []);

  const goToDollHouse = useCallback(() => enter("doll-house"), [enter]);

  const goToFirstPerson = useCallback(() => {
    enter("first-person");
    // Entering always lands on the venue's authored spawn rather than wherever
    // the model happened to be pressed — the same `startPosition` the flat site
    // opens each venue at, so the two views agree on where a place begins.
    setLandToken((n) => n + 1);
  }, [enter]);

  /**
   * Home. Re-runs the landing pose AND clears the revealed marker — the dock's
   * house button is the one way back to the state you started in, so the two
   * have to be the same press. "Put it back how it was" means all of it.
   */
  const recentre = useCallback(() => {
    setLandToken((n) => n + 1);
    setRevealedDestinationId(null);
  }, []);

  const revealDestination = useCallback(
    (id: string | null) => setRevealedDestinationId(id),
    [],
  );

  const teleportTo = useCallback(
    (t: TeleportTarget) => setMoveToLocation(t),
    [],
  );
  const finishTeleport = useCallback(() => setMoveToLocation(null), []);

  const value = useMemo<VRStateValue>(
    () => ({
      originRef,
      view,
      goToDollHouse,
      goToFirstPerson,
      moveToLocation,
      teleportTo,
      finishTeleport,
      isTravelling: moveToLocation !== null,
      openMenu,
      setOpenMenu,
      openHotspot,
      setOpenHotspot,
      revealedDestinationId,
      revealDestination,
      panelIsOpen: openMenu !== null || openHotspot !== null,
      landToken,
      recentre,
      standingLiftRef,
    }),
    [
      view,
      goToDollHouse,
      goToFirstPerson,
      moveToLocation,
      teleportTo,
      finishTeleport,
      openMenu,
      openHotspot,
      revealedDestinationId,
      revealDestination,
      landToken,
      recentre,
    ],
  );

  return (
    <VRStateContext.Provider value={value}>{children}</VRStateContext.Provider>
  );
}

export function useVRState(): VRStateValue {
  const ctx = useContext(VRStateContext);
  if (!ctx) throw new Error("useVRState must be used inside <VRStateProvider>");
  return ctx;
}
