import { Suspense } from "react";
import InteriorSceneLighting from "@/components-v5/interior-scene-lighting";

// Lighting experience — the same venues as the home route, plus the bottom
// Day / Dusk / Night lighting switch (ported from the LA_Models_delivery
// viewer) and the dollhouse-first venue flow.
export default function LightingPage() {
  return (
    <Suspense fallback={null}>
      <InteriorSceneLighting />
    </Suspense>
  );
}
