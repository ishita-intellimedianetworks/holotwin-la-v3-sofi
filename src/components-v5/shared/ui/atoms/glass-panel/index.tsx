"use client";

import { cn } from "@/lib/utils";
import type { ElementType, HTMLAttributes } from "react";

interface GlassPanelProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
}

export function GlassPanel({ as: Tag = "div", className, children, ...props }: GlassPanelProps) {
  return (
    // @ts-expect-error — polymorphic `as` prop; spread is safe
    <Tag className={cn("ui-glass border border-[var(--ui-border)]", className)} {...props}>
      {children}
    </Tag>
  );
}
