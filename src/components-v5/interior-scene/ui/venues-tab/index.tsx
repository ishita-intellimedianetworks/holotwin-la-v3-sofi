"use client";

import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_GLASS_PANEL } from "../nav-glass";
import { PanelHeader } from "../destination-sheet/panel-header";
import { useShortViewport } from "@/components-v5/shared/responsive";

interface VenueItem {
  /** Matches a floor `id` when the venue is selectable. */
  key: string;
  label: string;
  /** Short location/sub-line shown under the venue name. */
  sub: string;
  /** false → listed but locked with a "Soon" badge (no model yet). */
  available: boolean;
}

interface VenuesTabProps {
  /** All site floors — used to map an available venue.key → its floor index. */
  floors: Array<{ id: string }>;
  activeFloorIndex: number;
  disabled?: boolean;
  /** While walking, tuck the whole flap off the right edge (mirrors the rail). */
  isMoving?: boolean;
  /** Controlled open state of the list panel (lifted so it can close left panels). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Switch to the floor backing the chosen venue (drives the fade-swap). */
  onSelectFloor: (index: number) => void;
}

/**
 * VenuesTab — replaces the old two-segment SceneToggle. A vertical flap pinned
 * to the RIGHT edge, vertically centred, drawn exactly like the left sidebar
 * flaps (clipped glass/accent fill + crisp SVG border) but mirrored: square +
 * borderless on the right (screen) edge, rounded with a border on the inner
 * (left) side. The word "VENUES" reads top-to-bottom, one letter per line.
 * Tapping it slides a venue list out to its left. Only "LA 28 Olympic Village"
 * has a model today (the compressed village scene) and is selected by default;
 * Memorial and Stadium are listed locked with a "Soon" badge.
 *
 * Open state is controlled by the parent so it can mutually exclude the
 * left-side panels (opening one closes the other).
 */
const VENUES: VenueItem[] = [
  { key: "village", label: "LA 28 Olympic Village", sub: "", available: true },
  { key: "memorial", label: "LA Memorial Coliseum", sub: "Exposition Park", available: true },
  { key: "stadium", label: "2028 Stadium", sub: "Inglewood", available: true },
];

