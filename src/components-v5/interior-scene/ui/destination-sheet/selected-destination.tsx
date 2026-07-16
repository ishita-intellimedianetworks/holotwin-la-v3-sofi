"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowUp, CornerUpLeft, CornerUpRight, DoorOpen, Footprints, MapPin, Zap } from "lucide-react";
import type { DestinationRow } from "./use-destinations";
import { stepLabel, fmtMeters, type DirStep } from "./directions-steps";
import { CROWD_DOT } from "./destination-card";

interface SelectedDestinationProps {
  row: DestinationRow;
  /** Kept for call-site compatibility; the directions view uses pins, not the tile. */
  icon: LucideIcon;
  now: number;
  onStart: () => void;
  onTeleport: () => void;
  /** Player is standing at this destination → show "Reached" instead of CTAs. */
  reached: boolean;
  /** Turn-by-turn legs of the preview route (last entry is the arrival). */
  steps: DirStep[];
  /** Destination with a walk-in interior (the Athletes' Hostel) — renders an
   *  "Explore from inside" action that swaps straight into the interior model. */
  onExploreInside?: () => void;
}

const STEP_ICON = { straight: ArrowUp, left: CornerUpLeft, right: CornerUpRight, arrive: MapPin } as const;

/** "6 min" / "1 min 20 sec" / "45 sec" / "1 hr 5 min" → seconds. */
function etaToSec(label: string): number {
  let s = 0;
  const hr = /(\d+)\s*hr/.exec(label);
  const min = /(\d+)\s*min/.exec(label);
  const sec = /(\d+)\s*sec/.exec(label);
  if (hr) s += +hr[1] * 3600;
  if (min) s += +min[1] * 60;
  if (sec) s += +sec[1];
  return s;
}
/** Wall-clock arrival time, e.g. "9:43". */
function arriveClock(now: number, etaLabel: string): string {
  const d = new Date(now + etaToSec(etaLabel) * 1000);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * The selected destination as a turn-by-turn "Directions" view (design): an
 * origin → destination timeline (blue dot → red pin on a gradient connector),
 * the big ETA with distance + arrival clock, the transit hop for transport
 * stops, and the Start-walk / Teleport actions (or a "Reached" badge on
 * arrival). Tapping the timeline deselects + clears the preview route.
 */
export function SelectedDestination({ row, now, onStart, onTeleport, reached, steps, onExploreInside }: SelectedDestinationProps) {
  const { dest, distLabel, etaLabel } = row;
  const arrive = etaLabel ? arriveClock(now, etaLabel) : "";
  // Walkable = the navmesh actually has a route there (distance measured).
  // Anything else is teleport-only: no Start button, no turn-by-turn — the
  // panel shows the destination's info instead.
  const walkable = row.meters != null;

  // Directions stays minimal: the name lives in the panel header; here we show
  // only the options available (menu / sports) — no descriptor pills, which just
  // echoed the name (e.g. "Café" under "Village Café").
  const options = dest.sports?.length ? dest.sports : dest.menu?.length ? dest.menu : null;

  return (
    <div
      className="relative rounded-2xl p-4 short:p-3"
      style={{ background: "rgba(0,113,227,0.12)", boxShadow: "inset 0 0 0 1px rgba(41,151,255,0.6)" }}
    >
      {options && (
        <div className="flex flex-wrap gap-1.5">
          {options.map((o) => (
            <span
              key={o}
              className="nav-body rounded-full px-2.5 py-1 text-[11.5px] font-medium short:text-[10.5px]"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--nav-text-2)" }}
            >
              {o}
            </span>
          ))}
        </div>
      )}

      {/* Big readout: ETA + distance / arrival while heading there — or
          "You're here · Currently at {place}" once arrived. */}
      <div className="mt-3 flex items-baseline gap-2 short:mt-2">
        <span className="nav-display text-[18px] font-semibold leading-none text-white short:text-[16px]" style={{ letterSpacing: "-0.3px" }}>
          {reached ? "You're here" : walkable ? etaLabel || "—" : "Instant travel"}
        </span>
        <span className="nav-body text-[12px] font-medium short:text-[11px]" style={{ color: "var(--nav-text-dim)" }}>
          {reached
            ? `at ${dest.label}`
            : walkable
              ? `${distLabel}${arrive ? ` · arrive ${arrive}` : ""}`
              : "teleport to this destination"}
        </span>
      </div>

      {/* Live crowd status for this destination (memorial gates) — same
          red/yellow/blue tiers as the card dots. */}
      {dest.crowd && dest.crowdNote && CROWD_DOT[dest.crowd] && (
        <div className="mt-2 flex items-start gap-2 short:mt-1.5">
          <span
            aria-hidden
            className="mt-[4px] h-[8px] w-[8px] shrink-0 rounded-full"
            style={{ background: CROWD_DOT[dest.crowd], boxShadow: `0 0 6px ${CROWD_DOT[dest.crowd]}` }}
          />
          <span className="nav-body text-[12px] font-normal leading-snug short:text-[11px]" style={{ color: "var(--nav-text-2)" }}>
            {dest.crowdNote}
          </span>
        </div>
      )}

      {/* Actions: Start walk + Teleport. Hidden once arrived — the "You're here"
          readout above is the only indication then (no action needed). */}
      {!reached && (
        <div className="mt-4 flex gap-2.5 short:mt-2.5 short:gap-2">
          {/* Walk only where the navmesh has a route — off-mesh destinations
              are teleport-only. */}
          {walkable && (
          <button
            type="button"
            onClick={onStart}
            className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[14px] transition-[filter] hover:brightness-110 short:h-9 short:gap-1.5 short:rounded-[10px]"
            style={{ background: "var(--nav-accent)", boxShadow: "0 10px 24px -6px rgba(0,113,227,0.5)" }}
          >
            <Footprints className="h-4 w-4 shrink-0 short:h-[13px] short:w-[13px]" color="#ffffff" strokeWidth={2} />
            <span className="nav-display whitespace-nowrap text-[15px] font-semibold text-white short:text-[12px]">Start</span>
          </button>
          )}
          <button
            type="button"
            onClick={onTeleport}
            className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[14px] transition-colors hover:brightness-110 short:h-9 short:gap-1.5 short:rounded-[10px]"
            style={{ background: "rgba(41,151,255,0.12)", border: "1px solid var(--nav-accent-bright)" }}
          >
            <Zap className="h-4 w-4 shrink-0 short:h-[13px] short:w-[13px]" color="var(--nav-accent-bright)" strokeWidth={2} />
            <span className="nav-display whitespace-nowrap text-[15px] font-semibold short:text-[12px]" style={{ color: "var(--nav-accent-bright)" }}>
              Teleport
            </span>
          </button>
        </div>
      )}

      {/* Walk-in interior (Athletes' Hostel): jump straight inside the room
          model. Standing here it's the PRIMARY (and only) action; before
          arrival it sits in its own divided section on a neutral surface, so
          it reads as "enter the building" — distinct from the blue movement
          CTAs above (a second blue-outline button next to Teleport read as a
          duplicate). */}
      {onExploreInside && reached && (
        <button
          type="button"
          title="Explore the room from inside"
          onClick={onExploreInside}
          className="mt-4 flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-[14px] transition-[filter] hover:brightness-110 short:mt-2.5 short:h-9 short:gap-1.5 short:rounded-[10px]"
          style={{ background: "var(--nav-accent)", boxShadow: "0 10px 24px -6px rgba(0,113,227,0.5)" }}
        >
          <DoorOpen className="h-4 w-4 shrink-0 short:h-[13px] short:w-[13px]" color="#ffffff" strokeWidth={2} />
          <span className="nav-display whitespace-nowrap text-[15px] font-semibold text-white short:text-[12px]">
            Explore from inside
          </span>
        </button>
      )}
      {onExploreInside && !reached && (
        <div className="mt-4 border-t pt-3 short:mt-2.5 short:pt-2" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          <button
            type="button"
            title="Explore the room from inside"
            onClick={onExploreInside}
            className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[12px] transition-colors hover:bg-white/[0.1] short:h-9 short:gap-1.5 short:rounded-[10px]"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
          >
            <DoorOpen className="h-4 w-4 shrink-0 short:h-[13px] short:w-[13px]" color="var(--nav-text)" strokeWidth={2} />
            <span className="nav-display whitespace-nowrap text-[14px] font-semibold short:text-[12px]" style={{ color: "var(--nav-text)" }}>
              Explore from inside
            </span>
          </button>
        </div>
      )}

      {/* Teleport-only destination (off the navmesh): no directions exist —
          show the destination's info instead. */}
      {!reached && !walkable && (
        <div className="mt-4 border-t pt-2 short:mt-2.5" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          {dest.note && (
            <p className="nav-body pt-1.5 text-[12px] font-normal leading-snug short:text-[11px]" style={{ color: "var(--nav-text-2)" }}>
              {dest.note}
            </p>
          )}
          {!!dest.tags?.length && (
            <div className="flex flex-wrap gap-1.5 pt-2">
              {dest.tags.map((t) => (
                <span
                  key={t}
                  className="nav-body rounded-full px-2.5 py-1 text-[11px] font-medium"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--nav-text-2)" }}
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-start gap-2 pt-2.5">
            <Zap size={13} strokeWidth={2} color="var(--nav-accent-bright)" className="mt-[2px] shrink-0" />
            <span className="nav-body text-[12px] font-normal leading-snug short:text-[11px]" style={{ color: "var(--nav-text-dim)" }}>
              No walking zone available from this point to the selected destination — Teleport
              takes you straight there.
            </span>
          </div>
        </div>
      )}

      {/* Turn-by-turn steps — only while heading there (cleared once arrived).
          The turns scroll inside a bounded region (edge fades hint "…" more)
          while the red Arrive row stays pinned below, always visible. */}
      {!reached && steps.length > 1 &&
        (() => {
          const turns = steps.filter((s) => s.kind !== "arrive");
          const arriveStep = steps.find((s) => s.kind === "arrive");
          const overflowing = turns.length > 4;
          const fade =
            "linear-gradient(to bottom, transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%)";
          const renderRow = (s: DirStep, key: string | number) => {
            const Icon = STEP_ICON[s.kind];
            const isArrive = s.kind === "arrive";
            return (
              <div key={key} className="flex items-center gap-3 py-2.5 short:gap-2.5 short:py-1.5">
                <Icon size={18} strokeWidth={1.9} color={isArrive ? "#E8453C" : "var(--nav-text-2)"} className="shrink-0" />
                <span
                  className="nav-body min-w-0 flex-1 truncate text-[13.5px] short:text-[12.5px]"
                  style={{ color: isArrive ? "var(--nav-text)" : "var(--nav-text-2)", fontWeight: isArrive ? 600 : 500 }}
                >
                  {stepLabel(s, dest.label)}
                </span>
                {!isArrive && s.meters > 0 && (
                  <span
                    className="nav-body shrink-0 whitespace-nowrap text-[12.5px] font-medium short:text-[11.5px]"
                    style={{ color: "var(--nav-text-faint)" }}
                  >
                    {fmtMeters(s.meters)}
                  </span>
                )}
              </div>
            );
          };
          return (
            <div className="mt-4 border-t pt-1 short:mt-2.5" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
              <div
                className="ui-scrollbar max-h-[176px] overflow-y-auto short:max-h-[92px]"
                style={overflowing ? { maskImage: fade, WebkitMaskImage: fade } : undefined}
              >
                {turns.map((s, i) => renderRow(s, i))}
              </div>
              {arriveStep && (
                <div className="border-t pt-0.5" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                  {renderRow(arriveStep, "arrive")}
                </div>
              )}
            </div>
          );
        })()}
    </div>
  );
}
