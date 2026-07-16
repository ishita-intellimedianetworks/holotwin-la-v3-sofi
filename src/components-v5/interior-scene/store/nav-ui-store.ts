import { create } from "zustand";
import type { FloorTransition, DestinationCategory, CrowdLevel } from "@/components-v5/shared/types";

/** One crowd-flow zone, published by the 3D CrowdFlowMesh so the map can draw
 *  the SAME shapes as matching colour overlays and the crowd panel can name
 *  each side. `tris` are the zone mesh's actual world-XZ triangles. */
export interface CrowdFlowZoneRect {
  level: CrowdLevel;
  /** World-XZ triangles ([x, z] triples) of the zone mesh. */
  tris: [number, number][][];
  /** Zone centre (world XZ) — side naming in the crowd panel. */
  center: [number, number];
}

/** The label destination the player is currently standing AT. */
export interface CurrentDest {
  id: string;
  label: string;
  category: DestinationCategory;
  /** The destination's sub-category — arriving auto-selects it in the panel/map. */
  option?: string;
}

/** A clicked 3D hotspot marker — drives the centred info overlay (memorial).
 *  Set from inside the canvas (HotspotMarkers), rendered by InteriorOverlays. */
export interface HotspotInfo {
  destId: string;
  destLabel: string;
  category: DestinationCategory;
  option?: string;
  /** The clicked pin's own label (falls back to the destination name). */
  hotspotLabel?: string;
  /** 1-based marker index within the destination's pins + the total count. */
  index: number;
  total: number;
  /** World position of the marker (shown as technical info). */
  position: [number, number, number];
}

/**
 * Single source of truth for the destination / wayfinding UI, shared by every part that
 * has to agree on it — the bottom dock (launchers, Home, "currently at" banner),
 * the floating 3D label panel, and the full-screen minimap. Previously each of
 * those kept its own copy of "which label is open / which destination is
 * selected / where am I standing", which drifted out of sync; centralising it
 * here means one update reflects everywhere.
 *
 * `currentDest` + `atHome` are POSITION-driven: a single poll (in InteriorOverlays)
 * writes them from the player's live XZ — no other part recomputes them.
 */
interface NavUiState {
  /** Open label (null = none) — drives the 3D panel AND the map's hotspot set. */
  openLabel: DestinationCategory | null;
  /** Most-recent label — keeps the panel mounted so it can animate OUT on close. */
  lastLabel: DestinationCategory | null;
  /** Selected destination id (shared by the 3D panel + the map). */
  selectedId: string | null;
  /** Where the player is standing (banner + hidden-from-its-list), or null. */
  currentDest: CurrentDest | null;
  /** Player is standing at the start/home position. */
  atHome: boolean;
  /** A requested interior-portal entry (set by the accommodation overlay button,
   *  consumed inside the canvas by the cinematic fly). null when idle. */
  pendingPortal: FloorTransition | null;
  /** Whether the full-screen map is open. Lifted here so the left sidebar's
   *  Map button and the minimap (which owns the overlay) stay in sync. */
  mapExpanded: boolean;
  /** Whether the Event Day feed panel is open. Mutually exclusive with the destination
   *  label panel + map (opening one closes the others). */
  eventsOpen: boolean;
  /** Whether the turn-by-turn HUD should show for the CURRENT walk. Only walks
   *  started from a label/directions panel set this true; manual map clicks and
   *  3D double-clicks set it false (see navigateToFloor), so those walk silently. */
  navHud: boolean;
  /** Remembered sub-category (Destination.option) per category — shared by the panel
   *  AND the map, and kept across close/arrive/reopen so returning to a
   *  category lands on the same sub-list. null = "All" (map). */
  optionByCat: Partial<Record<DestinationCategory, string | null>>;
  /** Which category's option was AUTO-selected by reaching a navigated
   *  destination — so leaving that place can unselect it again without ever
   *  touching the user's manual picks. */
  autoOptionCat: DestinationCategory | null;
  /** Clicked 3D hotspot → centred info overlay (null = closed). */
  hotspotInfo: HotspotInfo | null;
  /** Crowd-flow zone rects (world XZ + tier) for the map overlay — published
   *  by the 3D CrowdFlowMesh when the active floor has a crowdFlowGlb. */
  crowdFlowZones: CrowdFlowZoneRect[];

