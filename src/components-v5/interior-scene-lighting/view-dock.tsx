"use client";

/**
 * LightingDock — /lighting-only bottom control: a Day / Dusk / Night segmented glass
 * switch, styled exactly like the app's other segmented controls (SceneToggle /
 * speed control): one NAV_GLASS shell, the active segment filled with the
 * accent colour, inactive segments dimmed text on transparent.
 *
 * Shown in BOTH the dollhouse overview and first person (same options); sits
 * just above the bottom-centre walk/home dock so the two never overlap.
 * Appears only once the load/reveal has FULLY finished (uiEntered — the same
 * signal the venues tab waits on, set after the blur/blackout clears plus the
 * entrance delay), and hides while walking like the other panels.
 */

import { useEffect, useState } from "react";
import { Sun, Sunset, Moon } from "lucide-react";
import { NAV_GLASS } from "../interior-scene/ui/nav-glass";
import { useInteriorInline } from "../interior-scene/inline-context";
import { ENV_MODES } from "./presets";
import { useLightingStore, type LightingMode } from "./view-store";

const SEGMENTS: { key: LightingMode; Icon: typeof Sun }[] = [
  { key: "day", Icon: Sun },
  { key: "dusk", Icon: Sunset },
  { key: "night", Icon: Moon },
];

export default function LightingDock() {
  const { isReady, fadeVisible, phase, uiEntered, isMoving, floors, activeFloorIndex } =
    useInteriorInline();
  const environment = useLightingStore((s) => s.environment);
  const setEnvironment = useLightingStore((s) => s.setEnvironment);
  // Hug the bottom edge — except inside apartment interiors, where the round
  // Home button owns the bottom-centre spot (the dock stays above it there).
  const inInterior = !!floors[activeFloorIndex]?.interior;

  // Same debounce as the overlays' stillUi: no lighting options while
  // WALKING — hide the instant a walk starts, return only after ~300ms of
  // continuous stillness so brief arrival jitter never flashes the dock.
  const [still, setStill] = useState(!isMoving);
  useEffect(() => {
    const t = setTimeout(() => setStill(!isMoving), isMoving ? 0 : 300);
    return () => clearTimeout(t);
  }, [isMoving]);

  // uiEntered flips only after the load + reveal have fully finished and the
  // blur/blackout has cleared (plus the shared entrance delay) — so in the
  // dollhouse the dock appears properly after loading, never over the loader.
  const shown = isReady && uiEntered && phase !== "overlay" && still;

  return (
    <div
      className={
        "fixed left-1/2 z-[119] flex -translate-x-1/2 items-center gap-0.5 rounded-[14px] p-[5px] transition-opacity duration-500 short:rounded-[11px] short:p-[3px] " +
        (inInterior ? "bottom-[84px] short:bottom-[56px]" : "bottom-6 short:bottom-2")
      }
      style={{
        ...NAV_GLASS,
        opacity: shown && !fadeVisible ? 1 : 0,
        pointerEvents: shown ? "auto" : "none",
        userSelect: "none",
      }}
    >
      {SEGMENTS.map(({ key, Icon }) => {
        const active = key === environment;
        return (
          <button
            key={key}
            type="button"
            onClick={() => setEnvironment(key)}
            title={ENV_MODES[key].label}
            className="nav-display flex cursor-pointer items-center gap-1.5 rounded-[10px] px-3.5 py-[6px] text-[13px] leading-tight transition-colors short:rounded-[8px] short:px-2.5 short:py-[4px] short:text-[11px]"
            style={{
              fontWeight: active ? 600 : 500,
              letterSpacing: "0.3px",
              color: active ? "#ffffff" : "var(--nav-text-dim)",
              background: active ? "var(--nav-accent)" : "transparent",
            }}
          >
            <Icon size={14} strokeWidth={2} className="short:h-3 short:w-3" />
            {ENV_MODES[key].label}
          </button>
        );
      })}
    </div>
  );
}
