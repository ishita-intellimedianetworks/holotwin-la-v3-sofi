"use client";

/**
 * DestinationOverlay — container for one destination label's floating panel. Opened by a
 * per-label launcher button (see DestinationLauncher); the parent keys this by category
 * so switching label remounts it (fresh selection, preview auto-cleared).
 *
 *   pick label → panel; search + filter; tap card → preview route (+ red pin)
 *   on the model WITHOUT walking; "Directions" → walk; on arrival face building.
 *
 * Distances/ETAs are live + 1:1 (see useDestinations). All presentation lives in the
 * split child components; this file holds state + player-controller wiring.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";

import type { Destination, DestinationCategory, DestinationsByCategory, TransportDestination } from "@/components-v5/shared/types";
import type { PlayerControllerHandle } from "../../scene-content/components/player-controller";
import { CATEGORY_BY_KEY, DINING_SEGMENTS } from "./category-meta";
import { useDestinations } from "./use-destinations";
import { useNow } from "./use-now";
import { DestinationPanel } from "./destination-panel";
import { TransportFlow } from "./transport-flow";
import { SeatMap } from "./seat-map";
import { InfoOverlay } from "./info-overlay";
import type { Segment } from "./segment-row";
import { buildSteps, type DirStep } from "./directions-steps";
import { useNavUiStore } from "../../store/nav-ui-store";

export { DestinationLauncher } from "./destination-launcher";

interface DestinationOverlayProps {
  ctrlRef: RefObject<PlayerControllerHandle | null>;
  dests: DestinationsByCategory;
  category: DestinationCategory;
  /** Transport destination venues (only used when category === "transport"). */
  destinations?: TransportDestination[];
  /** Whether the panel should be shown (open + interactive). Drives the in/out
   *  slide-fade; the panel stays mounted while hidden so it can animate out. */
  visible: boolean;
  onClose: () => void;
  /** Teleport (fade out → jump camera to the destination pose → fade in). */
  onTeleport: (dest: Destination) => void;
  /** destination the player is currently standing at — hidden from this list (it
   *  re-appears once they move away). Owned by the dock (position-driven). */
  excludeId?: string | null;
  /** Category with a walk-in interior (the hostel) — the selected-destination
   *  card offers "Explore from inside", swapping straight into that model. */
  onExploreInside?: () => void;
}

export function DestinationOverlay(props: DestinationOverlayProps) {
  // Transport diverges into its own destination → hub → timetable flow.
  if (props.category === "transport") return <TransportOverlay {...props} />;
  // Seat views diverge into a theatre-style seat map (no walking/directions —
  // tapping a section teleports straight to that seat's view).
  if (props.category === "seatviews") return <SeatViewOverlay {...props} />;
  // LA2028 demo informational categories — read-only status panels (no
  // directions), one distinct variant each.
  if (props.category === "crowdflow")    return <InfoOverlay {...props} variant="crowd" />;
  if (props.category === "eventupdates") return <InfoOverlay {...props} variant="event" />;
  if (props.category === "infra")        return <InfoOverlay {...props} variant="infra" />;
  return <PlacesOverlay {...props} />;
}

function SeatViewOverlay({ dests, visible, onClose, onTeleport }: DestinationOverlayProps) {
  // Glass surface appears instantly (no per-mount fade) so switching category —
  // which remounts this panel by key — never re-animates the whole frosted div.
  // The inner content fades in instead (animate-in fade-in-0 in the panels).
  const show = visible;
  return (
    <SeatMap
      dests={dests.seatviews ?? []}
      visible={show}
      onClose={onClose}
      onTeleport={onTeleport}
    />
  );
}

function TransportOverlay({ ctrlRef, dests, destinations, visible, onClose, onTeleport }: DestinationOverlayProps) {
  const now = useNow(15000);
  // Glass surface appears instantly (no per-mount fade) so switching category —
  // which remounts this panel by key — never re-animates the whole frosted div.
  // The inner content fades in instead (animate-in fade-in-0 in the panels).
  const show = visible;
  return (
    <TransportFlow
      ctrlRef={ctrlRef}
      destinations={destinations ?? []}
      hubs={dests.transport ?? []}
      visible={show}
      now={now}
      onClose={onClose}
      onTeleport={onTeleport}
    />
  );
}

