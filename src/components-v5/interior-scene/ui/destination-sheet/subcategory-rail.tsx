"use client";

/**
 * SubcategoryRail — dropdown selector for the `segmentBy: "option"` categories
 * (memorial / stadium), where there can be many sub-categories (Layouts has 10).
 * Collapses to a single control showing the active sub-category (icon + label +
 * count); tapping opens the full list. Far more compact than a wrapping pill row.
 *
 * The open menu is PORTALED to <body> at a fixed position anchored to the
 * control, so the panel's `overflow-hidden` never clips it on short lists.
 *
 * Village categories (Dining "kind" / Practice "sport") keep SegmentRow.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { iconKeyFor, type IconKey } from "@/components-v5/shared/icon-rules";
import {
  DoorOpen, Eye, LayoutGrid, Trees, Utensils, Store, BusFront, SquareParking,
  Accessibility, Info, HelpCircle, ShieldAlert, Cctv, Wifi, KeyRound, Route,
  Star, Cross, LogOut, MapPin, ChevronDown, Check, type LucideIcon,
} from "lucide-react";

export interface SubcatSegment {
  id: string;
  label: string;
  /** Optional count badge (destinations under this sub-category). */
  count?: number;
}

interface SubcategoryRailProps {
  segments: SubcatSegment[];
  active: string;
  onSelect: (id: string) => void;
}

/** Sub-category label → the lucide glyph for it.
 *
 *  THE KEYWORD RULES LIVE IN `shared/icon-rules.ts` now, keyed by a string
 *  rather than a component, so the VR panels pick the same glyph for the same
 *  label out of `@react-three/uikit-lucide`. What stays here is the React-DOM
 *  icon set those keys map to. */
const KEY_GLYPH: Record<IconKey, LucideIcon> = {
  "door-open": DoorOpen,
  "log-out": LogOut,
  eye: Eye,
  "layout-grid": LayoutGrid,
  trees: Trees,
  utensils: Utensils,
  store: Store,
  "bus-front": BusFront,
  "square-parking": SquareParking,
  accessibility: Accessibility,
  cross: Cross,
  info: Info,
  help: HelpCircle,
  "shield-alert": ShieldAlert,
  cctv: Cctv,
  wifi: Wifi,
  "key-round": KeyRound,
  route: Route,
  star: Star,
  "map-pin": MapPin,
};

export function iconFor(label: string): LucideIcon {
  return KEY_GLYPH[iconKeyFor(label)];
}

export function SubcategoryRail({ segments, active, onSelect }: SubcategoryRailProps) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Anchor the portaled menu to the control, in viewport (fixed) coordinates.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setRect({ left: r.left, top: r.bottom + 6, width: r.width });
  }, [open]);

  // Close on outside click (button + portaled menu are both "inside") or resize.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener("pointerdown", onDoc);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const current = segments.find((s) => s.id === active) ?? segments[0];
  if (!current) return null;
  const CurrentIcon = iconFor(current.label);

  return (
    <>
      {/* Collapsed control — solid accent fill like the Village SegmentRow's
          active tab (same height rhythm and radius); icon/label/chevron all
          white on blue. */}
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="nav-display flex w-full cursor-pointer items-center gap-2.5 rounded-[13px] px-3.5 py-[13px] transition-opacity hover:opacity-90 short:gap-2 short:px-3 short:py-2"
        style={{ background: "var(--nav-accent)" }}
      >
        <CurrentIcon size={15} strokeWidth={2.2} color="#ffffff" className="shrink-0 short:h-[13px] short:w-[13px]" />
        <span className="min-w-0 flex-1 truncate text-left text-[13.5px] font-semibold short:text-[12px]" style={{ color: "#ffffff" }}>
          {current.label}
        </span>
        <ChevronDown
          size={16}
          strokeWidth={2.2}
          color="rgba(255,255,255,0.85)"
          className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""} short:h-[14px] short:w-[14px]`}
        />
      </button>

      {/* Menu — portaled to <body> so the panel's overflow-hidden can't clip it. */}
      {open && rect && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            className="ui-scrollbar fixed z-[200] flex max-h-[288px] flex-col gap-[3px] overflow-y-auto rounded-[13px] p-[4px] short:max-h-[220px]"
            style={{
              left: rect.left,
              top: rect.top,
              width: rect.width,
              // Fully OPAQUE — backdrop blur is unreliable over the WebGL
              // canvas (see .ui-glass in globals.css), so any alpha lets the
              // scene bleed through the menu.
              background: "rgb(24,28,35)",
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "0 14px 34px rgba(0,0,0,0.5)",
            }}
          >
            {segments.map((s) => {
              const on = s.id === active;
              const Icon = iconFor(s.label);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { onSelect(s.id); setOpen(false); }}
                  className="nav-display flex w-full shrink-0 cursor-pointer items-center gap-2.5 rounded-[10px] px-3 py-[9px] text-left transition-colors hover:bg-white/[0.06] short:gap-2 short:px-2.5 short:py-1.5"
                  // Active row matches the Village SegmentRow: solid accent
                  // fill + white icon/label/check.
                  style={on ? { background: "var(--nav-accent)" } : undefined}
                >
                  <Icon size={15} strokeWidth={2.2} color={on ? "#ffffff" : "var(--nav-text-2)"} className="shrink-0 short:h-[13px] short:w-[13px]" />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] short:text-[12px]" style={{ fontWeight: on ? 600 : 500, color: on ? "#ffffff" : "#AEB8C6" }}>
                    {s.label}
                  </span>
                  {on && <Check size={15} strokeWidth={2.5} color="#ffffff" className="shrink-0 short:h-[13px] short:w-[13px]" />}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
