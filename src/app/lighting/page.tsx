import { Suspense } from "react";
import InteriorSceneLighting from "@/components-v5/interior-scene-lighting";

// Lighting experience — the same venues as the home route, plus the bottom
// Day / Dusk / Night lighting switch (ported from the LA_Models_delivery
// viewer) and the dollhouse-first venue flow.
//
// Runs the LITE recipe (noPost): the full Day/Dusk/Night scene choreography —
// sun sweep, env changes, REAL fixture lights, emissive boosts, sky/fog — with
// ZERO postprocessing. No EffectComposer, no bloom, no fullscreen passes;
// antialiasing/tone mapping fall back to the canvas's native MSAA + Neutral
// pipeline, the grade is baked into the scene fill (ENV_MODES `lite`) and the
// vignette is a static DOM gradient. Ported from la-posprocessing-testing's
// /lighting-lite.
export default function LightingPage() {
  return (
    <Suspense fallback={null}>
      <InteriorSceneLighting noPost />
    </Suspense>
  );
}
