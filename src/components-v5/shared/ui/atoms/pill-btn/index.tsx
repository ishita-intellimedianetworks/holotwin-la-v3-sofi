"use client";

import { cn } from "@/lib/utils";
import type { CSSProperties, ReactNode } from "react";

interface PillBtnProps {
  active?:   boolean;
  onClick:   () => void;
  children:  ReactNode;
  className?: string;
  /**
   * Set when the pill is rendered INSIDE an already-blurred glass surface (e.g.
   * the site panel header or the minimap card). It drops the pill's own
   * `backdrop-filter` so it doesn't re-blur the panel behind it (the muddy
   * "double blur" stacking) — using a flat translucent tint + border instead.
   */
  flat?: boolean;
  /**
   * Inline style escape hatch. Needed because `.ui-label` / `.ui-glass-flat` are
   * unlayered CSS that Tailwind utilities can't override — callers pass inline
   * `letterSpacing` / `boxShadow` here to win the cascade (e.g. tightening the
   * uppercase tracking on narrow pills, or dropping the inset bevel so active &
   * inactive pills read the exact same height).
   */
  style?: CSSProperties;
}

export function PillBtn({ active, onClick, children, className, flat, style }: PillBtnProps) {
  return (
    <button
      onClick={onClick}
      style={style}
      className={cn(
        // Transparent border on the base so active/inactive pills keep the same
        // box size; the flat variant colours it in for a visible edge.
        "ui-label h-auto px-3 py-2 rounded-full cursor-pointer transition-colors border border-transparent",
        active
          ? "bg-white text-black font-semibold"
          : flat
            ? "ui-glass-flat border-[var(--ui-glass-border)] text-[var(--ui-text-dim)] font-normal hover:text-white"
            : "ui-glass text-[var(--ui-text-dim)] font-normal hover:text-white",
        className,
      )}
    >
      {children}
    </button>
  );
}
