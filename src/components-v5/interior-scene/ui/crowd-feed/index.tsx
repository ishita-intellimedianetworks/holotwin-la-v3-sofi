"use client";

import { useMemo } from "react";
import { Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import type { CrowdRow } from "@/components-v5/shared/types";
import { CROWD_COLOR } from "@/components-v5/shared/crowd";
import { PanelHeader } from "../destination-sheet/panel-header";
import { NAV_GLASS_PANEL } from "../nav-glass";

interface CrowdFeedProps {
  rows: CrowdRow[];
  visible: boolean;
  onClose: () => void;
}

const RANK = { high: 0, med: 1, low: 2 } as const;

/**
 * CrowdFlow — the live congestion feed (design's Crowd Flow). A non-navmesh list
 * of areas with a congestion dot + status + wait, sorted busiest-first, topped by
 * a "Fastest entry" reroute suggestion derived from the clearest vs busiest gate.
 * Mirrors the Event Day panel's glass shell.
 */
export function CrowdFeed({ rows, visible, onClose }: CrowdFeedProps) {
  const sorted = useMemo(
    () => [...rows].sort((a, b) => RANK[a.level] - RANK[b.level]),
    [rows],
  );

  // Reroute: clearest "Gate …" vs busiest "Gate …".
  const reroute = useMemo(() => {
    const gates = rows.filter((r) => /gate/i.test(r.name));
    if (gates.length < 2) return null;
    const busiest = gates.reduce((a, b) => (RANK[a.level] <= RANK[b.level] ? a : b));
    const clearest = gates.reduce((a, b) => (RANK[a.level] >= RANK[b.level] ? a : b));
    if (busiest.level === clearest.level) return null;
    return { clearest, busiest };
  }, [rows]);

  return (
    <div
      style={NAV_GLASS_PANEL}
      className={cn(
        "fixed left-[88px] top-4 z-[115] flex w-[360px] max-w-[calc(100vw-104px)] flex-col overflow-hidden rounded-[24px] max-h-[calc(100dvh-32px)]",
        "short:left-[54px] short:top-1 short:w-[236px] short:max-w-[calc(100vw-64px)] short:rounded-[14px] short:max-h-[calc(100dvh-8px)] short:origin-top-left short:scale-[0.8]",
        "transition-[opacity,visibility] duration-200 ease-out",
        visible ? "opacity-100" : "pointer-events-none invisible opacity-0",
      )}
    >
      <div className="px-5 pt-6 short:px-4 short:pt-4">
        <PanelHeader title="Crowd Flow" subtitle="Live · congestion routing" onClose={onClose} />
      </div>

      <div className="ui-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-5 pb-5 pt-5 short:px-4 short:pb-4 short:pt-4">
        {reroute && (
          <div
            className="mb-1 flex items-center gap-2.5 rounded-2xl p-3 short:gap-2 short:p-2.5"
            style={{ background: "rgba(0,113,227,0.14)", border: "1px solid rgba(41,151,255,0.5)" }}
          >
            <Zap size={16} color="var(--nav-accent-bright)" strokeWidth={2} className="shrink-0 fill-[var(--nav-accent-bright)]" />
            <div className="min-w-0">
              <div className="nav-display truncate text-[13.5px] font-semibold text-white short:text-[12px]">
                Fastest entry · {reroute.clearest.name}
              </div>
              <div className="nav-body truncate text-[11.5px] font-normal short:text-[10.5px]" style={{ color: "var(--nav-text-dim)" }}>
                Reroute now to skip the {reroute.busiest.name} backup
              </div>
            </div>
          </div>
        )}

        {sorted.map((r) => {
          const color = CROWD_COLOR[r.level];
          return (
            <div
              key={r.name}
              className="flex items-center gap-3 rounded-2xl p-3 short:gap-2.5 short:p-2.5"
              style={{ background: "rgba(255,255,255,0.045)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: color, boxShadow: `0 0 8px ${color}` }}
              />
              <div className="min-w-0 flex-1">
                <div className="nav-display truncate text-[14px] font-semibold short:text-[12.5px]" style={{ color: "var(--nav-text)" }}>
                  {r.name}
                </div>
                <div className="nav-body truncate text-[12px] font-normal short:text-[11px]" style={{ color }}>
                  {r.status}
                </div>
              </div>
              <span className="nav-display shrink-0 text-[14px] font-semibold short:text-[12.5px]" style={{ color }}>
                {r.wait}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
