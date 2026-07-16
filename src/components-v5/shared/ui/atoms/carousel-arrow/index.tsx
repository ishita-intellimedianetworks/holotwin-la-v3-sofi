"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const base     = "shrink-0 rounded-full w-[34px] h-[34px] flex items-center justify-center transition-all duration-200";
const enabled  = "ui-glass cursor-pointer text-[var(--ui-text-dim)] hover:text-white";
const disabled = "text-white/20 cursor-default pointer-events-none";

interface CarouselArrowProps {
  direction: "left" | "right";
  onClick:   () => void;
  disabled?: boolean;
}

export function CarouselArrow({ direction, onClick, disabled: isDisabled }: CarouselArrowProps) {
  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={cn(base, isDisabled ? disabled : enabled)}
      aria-label={direction === "left" ? "Previous" : "Next"}
      aria-disabled={isDisabled}
    >
      {direction === "left"
        ? <ChevronLeft  size={15} strokeWidth={2} />
        : <ChevronRight size={15} strokeWidth={2} />}
    </button>
  );
}
