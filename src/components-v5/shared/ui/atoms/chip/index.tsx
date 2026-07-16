"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const variants = {
  cyan:    "bg-cyan-400/10 border-cyan-400/30 text-cyan-400/80",
  slate:   "bg-white/[0.05] border-white/20 text-white/50",
  default: "bg-white/[0.08] border-white/15 text-white/70",
} as const;

interface ChipProps {
  variant?:  keyof typeof variants;
  className?: string;
  children:  ReactNode;
}

export function Chip({ variant = "default", className, children }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border",
        "text-[8px] tracking-widest font-semibold uppercase",
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