/** A destination is AUTHORED once it has a camera pose or at least one hotspot
 *  from the venue GLBs. Blank entries (data not yet delivered) keep their
 *  sub-category tab in the rail/dropdown but are hidden from the list, which
 *  shows a "no data" empty state instead. */
const hasDestData = (p: Destination) => !!(p.camera || p.hotspots?.length || p.hotspot);

function PlacesOverlay({ ctrlRef, dests, category, visible, onClose, onTeleport, onExploreInside }: DestinationOverlayProps) {
  const meta = CATEGORY_BY_KEY[category];
  const list = useMemo(() => dests[category] ?? [], [dests, category]);

  // Standing at an authored teleport-only spot (Level 3 seat, the concession
  // stand, the parking fly-over) → walking OUT is impossible too: every
  // destination is offered as teleport-only until the player teleports away.
  const currentDestRef = useNavUiStore((s) => s.currentDest);
  const atTeleportOnly = useMemo(() => {
    if (!currentDestRef) return false;
    const d = dests[currentDestRef.category]?.find((x) => x.id === currentDestRef.id);
    return !!d?.teleportOnly;
  }, [currentDestRef, dests]);

  const { rows, refresh } = useDestinations(list, ctrlRef, visible, atTeleportOnly);
  const now = useNow(15000);
  const [query, setQuery] = useState("");

  // ── Segment control ─────────────────────────────────────────────────────────
  // Dining = single-select tabs (Campus / Restaurants). Practice = MULTI-select
  // sport chips: a venue hosts several sports, and you can filter by several at
  // once (none selected = show all).
  const segments = useMemo<Segment[] | undefined>(() => {
    if (meta.segmentBy === "kind") return DINING_SEGMENTS.map((s) => ({ ...s }));
    if (meta.segmentBy === "sport") {
      const sports = Array.from(new Set(list.flatMap((p) => p.sports ?? [])));
      return sports.map((s) => ({ id: s, label: s }));
    }
    if (meta.segmentBy === "option") {
      // flatOptions (e.g. Seat View) = no sub-tabs, one flat list.
      if (meta.flatOptions) return undefined;
      // One tile per distinct sub-category (dest.option), in first-seen order,
      // with a destination count for the carousel badge.
      const opts = Array.from(new Set(list.map((p) => p.option).filter(Boolean) as string[]));
      // Count only AUTHORED destinations — a sub-category whose data hasn't
      // been delivered yet keeps its tile but reads 0.
      return opts.map((o) => ({ id: o, label: o, count: list.filter((p) => p.option === o && hasDestData(p)).length }));
    }
    return undefined;
  }, [meta.segmentBy, meta.flatOptions, list]);
  const [activeKind, setActiveKind] = useState<string>(DINING_SEGMENTS[0].id);
  const [activeSports, setActiveSports] = useState<Set<string>>(new Set());
  // Sub-category tab (segmentBy "option") — REMEMBERED per category in the
  // shared nav store (same memory the map uses), so reopening a category after
  // reaching a destination lands on the SAME sub-list. Unset/stale → first.
  const optionByCat = useNavUiStore((s) => s.optionByCat);
  const setOptionForCat = useNavUiStore((s) => s.setOptionForCat);
  const storedOpt = optionByCat[category];
  const activeOpt =
    (storedOpt && segments?.some((s) => s.id === storedOpt) ? storedOpt : segments?.[0]?.id) ?? "";
  const setActiveOption = useCallback(
    (id: string) => setOptionForCat(category, id),
    [category, setOptionForCat],
  );
  const toggleSport = (id: string) =>
    setActiveSports((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const segmentMatch = useCallback(
    (dest: Destination): boolean => {
      if (meta.segmentBy === "kind") return (dest.kind ?? "campus") === activeKind;
      if (meta.segmentBy === "sport") return activeSports.size === 0 || !!dest.sports?.some((s) => activeSports.has(s));
      if (meta.segmentBy === "option") return meta.flatOptions ? true : (dest.option ?? "") === activeOpt;
      return true;
    },
    [meta.segmentBy, meta.flatOptions, activeKind, activeSports, activeOpt],
  );
  // Selected destination is shared (dock / panel / minimap) via the nav store.
  const selectedId = useNavUiStore((s) => s.selectedId);
  const setSelectedId = useNavUiStore((s) => s.setSelectedId);
  const currentDest = useNavUiStore((s) => s.currentDest);
  const lastPosRef = useRef<{ x: number; z: number } | null>(null);
  // Keep the live distances fresh while the panel is open. The refresh is a
  // SYNCHRONOUS A* sweep over every destination — running it whenever the
  // player moved 5cm meant every walking frame paid the full sweep and the UI
  // read as frozen. Distances only display at ~10m resolution, so recompute
  // after ~2 world units of actual movement, at most twice a second.
  useEffect(() => {
    if (!visible) { lastPosRef.current = null; return; }
    let raf = 0;
    let lastAt = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const ctrl = ctrlRef.current;
      if (!ctrl) return;
      const now = performance.now();
      if (now - lastAt < 500) return;
      const p = ctrl.getPosition();
      const lp = lastPosRef.current;
      if (!lp || Math.hypot(p.x - lp.x, p.z - lp.z) > 2) {
        lastPosRef.current = { x: p.x, z: p.z };
        lastAt = now;
        refresh();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, ctrlRef, refresh]);

  // Mount-in flag → entrance/exit transition (shared with TransportOverlay).
  // Glass surface appears instantly (no per-mount fade) so switching category —
  // which remounts this panel by key — never re-animates the whole frosted div.
  // The inner content fades in instead (animate-in fade-in-0 in the panels).
  const show = visible;

  // Clear the preview route while hidden. (Distances are already recomputed by
  // useDestinations when the panel is shown — refreshing here too ran the full per-destination
  // A* sweep TWICE on every open, a visible hitch on large categories.)
  useEffect(() => {
    if (!visible) ctrlRef.current?.clearPreview();
  }, [visible, ctrlRef]);

  // Always clear the preview route on unmount (panel closed / category swap).
  useEffect(() => {
    const ctrl = ctrlRef.current;
    return () => { ctrl?.clearPreview(); };
  }, [ctrlRef]);

  // Turn-by-turn steps for the Directions view, derived from the preview route
  // (set synchronously by previewTo in `select`). Cleared when no destination.
  const [steps, setSteps] = useState<DirStep[]>([]);
  useEffect(() => {
    // Defer to a frame so previewTo (called synchronously in `select`) has set
    // the route; keep every setSteps inside the callback (no sync setState in
    // the effect body).
    const raf = requestAnimationFrame(() => {
      const ctrl = ctrlRef.current;
      if (!visible || !selectedId || !ctrl) { setSteps([]); return; }
      const preview = ctrl.getPreviewPath3D().map((p) => ({ x: p.x, z: p.z }));
      if (preview.length === 0) { setSteps([]); return; }
      const pos = ctrl.getPosition();
      setSteps(buildSteps({ x: pos.x, z: pos.z }, preview));
    });
    return () => cancelAnimationFrame(raf);
  }, [visible, selectedId, ctrlRef]);

  const q = query.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      hasDestData(r.dest) &&
      segmentMatch(r.dest) &&
      (!q ||
        r.dest.label.toLowerCase().includes(q) ||
        r.dest.menu?.some((m) => m.toLowerCase().includes(q)) ||
        r.dest.sports?.some((s) => s.toLowerCase().includes(q)) ||
        r.dest.tags?.some((t) => t.toLowerCase().includes(q))),
  );
  const hereId = currentDest?.category === category ? currentDest.id : null;
  // Only an EXPLICIT pick (tapped card) of a NEW destination opens the
  // directions view. The place the player is ALREADY standing at never does —
  // its card stays inline in the option list flagged "Already here" (so no
  // "you're here" directions tab, whichever way it got selected).
  const explicitRow = selectedId ? rows.find((r) => r.dest.id === selectedId) ?? null : null;
  const selectedRow = explicitRow && explicitRow.dest.id !== hereId ? explicitRow : null;
  const reached = !!selectedRow && currentDest?.id === selectedRow.dest.id;
  const visibleRows = selectedRow
    ? [selectedRow, ...filtered.filter((r) => r.dest.id !== selectedRow.dest.id)]
    : filtered;

  const select = useCallback(
    (dest: Destination) => {
      // Tapping the selected card again deselects + clears the route.
      if (dest.id === selectedId) {
        setSelectedId(null);
        ctrlRef.current?.clearPreview();
        return;
      }
      setSelectedId(dest.id);
      // Defer the route pathfind one frame so the directions view paints first —
      // previewTo is a synchronous A*; running it inside the tap handler blocked
      // that first paint and made opening directions feel jerky.
      requestAnimationFrame(() => {
        if (useNavUiStore.getState().selectedId !== dest.id) return;
        // Teleport-only destinations and teleport-only standing spots have no
        // walkable route — nothing to preview.
        const cam = dest.camera;
        const canWalk = cam && !dest.teleportOnly && !atTeleportOnly;
        // eyeY pins the route's END to the destination's authored LEVEL — on
        // multi-level venues an XZ-only target can resolve to the overhang a
        // floor above (route ribbon "flies", walk ends mid-air then snaps).
        const ok = canWalk ? ctrlRef.current?.previewTo({ x: cam.position[0], eyeY: cam.position[1], z: cam.position[2] }) : false;
        if (!ok) ctrlRef.current?.clearPreview();
      });
    },
    [selectedId, setSelectedId, ctrlRef, atTeleportOnly],
  );

  const clearSelection = () => {
    setSelectedId(null);
    ctrlRef.current?.clearPreview();
  };

  const start = useCallback(
    (dest: Destination) => {
      const ctrl = ctrlRef.current;
      const cam = dest.camera;
      // Teleport-only destinations, or starting FROM a teleport-only spot —
      // walking is never offered.
      if (!ctrl || !cam || dest.teleportOnly || atTeleportOnly) return;
      const x = cam.position[0];
      const z = cam.position[2];
      // Started from the label/directions panel → show the turn HUD for this walk.
      useNavUiStore.getState().setNavHud(true);
      // Walk there; on arrival settle into the destination's authored pose — exact spot
      // + facing — so the view matches the hero/teleport shot and the dock
      // latches "currently at" by position.
      // eyeY → route to the destination's authored LEVEL, not the player's
      // (an XZ-only target on a stacked mesh ends the walk on the overhang
      // above the spot, and the arrival settle then "jumps" a level down).
      ctrl.navigateToPoint({ x, eyeY: cam.position[1], z }, undefined, () => {
        // Exact-pose destination → settle into the authored pose; ground
        // destinations snap to the navmesh probed at the AUTHORED height
        // (same Y policy as every teleport, so arrival height matches).
        const eyeY = cam.position[1];
        const ch = ctrl.getPosition().y - ctrl.getFootPosition().y;
        const footGuess = eyeY ? eyeY - ch : 0;
        const y = dest.exactPose && eyeY ? eyeY - ch : ctrl.probeFloorY(x, z, footGuess) ?? footGuess;
        ctrl.teleportTo([x, y, z], cam.rotation, true);
        // Latch "currently at" immediately on arrival (don't wait for the poll).
        useNavUiStore.getState().setCurrentDest({ id: dest.id, label: dest.label, category, option: dest.option });
      });
    },
    [ctrlRef, category, atTeleportOnly],
  );

  // Teleport (parent runs the fade + camera jump); we're instantly at the destination.
  const teleport = useCallback((dest: Destination) => onTeleport(dest), [onTeleport]);

  // Subtitle count reflects the active segment (e.g. only Campus Dining places).
  const segmentCount = (meta.segmentBy ? list.filter(segmentMatch) : list).filter(hasDestData).length;
  // The active sub-category exists but none of its destinations are authored
  // yet → the list shows a "no data" empty state instead of the filter one.
  const noData = !list.some((p) => segmentMatch(p) && hasDestData(p));

  return (
    <DestinationPanel
      meta={meta}
      count={segmentCount}
      noData={noData}
      query={query}
      setQuery={setQuery}
      segments={segments}
      activeSegment={meta.segmentBy === "kind" ? activeKind : meta.segmentBy === "option" ? activeOpt : undefined}
      activeSegmentSet={meta.segmentBy === "sport" ? activeSports : undefined}
      onSegment={meta.segmentBy === "sport" ? toggleSport : meta.segmentBy === "option" ? setActiveOption : setActiveKind}
      rows={visibleRows}
      selectedRow={selectedRow}
      now={now}
      visible={show}
      onSelect={select}
      onStart={start}
      onClear={clearSelection}
      onClose={onClose}
      onTeleport={teleport}
      reached={reached}
      hereId={hereId}
      steps={steps}
      onExploreInside={onExploreInside}
    />
  );
}
