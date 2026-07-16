"use client";

import type { ReactNode } from "react";
import { Home, Bell, Users } from "lucide-react";

import type { DestinationCategory } from "@/components-v5/shared/types";
import type { CategoryMeta } from "../destination-sheet/category-meta";
import { NAV_GLASS_PANEL } from "../nav-glass";
import { useShortViewport } from "@/components-v5/shared/responsive";

interface SidebarProps {
  /** Entrance gate — fades the rail in with the rest of the UI. */
  mapEntered: boolean;
  fadeVisible: boolean;
  /** Player is walking — the whole rail slides off the left edge meanwhile. */
  isMoving?: boolean;
  /** Home row highlighted (at the start spot, nothing else open). */
  homeActive: boolean;
  /** Categories with entries on the active floor. */
  destCats: CategoryMeta[];
  /** Open category, or null. */
  openLabel: DestinationCategory | null;
  /** The map window is open — highlights the Map icon. */
  mapOpen: boolean;
  /** This floor has an event-day feed → show the Event Day flap. */
  hasEvents?: boolean;
  /** The Event Day panel is open — highlights its flap. */
  eventsOpen?: boolean;
  /** Show the Crowd Flow flap (stadium only). Placeholder — inert for now;
   *  a different crowd-flow approach gets wired in later. */
  showCrowd?: boolean;
  onOpenMap: () => void;
  onHome: () => void;
  onPickCategory: (k: DestinationCategory) => void;
  onOpenEvents?: () => void;
}

/**
 * The left wayfinding rail (replaces the old bottom dock). Each item is its own
 * square flap pinned flush to the screen's left edge — a square tab stuck to the
 * border (rounded on the right side only), stacked vertically. A Map flap on top
 * opens the resizable map window; below it the navigation flaps stack (Home + one
 * per destination category). The Stop action while walking lives at the screen's
 * bottom-centre, not here.
 */
export function Sidebar({
  mapEntered, fadeVisible, isMoving = false, homeActive, destCats, openLabel, mapOpen,
  hasEvents, eventsOpen, showCrowd, onOpenMap, onHome, onPickCategory, onOpenEvents,
}: SidebarProps) {
  // Exactly one rail item is highlighted at a time: an open map / event panel
  // outranks Home + the categories.
  const homeOn = homeActive && !mapOpen && !eventsOpen;
  // On a landscape phone the full-size flaps don't fit (Map + Home + categories
  // overflow the short viewport), so shrink them and let the rail scroll.
  const short = useShortViewport();
  const dim = short ? { w: 46, h: 50, r: 10 } : { w: 58, h: 96, r: 12 };
  const iconCls = short ? "!h-[17px] !w-[17px]" : "";
  return (
    <div
      style={{
        opacity: mapEntered && !fadeVisible ? 1 : 0,
        // While walking, tuck the whole rail off the left edge so it's out of
        // the way; it slides back in the moment the player stops.
        transform: isMoving ? "translateX(-110%)" : "translateX(0)",
        pointerEvents: isMoving ? "none" : undefined,
      }}
      className="fixed left-0 top-4 z-120 flex max-h-[calc(100dvh-32px)] flex-col items-start gap-2 overflow-y-auto overflow-x-hidden transition-[opacity,transform] duration-[600ms] ease-out short:top-1 short:gap-1 short:max-h-[calc(100dvh-8px)] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
    >
      {/* Map flap — opens the resizable map window; lit while it's open. */}
      <Flap title="Map" onClick={onOpenMap} active={mapOpen} dim={dim}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.3" strokeLinejoin="round" className={iconCls}>
          <path d="m9 4 6 2 6-2v14l-6 2-6-2-6 2V6z" />
          <path d="M9 4v14M15 6v14" />
        </svg>
      </Flap>

      <Flap title="Home" onClick={onHome} active={homeOn} dim={dim}>
        <Home size={19} strokeWidth={homeOn ? 1.6 : 1.4} color="#ffffff" className={iconCls} />
      </Flap>
      {destCats.map((c) => {
        const Icon = c.icon;
        // Only one rail item is ever active. While the map / event panel is
        // open, it owns the highlight — Home and the categories defer to it.
        const active = !mapOpen && !eventsOpen && c.key === openLabel;
        return (
          <Flap key={c.key} title={c.short} onClick={() => onPickCategory(c.key)} active={active} dim={dim}>
            <Icon size={19} strokeWidth={active ? 1.6 : 1.4} color="#ffffff" className={iconCls} />
          </Flap>
        );
      })}

      {hasEvents && onOpenEvents && (
        <Flap title="Updates" onClick={onOpenEvents} active={!!eventsOpen && !mapOpen} dim={dim}>
          <Bell size={19} strokeWidth={eventsOpen ? 1.7 : 1.4} color="#ffffff" className={iconCls} />
        </Flap>
      )}

      {/* Crowd Flow — placeholder flap (stadium). Intentionally inert for now;
          a different crowd-flow approach will drive it later. */}
      {showCrowd && (
        <Flap title="Crowd Flow (coming soon)" onClick={() => {}} active={false} dim={dim}>
          <Users size={19} strokeWidth={1.4} color="#ffffff" className={iconCls} />
        </Flap>
      )}
    </div>
  );
}

/** One flap tab attached to the left edge: square + borderless on the edge side,
 *  rounded with a border on the right. Geometry is sized per `dim` so the rail
 *  can shrink on short (phone) viewports. The glass/accent fill is clipped to the
 *  shape; the border is an SVG stroke on top so it stays crisp.
 *  `active` = open/selected (blue fill); otherwise the glass panel weight. */
function Flap({
  title, onClick, active = false, dim, children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  dim: { w: number; h: number; r: number };
  children: ReactNode;
}) {
  const { w, h, r } = dim;
  // Fill shape (closed): square left corners, rounded right corners.
  const fillPath =
    `M 0 0 L ${w - r} 0 Q ${w} 0 ${w} ${r} ` +
    `L ${w} ${h - r} Q ${w} ${h} ${w - r} ${h} L 0 ${h} Z`;
  // Border (open): top → right → bottom only, skipping the left (screen) edge.
  const borderPath =
    `M 0 1 L ${w - 1 - r} 1 Q ${w - 1} 1 ${w - 1} ${1 + r} ` +
    `L ${w - 1} ${h - 1 - r} Q ${w - 1} ${h - 1} ${w - 1 - r} ${h - 1} L 0 ${h - 1}`;
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="relative shrink-0 cursor-pointer transition-colors duration-200 ease-out"
      style={{ width: w, height: h }}
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
      {/* Crisp border on top, top→right→bottom only (no border on the edge side). */}
      <svg aria-hidden width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 pointer-events-none">
        <path d={borderPath} fill="none" stroke={active ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.16)"} strokeWidth={1.5} />
      </svg>
      {/* Icon, centred in the flap. */}
      <span className="absolute inset-0 flex items-center justify-center">{children}</span>
    </button>
  );
}
