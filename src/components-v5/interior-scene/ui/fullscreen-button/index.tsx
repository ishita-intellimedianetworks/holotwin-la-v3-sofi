"use client";

import { useEffect, useState } from "react";
import { Maximize, Minimize } from "lucide-react";
import { NAV_GLASS } from "../nav-glass";

type FsRoot = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type FsDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

const fsElement = () =>
  document.fullscreenElement ?? (document as FsDoc).webkitFullscreenElement ?? null;

/**
 * FullscreenButton — top-right glass square that puts the DEVICE into
 * fullscreen (document root, not the map window). Shown only on touch
 * devices in landscape — the pose where the browser chrome costs the most
 * vertical space — but stays visible while fullscreen is active so there is
 * always a way back out. Renders nothing where the Fullscreen API is
 * unavailable (e.g. iPhone Safari).
 */
export function FullscreenButton() {
  const [eligible, setEligible] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const root = document.documentElement as FsRoot;
    if (!root.requestFullscreen && !root.webkitRequestFullscreen) return;

    const coarse = window.matchMedia("(pointer: coarse)");
    const landscape = window.matchMedia("(orientation: landscape)");
    const update = () => setEligible(coarse.matches && landscape.matches);
    update();
    coarse.addEventListener("change", update);
    landscape.addEventListener("change", update);

    const onFs = () => setActive(!!fsElement());
    onFs();
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    return () => {
      coarse.removeEventListener("change", update);
      landscape.removeEventListener("change", update);
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs);
    };
  }, []);

  if (!eligible && !active) return null;

  const toggle = () => {
    try {
      if (fsElement()) {
        const doc = document as FsDoc;
        const p = (document.exitFullscreen ?? doc.webkitExitFullscreen)?.call(document);
        (p as Promise<void> | undefined)?.catch?.(() => {});
      } else {
        const root = document.documentElement as FsRoot;
        const p = (root.requestFullscreen ?? root.webkitRequestFullscreen)?.call(root);
        (p as Promise<void> | undefined)?.catch?.(() => {});
      }
    } catch { /* fullscreen may be blocked (permissions / iframe) — ignore */ }
  };

  return (
    <button
      type="button"
      title={active ? "Exit full screen" : "Full screen"}
      onClick={toggle}
      className="fixed top-6 right-6 z-[220] flex h-[42px] w-[42px] cursor-pointer items-center justify-center rounded-[14px] transition-[filter] hover:brightness-110 short:top-2 short:right-2 short:h-9 short:w-9 short:rounded-[11px]"
      style={NAV_GLASS}
    >
      {active ? (
        <Minimize size={18} strokeWidth={2} color="var(--nav-text)" />
      ) : (
        <Maximize size={18} strokeWidth={2} color="var(--nav-text)" />
      )}
    </button>
  );
}
