"use client";

/**
 * InteriorScene — the app's single interior experience, rendered at /.
 */

import "../styles.css";
import CanvasWithWrapper from "../shared/canvas/canvas-with-wrapper";
import InteriorInlineProvider from "./interior-inline-provider";
import InteriorR3F            from "./interior-r3f";
import InteriorOverlays       from "./interior-overlays";
import { defaultApartmentId } from "../shared/data/scene-config-adapter";

interface InteriorSceneProps {
  /** Optional — defaults to the single configured apartment (node-id free). */
  nodeId?: string;
  onReady?: () => void;
}

export default function InteriorScene({
  nodeId = defaultApartmentId, onReady,
}: InteriorSceneProps) {
  return (
    <InteriorInlineProvider
      nodeId={nodeId}
      onReady={onReady}
      dollhouseFirstVisit
    >
      <main className="absolute w-full h-full overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <CanvasWithWrapper>
            <InteriorR3F />
          </CanvasWithWrapper>
        </div>
        <InteriorOverlays />
      </main>
    </InteriorInlineProvider>
  );
}

export { default as InteriorInlineProvider } from "./interior-inline-provider";
export { default as InteriorR3F }            from "./interior-r3f";
export { default as InteriorOverlays }       from "./interior-overlays";
