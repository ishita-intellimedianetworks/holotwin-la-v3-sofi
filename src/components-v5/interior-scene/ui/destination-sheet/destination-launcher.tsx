"use client";

import type { DestinationCategory } from "@/components-v5/shared/types";
import { DEST_CATEGORIES, type CategoryMeta } from "./category-meta";

interface DestinationLauncherProps {
  /** Categories that actually have entries on the active floor. */
  categories?: CategoryMeta[];
  /** Currently open category, or null when the panel is closed. */
  activeKey: DestinationCategory | null;
  onPick: (key: DestinationCategory) => void;
}

/**
 * The category controls inside the bottom dock. Each label is a 46px icon
 * button; the open label expands into a solid-blue pill with its short name
 * (design's active-state dock item). Meant to sit inside the glass dock shell
 * rendered by InteriorOverlays.
 */
export function DestinationLauncher({ categories = DEST_CATEGORIES, activeKey, onPick }: DestinationLauncherProps) {
  return (
    <>
      {categories.map((c) => {
        const Icon = c.icon;
        const active = c.key === activeKey;
        if (active) {
          return (
            <button
              key={c.key}
              type="button"
              title={c.short}
              onClick={() => onPick(c.key)}
              className="flex h-[46px] cursor-pointer items-center gap-2.5 rounded-[14px] pl-3.5 pr-[18px] short:h-[38px] short:gap-2 short:pl-2.5 short:pr-3.5"
              style={{ background: "var(--nav-accent)" }}
            >
              <Icon size={21} strokeWidth={1.9} color="#ffffff" className="short:!h-[18px] short:!w-[18px]" />
              <span className="nav-display text-[14px] font-semibold text-white short:text-[12px]">{c.short}</span>
            </button>
          );
        }
        return (
          <button
            key={c.key}
            type="button"
            title={c.short}
            onClick={() => onPick(c.key)}
            className="flex h-[46px] w-[46px] cursor-pointer items-center justify-center rounded-[14px] transition-colors hover:bg-white/[0.06] short:h-[38px] short:w-[38px]"
          >
            <Icon size={21} strokeWidth={1.7} color="var(--nav-text-dim)" className="short:!h-[18px] short:!w-[18px]" />
          </button>
        );
      })}
    </>
  );
}
