"use client";

import type { Dispatch, SetStateAction } from "react";
import { MapPin, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Destination } from "@/components-v5/shared/types";
import type { CategoryMeta } from "./category-meta";
import type { DestinationRow } from "./use-destinations";
import { PanelHeader } from "./panel-header";
import { SegmentRow, type Segment } from "./segment-row";
import { SubcategoryRail } from "./subcategory-rail";
import { SelectedDestination } from "./selected-destination";
import { DestinationCard } from "./destination-card";
import { NAV_GLASS_PANEL } from "../nav-glass";
import type { DirStep } from "./directions-steps";

interface DestinationPanelProps {
  meta: CategoryMeta;
  count: number;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  /** Optional segment control (Dining mode / Practice sport). */
  segments?: Segment[];
  /** Single-select active id (Dining tabs). */
  activeSegment?: string;
  /** Multi-select active ids (Practice sport chips). */
  activeSegmentSet?: Set<string>;
  /** Sets (tabs) or toggles (chips) the segment id. */
  onSegment?: (id: string) => void;
  rows: DestinationRow[];
  selectedRow: DestinationRow | null;
  now: number;
  visible: boolean;
  onSelect: (dest: Destination) => void;
  onStart: (dest: Destination) => void;
  onClear: () => void;
  onClose: () => void;
  onTeleport: (dest: Destination) => void;
  reached: boolean;
  steps: DirStep[];
  /** destination the player is standing at — shown inline in the list with an "Already
   *  here" marker (option categories only). */
  hereId?: string | null;
  /** The active sub-category has no authored destinations yet (no camera or
   *  hotspot data delivered) — swap the empty state to a "no data" message. */
  noData?: boolean;
  /** Category with a walk-in interior (the hostel) — forwarded to the selected
   *  destination card as its "Explore from inside" action. */
  onExploreInside?: () => void;
}

/** The floating label panel (design layout): header → search → filter tabs →
 *  selected destination → more-nearby list. Pure presentation; state lives in
 *  DestinationOverlay. */
