"use client";

/**
 * TransportFlow — destination-first transit, like picking a stop in a bus app.
 *
 *   search / pick a destination stadium → see the hub to catch at + the live
 *   list of buses & trains coming → Start (walk to the hub) or Teleport.
 *
 * Venues are authored separately from the navmesh transport hubs
 * (transportDestinations referencing a hubId); routing always targets the hub.
 * Owns its own glass shell (the flow diverges too far from the generic
 * DestinationPanel). Selection lives in the shared nav store.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { Bus, Footprints, MapPin, Search, TrainFront, Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Destination, TransportDestination } from "@/components-v5/shared/types";
import type { PlayerControllerHandle } from "../../scene-content/components/player-controller";
import { etaSeconds, fmtEta, fmtMeters } from "../nav-hud/format";
import { navConfig } from "../../nav-config";
import { useNavUiStore } from "../../store/nav-ui-store";
import { NAV_GLASS_PANEL } from "../nav-glass";
import { PanelHeader } from "./panel-header";
import { BusTimetable } from "./bus-timetable";

const MPU = navConfig.logic.displayMetersPerUnit;

interface VenueRow {
  venue: TransportDestination;
  hub: Destination;
  meters: number | null;
  distLabel: string;
  etaLabel: string;
}

interface TransportFlowProps {
  ctrlRef: RefObject<PlayerControllerHandle | null>;
  destinations: TransportDestination[];
  /** The navmesh transport hubs (dests.transport) destinations route through. */
  hubs: Destination[];
  /** Whether the panel is shown (drives the slide/fade; stays mounted hidden). */
  visible: boolean;
  /** Live clock for the departures countdown. */
  now: number;
  onClose: () => void;
  /** Teleport to a hub's authored pose (parent runs the fade + camera jump). */
  onTeleport: (hub: Destination) => void;
}

