"use client";

import { Navigation } from "lucide-react";

interface DirectionsButtonProps {
  onClick: () => void;
  /** e.g. "3 min" — appended after the label as "· 3 min walk". */
  etaLabel?: string;
}

/** The solid-blue "Directions" CTA inside the selected card. Starts the walk. */
export function DirectionsButton({ onClick, etaLabel }: DirectionsButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3.5 flex h-[42px] w-full cursor-pointer items-center justify-center gap-2 rounded-full transition-[filter] hover:brightness-110"
      style={{ background: "var(--nav-accent)" }}
    >
      <Navigation size={16} className="fill-white" color="#ffffff" strokeWidth={2} />
      <span className="nav-display text-[14px] font-semibold text-white">Directions</span>
      {etaLabel && <span className="nav-body text-[13px] font-normal text-white/80">· {etaLabel} walk</span>}
    </button>
  );
}
