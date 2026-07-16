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
import LiteFx from "./lite-fx";

interface InteriorSceneLightingProps {
  nodeId?: string;
  onReady?: () => void;
  /** Lighting-lite: /lighting without the composer, nothing else — the
   *  same scene recipe (real fixture lights, emissive boosts, sun sweep,
   *  env choreography) with NO postprocessing: canvas MSAA + native Neutral
   *  tone mapping take over, the grade is baked into the scene fill
   *  (ENV_MODES `lite`), the vignette is a static LiteFx DOM gradient, and
   *  there is no bloom. For weak devices where fullscreen postprocessing
   *  hangs. (LITE_GLOW / LITE_BAKED_FIXTURES in view-rig hold optional
   *  experimental stand-ins, off by default.) */
  noPost?: boolean;
  /** With noPost: swap the real fixture lights for LiteBakedLights'
   *  clustered spill sprites AND enable LiteGlow's glow-buffer bloom —
   *  the fully baked/cheapest variant (zero per-fixture fragment cost,
   *  no fullscreen pipeline). */
  bakedLights?: boolean;
}

export default function InteriorSceneLighting({
  nodeId = defaultApartmentId, onReady, noPost = false, bakedLights = false,
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
            <LightingRig post={!noPost} baked={bakedLights} />
          </CanvasWithWrapper>
        </div>
        {/* Above the canvas, below the UI overlays/dock. */}
        {noPost && <LiteFx />}
        <InteriorOverlays />
        <LightingDock />
      </main>
    </InteriorInlineProvider>
  );
}
