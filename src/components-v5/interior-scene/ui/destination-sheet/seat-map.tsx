"use client";

import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import type { Destination } from "@/components-v5/shared/types";
import { PanelHeader } from "./panel-header";
import { NAV_GLASS_PANEL } from "../nav-glass";
import { useNavUiStore } from "../../store/nav-ui-store";

interface SeatMapProps {
  /** The seat-view destinations (one per bowl section). */
  dests: Destination[];
  visible: boolean;
  onClose: () => void;
  /** Take the seat — blackout + sit at the section's exact pose (no walking). */
  onTeleport: (dest: Destination) => void;
}

// SVG canvas. Wider than tall to match the bowl footprint (X span ≫ Z span).
const VB_W = 340;
const VB_H = 224;
const PAD = 30;
const DOT_R = 11;

/**
 * SeatMap — a theatre-style picker for the stadium's seat-view destinations. Instead of
 * a scrolling list, the sections are plotted as a top-down bowl (positioned by
 * their real world XZ) around a central field. Tapping a section is a pure
 * "view simulation": it teleports (blackout → sit) straight to that seat — there
 * is no walking route / directions, by design.
 */
export function SeatMap({ dests, visible, onClose, onTeleport }: SeatMapProps) {
  const currentId = useNavUiStore((s) => s.currentDest?.id ?? null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const layout = useMemo(() => {
    const pts = dests.flatMap((p) => (p.camera ? [{ dest: p, x: p.camera.position[0], z: p.camera.position[2] }] : []));
    if (pts.length === 0) return null;
    const xs = pts.map((p) => p.x);
    const zs = pts.map((p) => p.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const spanX = Math.max(1, maxX - minX);
    const spanZ = Math.max(1, maxZ - minZ);
    const innerW = VB_W - 2 * PAD;
    const innerH = VB_H - 2 * PAD;
    const map = (x: number, z: number) => ({
      px: PAD + ((x - minX) / spanX) * innerW,
      py: PAD + ((z - minZ) / spanZ) * innerH,
    });
    const seats = pts.map((p) => ({ dest: p.dest, ...map(p.x, p.z) }));
    const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const cz = zs.reduce((a, b) => a + b, 0) / zs.length;
    const field = map(cx, cz);
    return { seats, field, innerW, innerH };
  }, [dests]);

  const focusPoi =
    dests.find((p) => p.id === (hoverId ?? currentId)) ?? null;

  return (
    <div
      style={NAV_GLASS_PANEL}
      className={cn(
        "fixed left-[88px] top-4 z-[115] flex w-[380px] max-w-[calc(100vw-104px)] flex-col overflow-hidden rounded-[24px] max-h-[calc(100dvh-32px)]",
        "short:left-[54px] short:top-1 short:w-[260px] short:max-w-[calc(100vw-64px)] short:rounded-[14px] short:max-h-[calc(100dvh-8px)] short:origin-top-left short:scale-[0.8]",
        // Opacity-only (no slide) + short duration — see DestinationPanel: animating a
        // backdrop-blur surface over the WebGL canvas re-blurs every frame and janks.
        "transition-[opacity,visibility] duration-200 ease-out",
        visible ? "opacity-100" : "pointer-events-none invisible opacity-0",
      )}
    >
      <div className="animate-in fade-in-0 duration-300 px-5 pt-6 short:px-4 short:pt-4">
        <PanelHeader
          title="Seat Views"
          subtitle={
            focusPoi
              ? `${focusPoi.label} · tap to take your seat`
              : "Tap a section to preview the view"
          }
          onClose={onClose}
        />
      </div>

      <div className="animate-in fade-in-0 duration-300 px-5 pb-5 pt-5 short:px-4 short:pb-4 short:pt-4">
        {layout && (
          <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full select-none" role="img" aria-label="Stadium seating map">
            {/* Field */}
            <ellipse
              cx={layout.field.px}
              cy={layout.field.py}
              rx={layout.innerW * 0.27}
              ry={layout.innerH * 0.36}
              fill="rgba(64,150,96,0.22)"
              stroke="rgba(120,200,150,0.5)"
              strokeWidth={1.2}
            />
            <text
              x={layout.field.px}
              y={layout.field.py}
              textAnchor="middle"
              dominantBaseline="middle"
              className="nav-display"
              style={{ fontSize: 11, letterSpacing: 1.5, fill: "rgba(180,225,195,0.85)", fontWeight: 600 }}
            >
              FIELD
            </text>

            {/* Sections */}
            {layout.seats.map((s) => {
              const active = s.dest.id === currentId;
              const hovered = s.dest.id === hoverId;
              const fill = active
                ? "var(--nav-accent)"
                : hovered
                  ? "rgba(38,132,255,0.45)"
                  : "rgba(255,255,255,0.10)";
              const stroke = active || hovered ? "var(--nav-accent)" : "rgba(255,255,255,0.28)";
              return (
                <g
                  key={s.dest.id}
                  transform={`translate(${s.px} ${s.py})`}
                  onClick={() => onTeleport(s.dest)}
                  onMouseEnter={() => setHoverId(s.dest.id)}
                  onMouseLeave={() => setHoverId((h) => (h === s.dest.id ? null : h))}
                  style={{ cursor: "pointer" }}
                >
                  <circle
                    r={DOT_R}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={active || hovered ? 2 : 1.2}
                    style={{ transition: "fill 120ms, stroke 120ms" }}
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="nav-display"
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      fill: active || hovered ? "#fff" : "var(--nav-text-2)",
                      pointerEvents: "none",
                    }}
                  >
                    {s.dest.section ?? ""}
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        <p
          className="nav-body mt-1 px-2 text-center text-[12px] short:text-[11px]"
          style={{ color: "var(--nav-text-dim)" }}
        >
          {currentId ? "You're seated — tap another section to move." : "Lower-bowl sections · field view"}
        </p>
      </div>
    </div>
  );
}
