"use client";

/**
 * InfoOverlay — the panel UI for the three INFORMATIONAL demo categories
 * (Crowd Flow, Event Updates, Infra · IT & Security). Unlike the place-list
 * categories (Layouts / Seat View / Accessibility / Nearby Services) these don't
 * do wayfinding/directions — they present read-only status cards grouped by
 * sub-category chips (Destination.option). Tapping a card teleports the camera to that
 * spot so the area can be inspected.
 *
 * Shell, spacing and animation are kept IDENTICAL to DestinationPanel so every overlay
 * reads as the same component; only the accent + card treatment vary by
 * `variant`, per the demo spec (category-level UI divergence).
 */

import { useMemo } from "react";
import type { RefObject } from "react";

import { cn } from "@/lib/utils";
import { Ban, CalendarClock, DoorClosed, Megaphone, ShieldAlert, Trophy, type LucideIcon } from "lucide-react";
import type { Destination, DestinationCategory, DestinationsByCategory } from "@/components-v5/shared/types";
import type { PlayerControllerHandle } from "../../scene-content/components/player-controller";
import { CATEGORY_BY_KEY } from "./category-meta";
import { CROWD_DOT } from "./destination-card";
import { PanelHeader } from "./panel-header";
import type { Segment } from "./segment-row";
import { SubcategoryRail } from "./subcategory-rail";
import { NAV_GLASS_PANEL } from "../nav-glass";
import { useNavUiStore } from "../../store/nav-ui-store";

export type InfoVariant = "crowd" | "event" | "infra";

interface InfoOverlayProps {
  ctrlRef: RefObject<PlayerControllerHandle | null>;
  dests: DestinationsByCategory;
  category: DestinationCategory;
  visible: boolean;
  onClose: () => void;
  onTeleport: (dest: Destination) => void;
  variant: InfoVariant;
}

const VARIANT_META: Record<InfoVariant, { tag: string; accent: string; empty: string }> = {
  crowd: { tag: "live guidance", accent: "#ffd60a", empty: "No crowd data for this venue yet." },
  event: { tag: "event day",     accent: "#FF453A", empty: "No event-day updates posted." },
  infra: { tag: "command view",  accent: "#0A84FF", empty: "No infrastructure points configured." },
};

// Crowd tier colours come from the ONE shared palette (CROWD_DOT in
// destination-card) — the map pins, legend chips, option-list dots and this
// overlay must all show the SAME yellow/red/green for the same tier. A local
// copy here once used amber (#FF9F0A) for "med" while everything else used
// #ffd60a — two different yellows on screen at once.

/** Event-update TYPE (Destination.option) → icon + colour, so each notice reads at a
 *  glance instead of every card carrying the same red dot. First keyword match
 *  wins; falls back to a megaphone in the variant accent. */
const UPDATE_KINDS: [RegExp, { icon: LucideIcon; color: string }][] = [
  [/clos/i,               { icon: DoorClosed,    color: "#ffd60a" }],
  [/security|checkpoint/i,{ icon: ShieldAlert,   color: "#2997FF" }],
  [/schedule|time/i,      { icon: CalendarClock, color: "#BF5AF2" }],
  [/restrict/i,           { icon: Ban,           color: "#FF453A" }],
  [/event|session|ceremon|medal/i, { icon: Trophy, color: "#30D158" }],
];

function updateKind(option: string | undefined, fallback: string): { icon: LucideIcon; color: string } {
  for (const [re, kind] of UPDATE_KINDS) if (option && re.test(option)) return kind;
  return { icon: Megaphone, color: fallback };
}

/** Event Updates are always "today's" notices: the panel header carries the
 *  CURRENT date and each notice a posted-at time. The time is pseudo-random —
 *  hashed from the notice id so it's stable across re-renders (no shuffling)
 *  but reads like a live feed. Range 08:00–19:59. */
function postedAtTime(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const mins = 8 * 60 + (Math.abs(h) % (12 * 60));
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;
}

