"use client";

import { Button } from "@/components-v5/shared/ui/button";
import type { ReactNode } from "react";

interface GlassBtnProps {
  onClick: () => void;
  title?:  string;
  children: ReactNode;
}

export function GlassBtn({ onClick, title, children }: GlassBtnProps) {
  return (
    <Button
      size="icon"
      variant="secondary"
      onClick={onClick}
      title={title}
      className="ui-glass ui-icon-btn"
    >
      {children}
    </Button>
  );
}
