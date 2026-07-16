"use client";

/**
 * InteriorSceneLighting — the /lighting experience.
 *
 * Same provider / canvas / overlays composition as InteriorScene — venue
 * configs (models, POIs, dollhouse poses, base lights) and the
 * dollhouse-first flow all come from the shared scenes.json / provider, so
 * / and /lighting behave identically. The ONLY /lighting additions are the
 * Day/Dusk/Night stack:
 *   • LightingRig inside the canvas (the delivery viewer's mode recipe —
 *     drives the SoFi stadium's authored emissive LED/scoreboard materials,
 *     see presets VENUE_MAT_MODES)
 *   • LightingDock — the bottom Day / Dusk / Night glass switch
 */

import "../styles.css";
import CanvasWithWrapper from "../shared/canvas/canvas-with-wrapper";
import {
  InteriorInlineProvider,
  InteriorR3F,
  InteriorOverlays,
} from "../interior-scene";
import { defaultApartmentId } from "../shared/data/scene-config-adapter";
import LightingRig from "./view-rig";
import LightingDock from "./view-dock";

interface InteriorSceneLightingProps {
  nodeId?: string;
  onReady?: () => void;
}

export default function InteriorSceneLighting({
  nodeId = defaultApartmentId, onReady,
}: InteriorSceneLightingProps) {
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
            <LightingRig />
          </CanvasWithWrapper>
        </div>
        <InteriorOverlays />
        <LightingDock />
      </main>
    </InteriorInlineProvider>
  );
}
