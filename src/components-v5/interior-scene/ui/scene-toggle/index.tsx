"use client";

import { NAV_GLASS } from "../nav-glass";

interface SceneToggleProps {
  /** Label for the first model (left side, activeIndex 0). */
  leftLabel: string;
  /** Label for the second model (right side, activeIndex 1). */
  rightLabel: string;
  /** Which model is mounted: 0 = left, 1 = right. */
  activeIndex: number;
  disabled?: boolean;
  /** Segment indices that are locked — shown dimmed and not clickable. */
  lockedIndices?: number[];
  /** Switch to the other model (drives the fade-swap). */
  onToggle: () => void;
}

/**
 * SceneToggle — the design's top-right segmented control. Two pill segments in
 * one glass shell; the active model's segment is filled solid blue, the other
 * dimmed. Tapping the inactive segment swaps the mounted model via the fade
 * transition. Dimmed/locked while a swap is in flight.
 */
export function SceneToggle({ leftLabel, rightLabel, activeIndex, disabled, lockedIndices, onToggle }: SceneToggleProps) {
  const segments = [leftLabel, rightLabel];
  return (
    <div
      className="fixed top-6 right-6 z-[220] flex items-center gap-0.5 rounded-[14px] p-[5px] short:top-2 short:right-2 short:rounded-[11px] short:p-[3px]"
      style={{ ...NAV_GLASS, opacity: disabled ? 0.4 : 1, userSelect: "none" }}
    >
      {segments.map((label, i) => {
        const active = i === activeIndex;
        const locked = lockedIndices?.includes(i) ?? false;
        const segDisabled = disabled || active || locked;
        return (
          <button
            key={label + i}
            type="button"
            disabled={segDisabled}
            onClick={() => !active && !locked && onToggle()}
            title={locked ? `${label} (coming soon)` : active ? label : `Switch to ${label}`}
            className="nav-display rounded-[10px] px-3.5 py-[6px] text-center leading-tight transition-colors short:rounded-[8px] short:px-2.5 short:py-[4px]"
            style={{
              fontWeight: active ? 600 : 500,
              letterSpacing: "0.3px",
              color: active ? "#ffffff" : "var(--nav-text-dim)",
              background: active ? "var(--nav-accent)" : "transparent",
              opacity: locked ? 0.4 : 1,
              cursor: segDisabled ? "not-allowed" : "pointer",
            }}
          >
            {(() => {
              // Long venue names ("Name - Location") read better split onto two
              // lines: the venue on top, the location smaller beneath it.
              const [main, ...rest] = label.split(" - ");
              const sub = rest.join(" - ");
              return (
                <span className="block">
                  <span className="block text-[13px] short:text-[11px]">{main}</span>
                  {sub && (
                    <span className="block text-[12px] font-medium opacity-85 short:text-[10.5px]">{sub}</span>
                  )}
                </span>
              );
            })()}
          </button>
        );
      })}
    </div>
  );
}