export function TransportFlow({ ctrlRef, destinations, hubs, visible, now, onClose, onTeleport }: TransportFlowProps) {
  const hubById = useMemo(() => new Map(hubs.map((h) => [h.id, h])), [hubs]);
  const selectedId = useNavUiStore((s) => s.selectedId);
  const setSelectedId = useNavUiStore((s) => s.setSelectedId);
  const currentDest = useNavUiStore((s) => s.currentDest);
  const [query, setQuery] = useState("");

  // The hub the player is currently standing AT (position-driven). On arrival
  // we show that hub's departures board. "Plan another trip" lets them browse
  // the destination list again while still at the hub (replanHubId === atHub.id);
  // walking to a different hub auto-clears it (no reset effect needed).
  const atHub = currentDest?.category === "transport" ? hubById.get(currentDest.id) ?? null : null;
  const [replanHubId, setReplanHubId] = useState<string | null>(null);
  const replanning = atHub != null && replanHubId === atHub.id;

  // ── Live distances to each venue's hub ──────────────────────────────────────
  const [rows, setRows] = useState<VenueRow[]>([]);
  const refresh = useCallback(() => {
    const ctrl = ctrlRef.current;
    const out: VenueRow[] = destinations
      .map((venue) => {
        const hub = hubById.get(venue.hubId);
        if (!hub) return null;
        const cam = hub.camera;
        const wu = cam ? ctrl?.measurePathTo({ x: cam.position[0], eyeY: cam.position[1], z: cam.position[2] }) ?? null : null;
        if (wu == null) return { venue, hub, meters: null, distLabel: "—", etaLabel: "" };
        const meters = wu * MPU;
        return { venue, hub, meters, distLabel: fmtMeters(meters), etaLabel: fmtEta(etaSeconds(wu, MPU)) };
      })
      .filter((r): r is VenueRow => r !== null);
    out.sort((a, b) => (a.meters ?? Infinity) - (b.meters ?? Infinity));
    setRows(out);
  }, [destinations, hubById, ctrlRef]);

  // Recompute on open + when the player has moved meaningfully. The refresh is
  // a synchronous A* per venue hub — at a 5cm threshold it ran every walking
  // frame and stalled the UI; ~2 units / 500ms is invisible at the displayed
  // distance resolution.
  const lastPosRef = useRef<{ x: number; z: number } | null>(null);
  useEffect(() => {
    if (!visible) { lastPosRef.current = null; ctrlRef.current?.clearPreview(); return; }
    refresh();
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

  // Clear any preview route on unmount.
  useEffect(() => {
    const ctrl = ctrlRef.current;
    return () => { ctrl?.clearPreview(); };
  }, [ctrlRef]);

  const selectedRow = selectedId ? rows.find((r) => r.venue.id === selectedId) ?? null : null;

  const select = useCallback(
    (row: VenueRow) => {
      // Already standing at this destination's hub → don't open a separate
      // detail card (that produced a second, mismatched "You're here"); just
      // return to this hub's departures board.
      if (atHub && row.hub.id === atHub.id) {
        setReplanHubId(null);
        setSelectedId(null);
        ctrlRef.current?.clearPreview();
        return;
      }
      setSelectedId(row.venue.id);
      const cam = row.hub.camera;
      const ok = cam ? ctrlRef.current?.previewTo({ x: cam.position[0], eyeY: cam.position[1], z: cam.position[2] }) : false;
      if (!ok) ctrlRef.current?.clearPreview();
    },
    [atHub, setSelectedId, ctrlRef],
  );

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    ctrlRef.current?.clearPreview();
  }, [setSelectedId, ctrlRef]);

  const startWalk = useCallback(
    (hub: Destination) => {
      const ctrl = ctrlRef.current;
      const cam = hub.camera;
      if (!ctrl || !cam) return;
      const x = cam.position[0];
      const z = cam.position[2];
      // Started from the transit/directions panel → show the turn HUD for this walk.
      useNavUiStore.getState().setNavHud(true);
      ctrl.navigateToPoint({ x, eyeY: cam.position[1], z }, undefined, () => {
        const surfaceY = ctrl.probeFloorY(x, z, 0) ?? 0;
        ctrl.teleportTo([x, surfaceY, z], cam.rotation, true);
      });
    },
    [ctrlRef],
  );

  const q = query.trim().toLowerCase();
  const listed = rows.filter(
    (r) =>
      !q ||
      r.venue.label.toLowerCase().includes(q) ||
      r.venue.sport?.toLowerCase().includes(q) ||
      r.hub.label.toLowerCase().includes(q),
  );

  // Standing at a hub → its live departures board (top priority). Otherwise a
  // picked destination → its detail, else the searchable destination list.
  const view: "arrived" | "detail" | "list" =
    atHub && !replanning ? "arrived" : selectedRow ? "detail" : "list";

  const header =
    view === "arrived"
      ? { title: atHub!.label, subtitle: "You're here" }
      : view === "detail"
        ? {
            title: selectedRow!.venue.label,
            subtitle: `Catch at ${selectedRow!.hub.label}`,
          }
        : { title: "Where to?", subtitle: `${destinations.length} destinations` };

  return (
    <div
      style={NAV_GLASS_PANEL}
      className={cn(
        // Sits to the RIGHT of the left sidebar (clears its width) so the two
        // never overlap — reads as one flex row of rail + panel.
        "fixed left-[88px] top-4 z-[115] flex w-[360px] max-w-[calc(100vw-104px)] flex-col overflow-hidden rounded-[24px] max-h-[80dvh]",
        "short:left-[54px] short:top-1 short:w-[236px] short:max-w-[calc(100vw-64px)] short:rounded-[14px] short:max-h-[100dvh] short:origin-top-left short:scale-[0.8]",
        // Opacity-only (no slide) + short duration — see DestinationPanel: animating a
        // backdrop-blur surface over the WebGL canvas re-blurs every frame and janks.
        "transition-[opacity,visibility] duration-200 ease-out",
        visible ? "opacity-100" : "pointer-events-none invisible opacity-0",
      )}
    >
      <div className="animate-in fade-in-0 duration-300 px-5 pt-6 short:px-4 short:pt-4">
        <PanelHeader
          title={header.title}
          subtitle={header.subtitle}
          onClose={onClose}
          onBack={
            view === "detail"
              ? clearSelection
              : view === "arrived"
                ? () => setReplanHubId(atHub!.id)
                : undefined
          }
        />

        {/* Destination search/filter (list view only) */}
        {view === "list" && (
          <div
            className="mt-[18px] flex h-[42px] items-center gap-2.5 rounded-xl px-3.5 short:mt-2 short:h-8 short:gap-2 short:rounded-lg short:px-2.5"
            style={{ background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.09)" }}
          >
            <Search size={16} strokeWidth={2} color="var(--nav-text-faint)" className="shrink-0 short:h-[14px] short:w-[14px]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter a stadium or venue"
              className="nav-body w-full bg-transparent text-[14.5px] font-normal text-[#E6EAEF] outline-none placeholder:text-[var(--nav-text-faint)] short:text-[12.5px]"
            />
          </div>
        )}
      </div>

      <div className="ui-scrollbar animate-in fade-in-0 duration-300 flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overflow-x-hidden px-5 pb-5 pt-5 short:px-4 short:pb-4 short:pt-4 short:gap-2">
        {view === "arrived" && <BusTimetable hub={atHub!} now={now} />}

        {view === "detail" && selectedRow && (
          <DestinationDetail
            row={selectedRow}
            now={now}
            onStart={() => startWalk(selectedRow.hub)}
            onTeleport={() => onTeleport(selectedRow.hub)}
          />
        )}

        {view === "list" && (
          <>
            {listed.map((row) => (
              <VenueCard key={row.venue.id} row={row} onSelect={() => select(row)} />
            ))}
            {listed.length === 0 && (
              <div className="nav-body py-6 text-center text-[13px]" style={{ color: "var(--nav-text-dim)" }}>
                No destinations match
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** A small mode chip ("Train · Metro K Line"). */
function LineChip({ mode, name }: { mode: "bus" | "train"; name: string }) {
  const Icon = mode === "train" ? TrainFront : Bus;
  return (
    <span
      className="nav-body inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium short:text-[11px]"
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--nav-text-2)" }}
    >
      <Icon size={13} strokeWidth={1.9} color="var(--nav-accent-bright)" />
      {name}
    </span>
  );
}

/** A destination venue row in the list — name + sport, "via {hub}" + distance.
 *  Non-accessible venues (no wired route yet) are greyed and not selectable. */
function VenueCard({ row, onSelect }: { row: VenueRow; onSelect: () => void }) {
  const { venue, distLabel, etaLabel } = row;
  const accessible = venue.accessible !== false;
  // Leading destination icon — the same MapPin used for destinations elsewhere.
  const Icon = MapPin;
  return (
    <button
      type="button"
      disabled={!accessible}
      onClick={accessible ? onSelect : undefined}
      className={cn(
        "w-full rounded-2xl px-3.5 py-3 text-left transition-colors short:px-2.5 short:py-2",
        accessible ? "cursor-pointer hover:bg-white/[0.04]" : "cursor-not-allowed opacity-45",
      )}
    >
      <div className="flex items-center gap-3 short:gap-2.5">
        {/* Transit icon tile — smaller on phones so the title gets room. */}
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl short:h-[26px] short:w-[26px] short:rounded-lg"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
        >
          <Icon size={17} strokeWidth={2} color="var(--nav-text-2)" className="short:h-[13px] short:w-[13px]" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="nav-display break-words text-[16px] font-semibold leading-snug short:text-[13px]" style={{ color: "var(--nav-text)" }}>
            {venue.label}
          </div>
        </div>
        <div className="shrink-0 text-right">
          {accessible ? (
            <>
              <div className="nav-display text-[16px] font-semibold short:text-[13px]" style={{ color: "var(--nav-text)" }}>
                {distLabel}
              </div>
              {etaLabel && (
                <div className="nav-body mt-px flex items-center justify-end gap-1 text-[13px] font-normal short:text-[11px]" style={{ color: "var(--nav-text-dim)" }}>
                  <Footprints size={13} strokeWidth={2} className="shrink-0 short:h-[11px] short:w-[11px]" />
                  <span>{etaLabel}</span>
                </div>
              )}
            </>
          ) : (
            <div className="nav-body text-[11.5px] font-medium short:text-[10.5px]" style={{ color: "var(--nav-text-faint)" }}>
              Not accessible
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

/**
 * Selected-destination detail: the venue + the hub to catch at, the lines that
 * serve it, the live board of buses & trains coming, and Start-walk / Teleport.
 */
function DestinationDetail({
  row, now, onStart, onTeleport,
}: {
  row: VenueRow;
  now: number;
  onStart: () => void;
  onTeleport: () => void;
}) {
  const { venue, hub, distLabel, etaLabel } = row;
  return (
    <div className="flex flex-col gap-3 short:gap-2.5">
      {/* destination summary */}
      <div
        className="rounded-2xl p-4 short:p-3"
        style={{ background: "rgba(0,113,227,0.12)", boxShadow: "inset 0 0 0 1px rgba(41,151,255,0.6)" }}
      >
        {venue.sport && (
          <div className="nav-body text-[12px] font-medium short:text-[11px]" style={{ color: "var(--nav-text-dim)" }}>
            {venue.sport}
          </div>
        )}
        <div className="mt-2 flex items-baseline gap-2 short:mt-1.5">
          <span className="nav-display text-[18px] font-semibold leading-none text-white short:text-[15px]" style={{ letterSpacing: "-0.3px" }}>
            {etaLabel || "—"}
          </span>
          <span className="nav-body text-[12px] font-medium short:text-[11px]" style={{ color: "var(--nav-text-dim)" }}>
            {distLabel}
          </span>
        </div>
        {venue.lines.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 border-t pt-3 short:mt-2 short:pt-2.5" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
            {venue.lines.map((l) => (
              <LineChip key={l.name} mode={l.mode} name={l.name} />
            ))}
          </div>
        )}
      </div>

      {/* live departures board at the hub */}
      <BusTimetable hub={hub} now={now} />

      {/* actions */}
      <div className="flex gap-2.5 short:gap-2">
        <button
          type="button"
          onClick={onStart}
          className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[14px] transition-[filter] hover:brightness-110 short:h-9 short:rounded-[10px]"
          style={{ background: "var(--nav-accent)", boxShadow: "0 10px 24px -6px rgba(0,113,227,0.5)" }}
        >
          <Footprints size={16} color="#ffffff" strokeWidth={2} />
          <span className="nav-display text-[15px] font-semibold text-white short:text-[13px]">Start</span>
        </button>
        <button
          type="button"
          onClick={onTeleport}
          className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[14px] transition-colors hover:brightness-110 short:h-9 short:rounded-[10px]"
          style={{ background: "rgba(41,151,255,0.12)", border: "1px solid var(--nav-accent-bright)" }}
        >
          <Zap size={16} color="var(--nav-accent-bright)" strokeWidth={2} />
          <span className="nav-display text-[15px] font-semibold short:text-[13px]" style={{ color: "var(--nav-accent-bright)" }}>Teleport</span>
        </button>
      </div>
    </div>
  );
}
