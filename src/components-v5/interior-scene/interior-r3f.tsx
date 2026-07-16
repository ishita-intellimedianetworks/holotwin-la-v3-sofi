"use client";

/**
 * InteriorR3F — R3F children for the interior phase.
 */

import { SceneContent } from "./scene-content";
import { useInteriorInline } from "./inline-context";

export default function InteriorR3F() {
  const { sceneContent: d } = useInteriorInline();

  return (
    <>
    <SceneContent
      floors={d.floors}
      furniture={d.furniture}
      speed={d.speed}
      cameraHeight={d.cameraHeight}
      startPosition={d.startPosition}
      startRotation={d.startRotation}
      dollHouseCamera={d.dollHouseCamera}
      dollHouseModelUrl={d.dollHouseModelUrl}
      dollHousePreviewUrl={d.dollHousePreviewUrl}
      firstPersonStart={d.firstPersonStart}
      onEnterFirstPerson={d.handleEnterFirstPerson}
      cinematicActive={d.cinematicActive}
      setCinematicActive={d.setCinematicActive}
      onLoaded={() => d.setIsModelLoaded(true)}
      onModelLoaded={d.handleModelLoaded}
      onRevealStart={d.handleRevealStart}
      onRevealDone={d.handleRevealDone}
      // Shared uGlobalAlpha for the point-cloud → dither reveal (village has a
      // baked .preview.bin). Inline/orchestrated mode skips the effect.
      sharedUniforms={d.inlineMode ? undefined : d.sharedUniforms}
      debug={d.debug}
      skipEffects={d.inlineMode}
    />
    </>
  );
}
