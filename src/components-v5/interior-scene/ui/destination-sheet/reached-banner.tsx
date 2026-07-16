"use client";

import { MapPin } from "lucide-react";

interface ReachedBannerProps {
  /** The place the player is currently standing at. */
  name: string;
  /** Drives the slide/fade in-out (mirrors the panel's `show`). */
  show: boolean;
  /** Tap to dismiss → reopens the label list so another place can be chosen. */
  onDismiss: () => void;
}

/**
 * Top-center "You're currently at {place}" pill shown whenever the player is
 * standing at a destination of ANY category (walk or teleport), independent of whether
 * its label panel is open. Hidden while walking; tapping it opens that
 * category's list to pick another destination.
 *
 * Opacity-only fade (no slide) — animating transform on a backdrop-blur pill
 * over the live canvas re-blurs every frame and janks; `invisible` stops the
 * hidden pill from compositing its blur while dismissed.
 */
export function ReachedBanner({ name, show, onDismiss }: ReachedBannerProps) {
  return (
    <button
      type="button"
      onClick={onDismiss}
      title="Choose another destination"
      className={`fixed left-1/2 top-5 z-[120] flex -translate-x-1/2 cursor-pointer items-center gap-2.5 rounded-full pl-3.5 pr-4 py-2.5 transition-[opacity,visibility] duration-200 ease-out short:top-2.5 short:py-2 ${
        show ? "opacity-100" : "pointer-events-none invisible opacity-0"
      }`}
      style={{
        background: "var(--nav-glass)",
        backdropFilter: "var(--nav-backdrop)",
        WebkitBackdropFilter: "var(--nav-backdrop)",
        border: "1px solid var(--nav-border)",
        boxShadow: "var(--nav-shadow-dock)",
      }}
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
        style={{ background: "rgba(52,199,89,0.18)" }}
      >
        <MapPin size={14} strokeWidth={2.2} color="#34C759" className="fill-[#34C759]/30" />
      </span>
      <span className="nav-body text-[13.5px] font-medium short:text-[12.5px]" style={{ color: "var(--nav-text-dim)" }}>
        You&rsquo;re currently at{" "}
        <span className="nav-display font-semibold" style={{ color: "var(--nav-text)" }}>
          {name}
        </span>
      </span>
    </button>
  );
}