export function DestinationPanel({
  meta, count, query, setQuery,
  segments, activeSegment, activeSegmentSet, onSegment,
  rows, selectedRow, now, visible, onSelect, onStart, onClear, onClose, onTeleport, reached, steps, hereId, noData,
  onExploreInside,
}: DestinationPanelProps) {
  const more = selectedRow ? rows.filter((r) => r.dest.id !== selectedRow.dest.id) : rows;

  return (
    <div
      style={NAV_GLASS_PANEL}
      className={cn(
        // Base = desktop. `short:` (max-height ≤480px = a LANDSCAPE PHONE — the
        // app forces landscape) shrinks the panel so it fits the short viewport
        // and clears the bottom dock; the body scrolls for the rest.
        // Sits to the RIGHT of the left sidebar (clears its width) so the two
        // never overlap — reads as one flex row of rail + panel.
        // Grow with content up to ~80% of the screen, then the body scrolls.
        // On phones the panel is scaled 0.8, so a 100dvh cap reads as ~80% tall.
        "fixed left-[88px] top-4 z-[115] flex w-[360px] max-w-[calc(100vw-104px)] flex-col overflow-hidden rounded-[14px] max-h-[80dvh]",
        "short:left-[54px] short:top-1 short:w-[236px] short:max-w-[calc(100vw-64px)] short:rounded-[10px] short:max-h-[100dvh] short:origin-top-left short:scale-[0.8]",
        // Opacity-only (no slide) + short duration: animating a backdrop-blur
        // panel's transform/opacity over the live WebGL canvas re-computes the
        // blur every frame and janks — fading briefly in place is far smoother.
        // `invisible` (flips at the END of the fade-out) stops the hidden panel
        // from compositing its blur over the canvas every frame while closed.
        "transition-[opacity,visibility] duration-200 ease-out",
        visible ? "opacity-100" : "pointer-events-none invisible opacity-0",
      )}
    >
      {/* Header zone — when a destination is picked the panel becomes a
          turn-by-turn "Directions" view (design); otherwise it's the label list
          with search + filter tabs. */}
      {/* Header + body share the same horizontal padding so the tabs/dropdown
          and the list cards line up to identical widths. Keyed by mode so the
          list ↔ directions swap cross-fades instead of snapping. */}
      <div key={selectedRow ? "dir-head" : "list-head"} className="animate-in fade-in-0 duration-300 px-5 pt-6 short:px-4 short:pt-4">
        <PanelHeader
          title={selectedRow ? selectedRow.dest.label : meta.label}
          subtitle={
            selectedRow
              ? ""
              : `${count} ${meta.unit} · nearest first`
          }
          onClose={onClose}
          onBack={selectedRow ? onClear : undefined}
        />

        {!selectedRow && (
          <>
            {/* Segment control (Dining mode / Practice sport) — kept simple,
                no extra filter chips. */}
            {segments && segments.length > 1 && onSegment && (
              <div className="mt-3.5 short:mt-2">
                {meta.segmentBy === "option" ? (
                  // Many sub-categories → horizontal icon carousel (no wrapping).
                  <SubcategoryRail
                    segments={segments}
                    active={activeSegment ?? segments[0].id}
                    onSelect={onSegment}
                  />
                ) : (
                  <SegmentRow
                    segments={segments}
                    variant={meta.segmentBy === "sport" ? "chips" : "tabs"}
                    active={activeSegment}
                    activeSet={activeSegmentSet}
                    onSelect={onSegment}
                  />
                )}
              </div>
            )}

            {/* Live status notices (Safety & Guidance emergency updates) —
                UNDER the sub-category control, compact board rows. */}
            {meta.notices && meta.notices.length > 0 && (
              <div
                className="mt-3 flex flex-col gap-1.5 rounded-[10px] p-3 short:mt-2 short:gap-1 short:p-2.5"
                style={{ background: "rgba(255,255,255,0.05)" }}
              >
                {meta.notices.map((n) => (
                  <div key={n.text} className="flex items-start gap-2">
                    <span
                      aria-hidden
                      className="mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full"
                      style={{
                        background: n.tone === "alert" ? "#FF453A" : n.tone === "warn" ? "#ffd60a" : "#30D158",
                      }}
                    />
                    <span className="nav-body text-[12px] font-normal leading-snug short:text-[11px]" style={{ color: "var(--nav-text-2)" }}>
                      {n.text}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Search — only when the list is long enough to need it. */}
            {count > 4 && (
              <div
                className="mt-3.5 flex h-[38px] items-center gap-2.5 rounded-xl px-3.5 short:mt-2 short:h-8 short:gap-2 short:rounded-lg short:px-2.5"
                style={{ background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.09)" }}
              >
                <Search size={15} strokeWidth={2} color="var(--nav-text-faint)" className="shrink-0 short:h-[14px] short:w-[14px]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${meta.label.toLowerCase()}`}
                  className="nav-body w-full bg-transparent text-[13px] font-normal text-[#E6EAEF] outline-none placeholder:text-[var(--nav-text-faint)] short:text-[12px]"
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Body — directions panel when selected, else the scrollable list. */}
      <div key={selectedRow ? "dir-body" : "list-body"} className="ui-scrollbar animate-in fade-in-0 slide-in-from-bottom-1 duration-300 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden px-5 pb-5 pt-5 short:gap-1.5 short:px-4 short:pb-4 short:pt-4">
        {selectedRow ? (
          <SelectedDestination
            row={selectedRow}
            icon={meta.icon}
            now={now}
            onStart={() => onStart(selectedRow.dest)}
            onTeleport={() => onTeleport(selectedRow.dest)}
            reached={reached}
            steps={steps}
            onExploreInside={onExploreInside}
          />
        ) : (
          <>
            {/* Each row's leading tile is a location pin — NOT the category icon.
                The category icon already identifies the label on the rail/header,
                so repeating it on every destination row was redundant (every row
                showed the same glyph). A pin reads as "a place" per row instead. */}
            {more.map((row) => (
              <DestinationCard
                key={row.dest.id}
                row={row}
                selected={false}
                icon={MapPin}
                now={now}
                here={row.dest.id === hereId}
                onSelect={() => onSelect(row.dest)}
                // Walk-in interior: the standing-at row never opens the
                // directions view, so its "You're here" card carries the
                // "Explore from inside" action instead.
                onExploreInside={row.dest.id === hereId ? onExploreInside : undefined}
              />
            ))}

            {rows.length === 0 && (
              <div className="nav-body py-6 text-center text-[13px]" style={{ color: "var(--nav-text-dim)" }}>
                {noData ? "No data for this category yet" : "No places match those filters"}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
