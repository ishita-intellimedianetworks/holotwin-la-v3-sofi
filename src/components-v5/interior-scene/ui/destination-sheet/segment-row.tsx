"use client";

export interface Segment {
  id: string;
  label: string;
  /** Optional count badge — used by the sub-category carousel, ignored here. */
  count?: number;
}

interface SegmentRowProps {
  segments: Segment[];
  /** "tabs" = single-select Campus/Restaurants control; "chips" = multi-select
   *  sport filters (pick several). Defaults to "tabs". */
  variant?: "tabs" | "chips";
  /** Single-select active id (tabs). */
  active?: string;
  /** Multi-select active ids (chips). */
  activeSet?: Set<string>;
  /** Click handler — sets the active id (tabs) or toggles it (chips). */
  onSelect: (id: string) => void;
}

/**
 * Segment control above the options list (LA28 design). "tabs" is the two-up
 * Campus-Dining / Restaurants control (single-select, solid-blue fill). "chips"
 * is a wrapping multi-select sport filter row (any number active at once; none
 * active = show all).
 */
export function SegmentRow({ segments, variant = "tabs", active, activeSet, onSelect }: SegmentRowProps) {
  if (variant === "chips") {
    // Wrap (no horizontal scroll) so every sport is visible — sleek small pills.
    return (
      <div className="flex flex-wrap gap-1.5">
        {segments.map((s) => {
          const on = activeSet?.has(s.id) ?? false;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              className="nav-display shrink-0 cursor-pointer whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] transition-colors short:px-2 short:py-1 short:text-[11px]"
              style={
                on
                  ? { fontWeight: 600, color: "#ffffff", background: "var(--nav-accent)" }
                  : {
                      fontWeight: 500,
                      color: "#AEB8C6",
                      background: "rgba(255,255,255,0.08)",
                    }
              }
            >
              {s.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-[3px] rounded-[13px] p-[4px]"
      style={{ background: "rgba(255,255,255,0.06)" }}
    >
      {segments.map((s) => {
        const on = s.id === active;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            className="nav-display flex-1 cursor-pointer rounded-[10px] py-[9px] text-center text-[13.5px] transition-colors short:py-1.5 short:text-[12px]"
            style={{
              fontWeight: on ? 600 : 500,
              color: on ? "#ffffff" : "#AEB8C6",
              background: on ? "var(--nav-accent)" : "transparent",
            }}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
