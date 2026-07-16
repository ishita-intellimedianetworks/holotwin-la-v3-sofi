"use client";

import { cn } from "@/lib/utils";

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px bg-[var(--ui-border)] w-full", className)} />;
}
