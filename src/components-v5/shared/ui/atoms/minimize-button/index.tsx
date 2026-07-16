"use client";

import { Button } from "@/components-v5/shared/ui/button";
import type { ReactNode } from "react";

/**
 * SlideTab
 * ─────────────────────────────────────────────────────────────────────────────
 * A shared glass pill that sits flush against a panel edge and acts as a
 * collapse / expand toggle.
 *
 * Modes
 *   • children not provided → shows a chevron arrow (minimap style)
 *   • children provided     → renders them instead (room-disc "LAYOUTS" style)
 *
 * Side
 *   • "right"  – attaches to the right edge of its panel (border-left none)
 *   • "left"   – attaches to the left edge  (border-right none)   [default]
 */

interface SlideTabProps {
  expanded:  boolean;
  onToggle:  () => void;
  /** Which panel-edge this tab is glued to */
  side?:     "left" | "right";
  /** Override width (default 20 for arrow, 28 for label) */
  width?:    number;
  /** Override height (default 48) */
  height?:   number;
  title?:    string;
  children?: ReactNode;
}

export function MinimizeButton({
  expanded,
  onToggle,
  side    = "left",
  width,
  height  = 48,
  title,
  children,
}: SlideTabProps) {
  const hasLabel = Boolean(children);
  const w = width ?? (hasLabel ? 28 : 20);

  // side="left"  → panel hides to the LEFT  (minimap)
  //   tab sits on RIGHT of panel: rounded-right corners, no left-border
  //   arrow: collapsed=0° (<), expanded=180° (>)
  //
  // side="right" → panel hides to the RIGHT (room-disc)
  //   tab sits on LEFT of panel: rounded-left corners, no right-border
  //   arrow: collapsed=180° (>), expanded=0° (<)

  const borderRadius =
    side === "right"
      ? "8px 0 0 8px"   // rounded-left, flat right (against screen edge)
      : "0 8px 8px 0";  // flat left (against panel), rounded-right

  const borderEdge =
    side === "left"
      ? { borderRight: "none" as const }
      : { borderLeft:  "none" as const };

  const arrowDeg =
    side === "left"
      ? (expanded ? 0   : 180)   // collapsed→right(>), expanded→left(<)
      : (expanded ? 180 : 0);    // collapsed→left(<),  expanded→right(>)

  return (
    <Button
      onClick={onToggle}
      title={title}
      variant="ghost"
      className="ui-glass shrink-0 flex items-center justify-center cursor-pointer text-white/60 hover:text-white transition-all duration-300"
      style={{
        alignSelf:    "center",
        width:        w,
        height:       height,
        borderRadius: borderRadius,
        ...borderEdge,
      }}
    >
      {hasLabel ? (
        /* Label mode — stacked letters or any children */
        <div
          style={{
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            justifyContent: "center",
            gap:            1,
          }}
        >
          {children}
        </div>
      ) : (
        /* Arrow mode — same chevron the minimap always used */
        <svg
          width="8"
          height="14"
          viewBox="0 0 8 14"
          fill="none"
          style={{
            transform:  `rotate(${arrowDeg}deg)`,
            transition: "transform 0.4s",
          }}
        >
          <path
            d="M6 1L1 7l5 6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </Button>
  );
}
