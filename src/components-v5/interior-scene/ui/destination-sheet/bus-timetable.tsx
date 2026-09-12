"use client";

import type { Destination } from "@/components-v5/shared/types";
import { nextInMin } from "./transit-time";
import { depClock, lineCode, modeTag, occupancy } from "@/components-v5/shared/timetable";

interface BusTimetableProps {
  /** The transport hub the player is standing at. */
  hub: Destination;
  /** Live clock (ms) — drives the "in N min" countdown + departure time. */
  now: number;
}

/** Line badges, mode tags, occupancy strips and departure clocks all live in
 *  `shared/timetable.ts` now, so the VR departures panel renders the same board
 *  from the same maths rather than inventing its own line codes. */

/**
 * Departures board for a transit hub — styled like the LA28 design's booking
 * list. One row per route: a line badge (code + BUS/METRO/SHTL) · route →
 * destination · headway · a 3-segment occupancy strip · the live "N min"
 * countdown + departure clock. No row is pre-selected — it's a plain list of
 * everything coming, sorted soonest-first.
 */
export function BusTimetable({ hub, now }: BusTimetableProps) {
  const routes = hub.transit?.routes ?? [];
  if (routes.length === 0) {
    return (
      <div className="nav-body py-6 text-center text-[13px]" style={{ color: "var(--nav-text-dim)" }}>
        No departures from this hub
      </div>
    );
  }

  // Sort soonest-first (no highlight, just order).
  const sorted = routes
    .map((r) => ({ r, eta: nextInMin(r.headwayMin, hub.id + r.name, now) }))
    .sort((a, b) => a.eta - b.eta);

  return (
    <div className="flex flex-col gap-1 short:gap-0.5">
      <div className="flex items-center justify-between px-2 pb-1">
        <span className="nav-display text-[12.5px] font-semibold tracking-[0.3px]" style={{ color: "#C8CFD8" }}>
          Departures
        </span>
        <span className="nav-body flex items-center gap-1.5 text-[11px] font-medium" style={{ color: "#30D158" }}>
          <span className="h-[7px] w-[7px] rounded-full" style={{ background: "#30D158", boxShadow: "0 0 7px #30D158" }} />
          Live
        </span>
      </div>

      {sorted.map(({ r, eta }) => {
        const occ = occupancy(r.seats);
        return (
          <div key={r.name} className="flex items-center gap-3 rounded-[15px] p-3 short:gap-2.5 short:p-2.5">
            {/* line badge */}
            <div
              className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-[11px] short:h-9 short:w-9"
              style={{ background: "rgba(255,255,255,0.08)" }}
            >
              <span className="nav-display text-[14px] font-bold leading-none short:text-[13px]" style={{ color: "var(--nav-text)" }}>
                {lineCode(r)}
              </span>
              <span className="text-[8px] tracking-[0.5px]" style={{ color: "var(--nav-text-faint)" }}>
                {modeTag(r)}
              </span>
            </div>

            {/* route + occupancy */}
            <div className="min-w-0 flex-1">
              <div className="nav-display truncate text-[14.5px] font-semibold short:text-[13px]" style={{ color: "var(--nav-text)" }}>
                {r.name}
              </div>
              <div className="nav-body mt-px truncate text-[12px] font-normal short:text-[11px]" style={{ color: "var(--nav-text-dim)" }}>
                every {r.headwayMin} min
              </div>
              <div className="mt-1.5 flex items-center gap-1">
                {[0, 1, 2].map((seg) => (
                  <span
                    key={seg}
                    className="h-[5px] w-[14px] rounded-[3px]"
                    style={{ background: seg < occ.filled ? occ.color : "rgba(255,255,255,0.18)" }}
                  />
                ))}
                <span className="nav-body ml-1 text-[10.5px]" style={{ color: "var(--nav-text-faint)" }}>
                  {occ.label}
                </span>
              </div>
            </div>

            {/* departure clock */}
            <div className="shrink-0 text-right">
              <div className="nav-display text-[15px] font-semibold leading-none short:text-[14px]" style={{ color: "var(--nav-text)" }}>
                {depClock(now, eta)}
              </div>
              <div className="nav-body mt-[3px] text-[10.5px]" style={{ color: "var(--nav-text-faint)" }}>
                dep
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