  /** Toggle a label open/closed; switching to a different label drops the
   *  selection (so the new list opens fresh). */
  toggleLabel: (k: DestinationCategory) => void;
  setOpenLabel: (k: DestinationCategory | null) => void;
  setSelectedId: (id: string | null) => void;
  /** Remember the picked sub-category for a category (panel tab / map filter). */
  setOptionForCat: (k: DestinationCategory, o: string | null) => void;
  /** Position poll → arriving at a place clears any pending selection, so
   *  reopening its list shows options (not stale directions to where you are). */
  setCurrentDest: (c: CurrentDest | null) => void;
  setAtHome: (v: boolean) => void;
  setMapExpanded: (v: boolean) => void;
  setEventsOpen: (v: boolean) => void;
  setNavHud: (v: boolean) => void;
  /** Open the Event Day panel, closing the destination panel + map. */
  openEvents: () => void;
  /** Home: no panel, no selection, not "at" any destination. */
  goHome: () => void;
  /** Close the 3D panel entirely + drop selection (e.g. when the full map opens). */
  closePanel: () => void;
  /** Request entering an interior via a transition (overlay button → canvas). */
  requestPortal: (t: FloorTransition) => void;
  clearPortal: () => void;
  setHotspotInfo: (h: HotspotInfo | null) => void;
  setCrowdFlowZones: (z: CrowdFlowZoneRect[]) => void;
  /** Full reset (floor swap). */
  reset: () => void;
}

export const useNavUiStore = create<NavUiState>((set) => ({
  openLabel: null,
  lastLabel: null,
  selectedId: null,
  currentDest: null,
  atHome: false,
  pendingPortal: null,
  mapExpanded: false,
  eventsOpen: false,
  navHud: false,
  optionByCat: {},
  autoOptionCat: null,
  hotspotInfo: null,
  crowdFlowZones: [],

  toggleLabel: (k) =>
    set((s) => ({
      openLabel: s.openLabel === k ? null : k,
      lastLabel: k,
      selectedId: s.openLabel === k ? s.selectedId : null,
      // Opening any category closes the Event Day panel.
      eventsOpen: false,
    })),
  setOpenLabel: (k) =>
    set((s) => ({
      openLabel: k,
      // Opening a category while standing AT its previously selected destination
      // drops that selection — the panel shows the option list, not a stale
      // "You're here" directions view. (Hotspot clicks re-select right after,
      // so an explicit pick still opens directions.)
      selectedId: k && s.selectedId && s.currentDest?.id === s.selectedId ? null : s.selectedId,
    })),
  setSelectedId: (id) => set({ selectedId: id }),
  // Manual pick — overrides and CLEARS any auto-selection bookkeeping so the
  // user's choice survives walking away.
  setOptionForCat: (k, o) => set((s) => ({ optionByCat: { ...s.optionByCat, [k]: o }, autoOptionCat: null })),
  setCurrentDest: (c) =>
    set((s) => {
      if (s.currentDest?.id === c?.id && s.currentDest?.category === c?.category) return {};
      const optionByCat = { ...s.optionByCat };
      let autoOptionCat = s.autoOptionCat;
      // Leaving a place whose sub-category was AUTO-selected on arrival →
      // unselect it (back to the default list). Manual picks are untouched.
      if (s.currentDest && s.autoOptionCat === s.currentDest.category && c?.id !== s.currentDest.id) {
        delete optionByCat[s.currentDest.category];
        autoOptionCat = null;
      }
      // Only a REACHED destination (the one that was actually selected and
      // navigated to) auto-selects its sub-category — merely standing near a
      // place never flips the panel/map tabs.
      if (c && s.selectedId === c.id) {
        optionByCat[c.category] = c.option ?? null;
        autoOptionCat = c.category;
      }
      // Arriving at the place you'd SELECTED keeps it selected so its directions
      // show "You're here". Arriving anywhere else clears the pending selection
      // (so the old destination's directions don't re-surface on reopen).
      return c
        ? { currentDest: c, selectedId: s.selectedId === c.id ? c.id : null, optionByCat, autoOptionCat }
        : { currentDest: c, optionByCat, autoOptionCat };
    }),
  setAtHome: (v) => set((s) => (s.atHome === v ? {} : { atHome: v })),
  setMapExpanded: (v) =>
    set((s) => (s.mapExpanded === v ? {} : { mapExpanded: v, eventsOpen: v ? false : s.eventsOpen })),
  setEventsOpen: (v) => set((s) => (s.eventsOpen === v ? {} : { eventsOpen: v })),
  setNavHud: (v) => set((s) => (s.navHud === v ? {} : { navHud: v })),
  openEvents: () => set({ eventsOpen: true, openLabel: null, lastLabel: null, selectedId: null, mapExpanded: false }),
  goHome: () => set({ openLabel: null, selectedId: null, currentDest: null, eventsOpen: false }),
  closePanel: () => set({ openLabel: null, lastLabel: null, selectedId: null }),
  requestPortal: (t) => set({ pendingPortal: t }),
  clearPortal: () => set({ pendingPortal: null }),
  setHotspotInfo: (h) => set({ hotspotInfo: h }),
  setCrowdFlowZones: (z) => set({ crowdFlowZones: z }),
  reset: () => set({ openLabel: null, lastLabel: null, selectedId: null, currentDest: null, atHome: false, pendingPortal: null, mapExpanded: false, eventsOpen: false, navHud: false, optionByCat: {}, autoOptionCat: null, hotspotInfo: null, crowdFlowZones: [] }),
}));
