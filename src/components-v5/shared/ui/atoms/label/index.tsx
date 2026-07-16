"use client";

import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

const variants = {
  heading: "text-[10px] lg:text-[12px] tracking-widest font-semibold uppercase text-[var(--ui-text)]",
  body:    "text-[10px] lg:text-[11px] font-normal text-[var(--ui-text)]",
  dim:     "text-[10px] font-normal text-[var(--ui-text-dim)]",
  accent:  "text-[10px] font-medium text-[var(--ui-accent-cyan)]",
  chip:    "text-[8px] lg:text-[10px] tracking-widest font-semibold uppercase text-[var(--ui-text)]",
} as const;

type Variant = keyof typeof variants;

interface LabelProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

export function Label({ variant = "body", className, children, ...props }: LabelProps) {
  return (
    <span className={cn(variants[variant], className)} {...props}>
      {children}
    </span>
  );
}
