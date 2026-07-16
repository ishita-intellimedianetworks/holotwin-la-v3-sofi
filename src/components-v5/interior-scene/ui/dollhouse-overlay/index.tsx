"use client";

import { RotateCcw, MousePointerClick } from "lucide-react";
import { InstructionsOverlay } from "@/components-v5/shared/ui/molecules/instructions-overlay";

interface DollhouseOverlayProps {
  visible: boolean;
  onEnter: () => void;
}

const ICON_CLASS =
  "text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.55)]";

export function DollhouseOverlay({ visible, onEnter }: DollhouseOverlayProps) {
  return (
    <InstructionsOverlay
      visible={visible}
      title="Doll House View Instructions"
      instructions={[
        {
          icon: <RotateCcw size={18} className={ICON_CLASS} />,
          text: "Rotate Around to look at the model from different angles",
        },
        {
          icon: <MousePointerClick size={18} className={ICON_CLASS} />,
          text: "Double Click on the Model to go to First Person View",
        },
      ]}
      actionLabel="Enter Doll House View"
      onAction={onEnter}
      contained
      backdropClassName="bg-black/25 backdrop-blur-md"
      cardVariant="dark"
    />
  );
}
