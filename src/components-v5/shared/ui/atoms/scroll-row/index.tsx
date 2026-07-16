"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface ScrollRowProps {
  className?: string;
  children:   ReactNode;
}

export const ScrollRow = forwardRef<HTMLDivElement, ScrollRowProps>(
  function ScrollRow({ className, children }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          "flex gap-2 lg:gap-2.5 overflow-x-auto snap-x snap-mandatory ui-scrollbar",
          className,
        )}
      >
        {children}
      </div>
    );
  },
);
ScrollRow.displayName = "ScrollRow";
