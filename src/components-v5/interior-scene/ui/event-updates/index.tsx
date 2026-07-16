"use client";

import { useMemo } from "react";
import { Clock, Construction, TriangleAlert, Info, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { EventUpdate, EventUpdateKind } from "@/components-v5/shared/types";
import { PanelHeader } from "../destination-sheet/panel-header";
import { NAV_GLASS_PANEL } from "../nav-glass";

interface EventUpdatesProps {
  events: EventUpdate[];
  visible: boolean;
  onClose: () => void;
}

const KIND_ICON: Record<EventUpdateKind, LucideIcon> = {
  schedule: Clock,
  closure: Construction,
  alert: TriangleAlert,
  info: Info,
};

const SEVERITY_COLOR: Record<NonNullable<EventUpdate["severity"]>, string> = {
  high: "#e8453c",
  medium: "#f5a623",
  low: "#4a9d6e",
};

const SEVERITY_RANK: Record<NonNullable<EventUpdate["severity"]>, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * EventUpdates — the Event Day feed panel. A non-navmesh, chronological list of
 * closures / security alerts / schedule changes / info, sorted most-urgent
 * first. Each item's accent colour comes from its severity; the icon from its
 * kind. Mirrors the destination panel's glass shell + entrance animation.
 */
export function EventUpdates({ events, visible, onClose }: EventUpdatesProps) {
  const sorted = useMemo(
    () =>
      [...events].sort(
        (a, b) =>
          SEVERITY_RANK[a.severity ?? "low"] - SEVERITY_RANK[b.severity ?? "low"],
      ),
    [events],
  );
  const liveCount = events.filter((e) => (e.time ?? "").toLowerCase() === "now").length;

  return (
    <div
      style={NAV_GLASS_PANEL}
      className={cn(
        "fixed left-[88px] top-4 z-[115] flex w-[360px] max-w-[calc(100vw-104px)] flex-col overflow-hidden rounded-[14px] max-h-[calc(100dvh-32px)]",
        "short:left-[54px] short:top-1 short:w-[236px] short:max-w-[calc(100vw-64px)] short:rounded-[10px] short:max-h-[calc(100dvh-8px)] short:origin-top-left short:scale-[0.8]",
        // Opacity-only (no slide) + short duration — see DestinationPanel: animating a
        // backdrop-blur surface over the WebGL canvas re-blurs every frame and janks.
        "transition-[opacity,visibility] duration-200 ease-out",
        visible ? "opacity-100" : "pointer-events-none invisible opacity-0",
      )}
    >
      <div className="px-5 pt-6 short:px-4 short:pt-4">
        <PanelHeader
          title="Event Day"
          subtitle={liveCount > 0 ? `${liveCount} live now · ${events.length} updates` : `${events.length} updates today`}
          onClose={onClose}
        />
      </div>

      <div className="ui-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden px-5 pb-5 pt-5 short:px-4 short:pb-4 short:pt-4">
        {sorted.map((e) => {
          const Icon = KIND_ICON[e.kind];
          const color = SEVERITY_COLOR[e.severity ?? "low"];
          return (
            <div
              key={e.id}
              className="flex items-start gap-3 rounded-2xl p-3 short:gap-2.5 short:p-2.5"
              style={{ background: "rgba(255,255,255,0.045)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl short:h-8 short:w-8"
                style={{ background: `${color}24`, border: `1px solid ${color}55` }}
              >
                <Icon size={17} strokeWidth={2} color={color} className="short:h-[15px] short:w-[15px]" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <span
                    className="nav-display text-[14px] font-semibold leading-snug short:text-[12.5px]"
                    style={{ color: "var(--nav-text)" }}
                  >
                    {e.title}
                  </span>
                  {e.time && (
                    <span
                      className="nav-body shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium short:text-[10px]"
                      style={{ background: `${color}1f`, color, whiteSpace: "nowrap" }}
                    >
                      {e.time}
                    </span>
                  )}
                </div>
                {e.detail && (
                  <p
                    className="nav-body mt-0.5 text-[12.5px] font-normal leading-snug short:text-[11.5px]"
                    style={{ color: "var(--nav-text-dim)" }}
                  >
                    {e.detail}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
