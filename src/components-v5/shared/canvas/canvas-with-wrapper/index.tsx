import { FunctionComponent, PropsWithChildren, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";

import { entry } from "@/components-v5/shared/data/scene-config-adapter";
import { FOV_DEFAULT } from "@/components-v5/shared/store/camera-store";
import isLowPower from "@/components-v5/shared/helpers";

const defaultPos = entry.position;
const defaultRot = entry.rotation;


type Props = PropsWithChildren<{
  initialPosition?: [number, number, number];
  initialRotation?: [number, number, number];
}>;

const CanvasWithWrapper: FunctionComponent<Props> = ({
  children,
  initialPosition,
  initialRotation,
}) => {
  const [px, py, pz] = initialPosition ?? defaultPos;
  const [rx, ry, rz] = initialRotation ?? defaultRot;
  // Shadows are from ONE sun, its shadow camera fitted to the model bounds and
  // the shadow map FROZEN after a single render (see SceneLights) — the scene is
  // static, so the map never re-renders and never shimmers while walking. Off on
  // low-power devices. Mirrors the reference exterior's shadow setup.
  const lowPower = isLowPower();

  return (
    <>
      <div className="w-full h-full">
        <Canvas
          // Explicit PCFShadowMap — the default boolean `shadows` picks the now-
          // deprecated PCFSoftShadowMap (warns every frame). Off on low-power.
          shadows={lowPower ? false : { type: THREE.PCFShadowMap }}
          // Cap the render resolution. R3F's default is the full device pixel
          // ratio — up to 3× on phones — which with MSAA multiplies framebuffer
          // memory ~4-9× over 1×. 1.5× is visually indistinguishable on these
          // venue scenes and is what the Smart-Loader demo ships with; phones
          // get 1.25× (they're also the memory-tightest devices).
          dpr={lowPower ? [1, 1.25] : [1, 1.5]}
          camera={{
            fov: FOV_DEFAULT,
            near: 0.1,
            // Large olympics models — keep the far plane generous so the model
            // and sky backdrop aren't clipped (matches the reference canvas).
            far: 10000,
            position: [px, py, pz],
            rotation: [rx, ry, rz],
          }}
          style={{
            height: "100%",
            width: "100%",
            position: "relative",
            touchAction: "none",
          }}
          gl={{
            antialias:  true,
            outputColorSpace: THREE.SRGBColorSpace,
            toneMapping: THREE.NeutralToneMapping
          }}
          id="canvas-wrapper"
        >
          <Suspense fallback={null}>
            <group name="dollhouse-model">{children}</group>
          </Suspense>
          <color attach="background" args={["#000"]} />
        </Canvas>
      </div>
    </>
  );
};

export default CanvasWithWrapper;