export function VenuesTab({ floors, activeFloorIndex, disabled, isMoving, open, onOpenChange, onSelectFloor }: VenuesTabProps) {
  const activeId = floors[activeFloorIndex]?.id;
  const short = useShortViewport();
  // Tall enough for the six stacked letters; sized like the left rail flaps
  // (which are 46px wide on short / 58px on desktop).
  const dim = short ? { w: 44, h: 158, r: 10 } : { w: 52, h: 228, r: 12 };

  return (
    <div
      className="fixed right-0 top-1/2 z-[220] flex transition-[opacity,transform] duration-[600ms] ease-out"
      style={{
        userSelect: "none",
        // Walking → slide the whole flap off the right edge (mirrors the rail).
        transform: isMoving ? "translate(110%, -50%)" : "translate(0, -50%)",
        opacity: isMoving ? 0 : 1,
        pointerEvents: isMoving ? "none" : undefined,
      }}
    >
      {/* List panel — same glass shell + card rows as the left-icon overlays,
          mirrored to the right of the flap. Kept mounted and faded (opacity
          only — animating the backdrop-blur surface janks) so it animates on
          close as well as open; absolutely placed so it never shifts the flap. */}
      {/* `inert` (not aria-hidden): the close button inside keeps focus after
          the closing click, and aria-hidden on a focused subtree trips the
          browser's accessibility warning. inert both hides from AT and
          releases/blocks focus. */}
      <div
        inert={!open}
        className={cn(
          "absolute top-1/2 flex w-[340px] max-w-[calc(100vw-104px)] -translate-y-1/2 flex-col overflow-hidden rounded-[14px] transition-opacity duration-[500ms] ease-out",
          // Phone (landscape): shrink the whole panel like the left overlays do,
          // anchored toward the flap on the right edge.
          "short:w-[248px] short:rounded-[10px] short:origin-right short:scale-[0.85]",
          open && !disabled ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        style={{ ...NAV_GLASS_PANEL, right: dim.w + 12 }}
      >
          <div className="px-5 pt-6 short:px-4 short:pt-4">
            <PanelHeader title="Choose a venue to explore" subtitle="" onClose={() => onOpenChange(false)} />
          </div>

          <div className="flex flex-col gap-2 px-5 pb-5 pt-5 short:px-4 short:pb-4 short:pt-4">
            {VENUES.map((v) => {
              const floorIdx = floors.findIndex((f) => f.id === v.key);
              const active = v.available && v.key === activeId;
              const clickable = v.available && floorIdx >= 0 && !active && !disabled;
              return (
                <button
                  key={v.key}
                  type="button"
                  disabled={!clickable && !active}
                  onClick={() => {
                    if (clickable) {
                      onSelectFloor(floorIdx);
                      onOpenChange(false);
                    }
                  }}
                  title={v.available ? (active ? v.label : `Switch to ${v.label}`) : `${v.label} (coming soon)`}
                  className={`flex items-center gap-3 rounded-2xl p-3 text-left transition-colors short:gap-2.5 short:p-2.5 ${
                    clickable ? "hover:bg-white/[0.08]" : ""
                  }`}
                  style={{
                    background: active ? "rgba(43,124,255,0.16)" : "rgba(255,255,255,0.045)",
                    border: active ? "1px solid var(--nav-accent)" : "1px solid rgba(255,255,255,0.07)",
                    opacity: v.available ? 1 : 0.6,
                    cursor: clickable ? "pointer" : active ? "default" : "not-allowed",
                  }}
                >
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl short:h-8 short:w-8"
                    style={{
                      background: active ? "var(--nav-accent)" : "rgba(255,255,255,0.06)",
                      border: active ? "1px solid var(--nav-accent)" : "1px solid rgba(255,255,255,0.10)",
                    }}
                  >
                    <MapPin size={17} strokeWidth={2} color={active ? "#ffffff" : "var(--nav-text-2)"} className="short:h-[15px] short:w-[15px]" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <span
                      className="nav-display block truncate text-[14px] font-semibold leading-snug short:text-[12.5px]"
                      style={{ color: "var(--nav-text)" }}
                    >
                      {v.label}
                    </span>
                    {v.sub && (
                      <span
                        className="nav-body mt-0.5 block truncate text-[12.5px] font-normal leading-snug short:text-[11.5px]"
                        style={{ color: "var(--nav-text-dim)" }}
                      >
                        {v.sub}
                      </span>
                    )}
                  </div>

                </button>
              );
            })}
          </div>
        </div>

      {/* Edge flap — mirrored Flap geometry (square right edge, rounded left). */}
      <VenuesFlap
        dim={dim}
        active={open}
        short={short}
        onClick={() => !disabled && onOpenChange(!open)}
        disabled={disabled}
        open={open}
      />
    </div>
  );
}

/** One flap tab attached to the RIGHT edge — the mirror of the sidebar `Flap`.
 *  Square + borderless on the right (screen) side, rounded with an SVG border on
 *  the left. Same clipped glass/accent fill + crisp stroke recipe. */
function VenuesFlap({
  dim, active, short, onClick, disabled, open,
}: {
  dim: { w: number; h: number; r: number };
  active: boolean;
  short: boolean;
  onClick: () => void;
  disabled?: boolean;
  open: boolean;
}) {
  const { w, h, r } = dim;
  // Fill shape (closed): rounded LEFT corners, square right corners.
  const fillPath =
    `M ${w} 0 L ${r} 0 Q 0 0 0 ${r} ` +
    `L 0 ${h - r} Q 0 ${h} ${r} ${h} L ${w} ${h} Z`;
  // Border (open): top → left → bottom only, skipping the right (screen) edge.
  const borderPath =
    `M ${w} 1 L ${1 + r} 1 Q 1 1 1 ${1 + r} ` +
    `L 1 ${h - 1 - r} Q 1 ${h - 1} ${1 + r} ${h - 1} L ${w} ${h - 1}`;
  return (
    <button
      type="button"
      title={open ? "Hide venues" : "Show venues"}
      aria-expanded={open}
      disabled={disabled}
      onClick={onClick}
      className="relative shrink-0 transition-colors duration-200 ease-out"
      style={{ width: w, height: h, opacity: disabled ? 0.4 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
    >
      {/* Glass / accent fill, clipped to the flap shape. */}
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          ...(active ? { ...NAV_GLASS_PANEL, background: "var(--nav-accent)" } : NAV_GLASS_PANEL),
          clipPath: `path('${fillPath}')`,
          WebkitClipPath: `path('${fillPath}')`,
        }}
      />
      {/* Crisp border, top→left→bottom only (no border on the edge side). */}
      <svg aria-hidden width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="pointer-events-none absolute inset-0">
        <path d={borderPath} fill="none" stroke={active ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.16)"} strokeWidth={1.5} />
      </svg>
      {/* "VENUES" stacked, one letter per line, evenly spaced. */}
      <span
        className="nav-display absolute inset-0 flex flex-col py-2 short:py-1.5"
        style={{
          alignItems: "center",
          justifyContent: "space-evenly",
          fontWeight: 500,
          letterSpacing: "1px",
          color: active ? "#ffffff" : "var(--nav-text)",
        }}
      >
        {"VENUES".split("").map((ch, i) => (
          <span key={i} className={short ? "block text-[13px] leading-none" : "block text-[16px] leading-none"}>
            {ch}
          </span>
        ))}
      </span>
    </button>
  );
}