export function InfoOverlay({ dests, category, visible, onClose, onTeleport, variant }: InfoOverlayProps) {
  const meta = CATEGORY_BY_KEY[category];
  const list = useMemo(() => dests[category] ?? [], [dests, category]);
  const v = VARIANT_META[variant];

  // Sub-category chips — one per distinct Destination.option, in first-seen order.
  // flatOptions categories (Event Updates) skip the chips entirely: everything
  // shows in ONE list, notice-board style, with the option as a type chip.
  const flat = !!meta.flatOptions;
  // Authored = has a camera pose or a hotspot from the venue GLBs. Sub-category
  // chips derive from ALL entries (a data-less sub-category keeps its chip) but
  // only authored entries show as cards — the rest read the variant empty text.
  const authored = (p: Destination) => !!(p.camera || p.hotspots?.length || p.hotspot);
  const segments = useMemo<Segment[]>(() => {
    if (flat) return [];
    const opts = Array.from(new Set(list.map((p) => p.option).filter(Boolean) as string[]));
    return opts.map((o) => ({ id: o, label: o, count: list.filter((p) => p.option === o && authored(p)).length }));
  }, [flat, list]);

  // Sub-category — remembered per category in the shared nav store (same
  // memory as the panel/map), so reopening lands on the same chip.
  const optionByCat = useNavUiStore((s) => s.optionByCat);
  const setOptionForCat = useNavUiStore((s) => s.setOptionForCat);
  // Crowd variant: the heatmap zones (published by the 3D CrowdFlowMesh) —
  // named by venue side and paired with gate advice below.
  const crowdZones = useNavUiStore((s) => s.crowdFlowZones);
  const storedOpt = optionByCat[category];
  const activeOpt =
    (storedOpt && segments.some((s) => s.id === storedOpt) ? storedOpt : segments[0]?.id) ?? "";
  const setActiveOption = (id: string) => setOptionForCat(category, id);
  const rows = flat ? list : list.filter((p) => (p.option ?? "") === activeOpt && authored(p));

  return (
    <div
      style={NAV_GLASS_PANEL}
      className={cn(
        "fixed left-[88px] top-4 z-[115] flex w-[360px] max-w-[calc(100vw-104px)] flex-col overflow-hidden rounded-[14px] max-h-[80dvh]",
        "short:left-[54px] short:top-1 short:w-[236px] short:max-w-[calc(100vw-64px)] short:rounded-[10px] short:max-h-[100dvh] short:origin-top-left short:scale-[0.8]",
        "transition-[opacity,visibility] duration-200 ease-out",
        visible ? "opacity-100" : "pointer-events-none invisible opacity-0",
      )}
    >
      {/* Header zone — same spacing as the place panels. */}
      <div className="animate-in fade-in-0 duration-300 px-5 pt-6 short:px-4 short:pt-4">
        <PanelHeader
          title={meta.label}
          subtitle={
            variant === "event"
              ? `${list.length} ${meta.unit} · ${new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`
              : `${list.length} ${meta.unit} · ${v.tag}`
          }
          onClose={onClose}
        />

        {segments.length > 1 && (
          <div className="mt-3.5 short:mt-2">
            <SubcategoryRail segments={segments} active={activeOpt} onSelect={setActiveOption} />
          </div>
        )}

        {/* Crowd Flow: which SIDE of the venue is how busy (mirrors the 3D
            heatmap + map overlay colours) and which gates to pick or skip. */}
        {variant === "crowd" && crowdZones.length > 0 && (() => {
          const mx = crowdZones.reduce((s, z) => s + z.center[0], 0) / crowdZones.length;
          const mz = crowdZones.reduce((s, z) => s + z.center[1], 0) / crowdZones.length;
          const sideName = (z: (typeof crowdZones)[number]) =>
            `${z.center[1] >= mz ? "South" : "North"}-${z.center[0] >= mx ? "East" : "West"}`;
          const TIER: Record<string, { label: string; color: string }> = {
            high: { label: "Heavy crowds",  color: CROWD_DOT.high },
            med:  { label: "Moderate flow", color: CROWD_DOT.med },
            low:  { label: "Clear",         color: CROWD_DOT.low },
          };
          const order = { high: 0, med: 1, low: 2 } as Record<string, number>;
          const sorted = [...crowdZones].sort((a, b) => order[a.level] - order[b.level]);
          const avoid = list.filter((d) => d.crowd === "high").map((d) => d.label);
          const prefer = list.filter((d) => d.crowd === "low").map((d) => d.label);
          return (
            <div
              className="mt-3 flex flex-col gap-1.5 rounded-[10px] p-3 short:mt-2 short:gap-1 short:p-2.5"
              style={{ background: "rgba(255,255,255,0.05)" }}
            >
              {sorted.map((z, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="h-[8px] w-[8px] shrink-0 rounded-[2px]"
                    style={{ background: TIER[z.level].color, boxShadow: `0 0 6px ${TIER[z.level].color}` }}
                  />
                  <span className="nav-body text-[12px] font-medium leading-snug short:text-[11px]" style={{ color: "var(--nav-text-2)" }}>
                    {sideName(z)} side — {TIER[z.level].label}
                  </span>
                </div>
              ))}
              {(prefer.length > 0 || avoid.length > 0) && (
                <p className="nav-body pt-1 text-[12px] font-normal leading-snug short:text-[11px]" style={{ color: "var(--nav-text-dim)" }}>
                  {prefer.length > 0 && <>Choose <span style={{ color: "var(--nav-text)" }}>{prefer.join(", ")}</span></>}
                  {prefer.length > 0 && avoid.length > 0 && " · "}
                  {avoid.length > 0 && <>avoid <span style={{ color: "var(--nav-text)" }}>{avoid.join(", ")}</span></>}
                </p>
              )}
            </div>
          );
        })()}
      </div>

      {/* Body — scrollable status cards, same padding as the place list. */}
      <div className="ui-scrollbar animate-in fade-in-0 duration-300 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden px-5 pb-5 pt-5 short:px-4 short:pb-4 short:pt-4">
        {rows.length === 0 && (
          <p className="nav-body py-6 text-center text-[13px]" style={{ color: "var(--nav-text-dim)" }}>
            {v.empty}
          </p>
        )}
        {variant === "event"
          ? rows.map((dest) => {
              // Notice-board card: a type-coloured icon tile + a neutral
              // uppercase eyebrow (TYPE · time tag), title, then the detail.
              // Colour lives ONLY in the icon tile — text stays neutral.
              const kind = updateKind(dest.option, v.accent);
              const KindIcon = kind.icon;
              // Always today's feed: type · "Today HH:MM". Scheduled entries
              // (Today's Events) author their time as a HH:MM tag; notices
              // without one get a stable posted-at time hashed from their id.
              const when = dest.tags?.find((t) => /^\d{1,2}:\d{2}$/.test(t)) ?? postedAtTime(dest.id);
              const eyebrow = [dest.option, `Today ${when}`].filter(Boolean).join(" · ");
              return (
                <button
                  key={dest.id}
                  type="button"
                  onClick={() => onTeleport(dest)}
                  title={`Go to ${dest.label}`}
                  className="nav-display flex w-full cursor-pointer items-start gap-3 rounded-[12px] p-3 text-left transition-colors hover:bg-white/[0.08] short:p-2.5"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                >
                  <span
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] short:h-[28px] short:w-[28px]"
                    style={{ background: `${kind.color}24` }}
                  >
                    <KindIcon size={17} strokeWidth={2} color={kind.color} className="short:h-[14px] short:w-[14px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    {eyebrow && (
                      <span className="nav-body block text-[10px] font-semibold uppercase tracking-[0.08em] short:text-[9px]" style={{ color: "var(--nav-text-dim)" }}>
                        {eyebrow}
                      </span>
                    )}
                    <span className="mt-0.5 block text-[14px] font-semibold leading-tight short:text-[12.5px]" style={{ color: "var(--nav-text)" }}>
                      {dest.label}
                    </span>
                    {dest.note && (
                      <span className="nav-body mt-1 block text-[12px] font-normal leading-snug short:text-[11px]" style={{ color: "var(--nav-text-2)" }}>
                        {dest.note}
                      </span>
                    )}
                  </span>
                </button>
              );
            })
          : rows.map((dest) => {
              const dot = (dest.crowd && CROWD_DOT[dest.crowd]) || "#AEB8C6";
              const detail = dest.crowdNote ?? dest.note;
              return (
                <button
                  key={dest.id}
                  type="button"
                  onClick={() => onTeleport(dest)}
                  title={`Go to ${dest.label}`}
                  className="nav-display flex w-full cursor-pointer items-start gap-3 rounded-[12px] p-3 text-left transition-colors hover:bg-white/[0.08] short:p-2.5"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                >
                  <span
                    aria-hidden
                    className="mt-[3px] h-[9px] w-[9px] shrink-0 rounded-full"
                    style={{ background: dot, boxShadow: `0 0 8px ${dot}` }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold leading-tight short:text-[12.5px]" style={{ color: "var(--nav-text)" }}>
                      {dest.label}
                    </span>
                    {detail && (
                      <span className="nav-body mt-0.5 block text-[12px] font-normal leading-snug short:text-[11px]" style={{ color: "var(--nav-text-2)" }}>
                        {detail}
                      </span>
                    )}
                    {dest.tags && dest.tags.length > 0 && (
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {dest.tags.map((t) => (
                          <span
                            key={t}
                            className="nav-body rounded-full px-2 py-[2px] text-[10.5px] font-medium"
                            style={{ color: "var(--nav-text-2)", background: "rgba(255,255,255,0.08)" }}
                          >
                            {t}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
      </div>
    </div>
  );
}
