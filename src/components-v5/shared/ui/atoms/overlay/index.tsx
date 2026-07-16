"use client";

import { cn } from "@/lib/utils";

interface OverlayProps {
  onClick?:  () => void;
  className?: string;
  opacity?:  number;
  zIndex?:   number;
}

export function Overlay({ onClick, className, opacity = 30, zIndex }: OverlayProps) {
  return (
    <div
      aria-hidden
      onClick={onClick}
      className={cn("fixed inset-0", className)}
      style={{
        background: `rgba(0,0,0,${opacity / 100})`,
        ...(zIndex !== undefined ? { zIndex } : {}),
      }}
    />
  );
}
