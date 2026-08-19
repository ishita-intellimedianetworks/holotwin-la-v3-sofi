"use client";

/**
 * The venue model. Paths live in `scenes.json`; nothing here hard-codes a URL.
 */

import { Suspense, useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useVenue } from "@/components/vr/data/venue-provider";
import { instanceRepeats } from "./instancing";
import "./loader";

function VenueModelContent({ path }: { path: string }) {
  const { scene } = useGLTF(path);

  /**
   * Collapse repeated geometry into instanced draws before anything renders —
   * see `./instancing` for what it buys and what it cannot.
   *
   * During render rather than in an effect, so no frame is ever submitted at
   * the unoptimised draw-call count. Idempotent, so the doll house and first
   * person sharing this cached object do the work once between them.
   */
  useMemo(() => instanceRepeats(scene), [scene]);

  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const root = useThree((state) => state.scene);

  /**
   * Compile every shader and upload every texture up front.
   *
   * three compiles a material's program the FIRST time it enters the frustum.
   * On a flat screen that shows as a hitch when you turn a corner; in a headset
   * it is a dropped frame in a view locked to the user's head, which is the one
   * kind of stutter people actually feel in their stomach. The venue models are
   * the same ones the flat site pre-compiles for exactly this reason (see
   * `model-load/model-content`), and they are considerably heavier here because
   * everything is drawn twice, once per eye.
   *
   * Done while the gate is still up, so the cost lands on a screen that is
   * already asking the user to wait.
   */
  useEffect(() => {
    let cancelled = false;

    void gl
      .compileAsync(scene, camera, root)
      .then(() => {
        if (cancelled) return;
        scene.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh || !mesh.material) return;
          const materials = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
          for (const material of materials) {
            for (const value of Object.values(material)) {
              const texture = value as THREE.Texture;
              if (texture?.isTexture) gl.initTexture(texture);
            }
          }
        });
      })
      .catch(() => {
        // Best effort. A failed pre-compile costs a hitch, not the scene.
      });

    return () => {
      cancelled = true;
    };
  }, [scene, gl, camera, root]);

  return <primitive object={scene} />;
}

/**
 * Own Suspense boundary, so a slow model does not blank the rest of the tree.
 *
 * NOT DISPOSED ON UNMOUNT, deliberately. `useGLTF` caches by path and both the
 * doll house and first person render the same object, so switching views must
 * not tear it down — and switching venues and back is common enough on this
 * route that keeping the parsed scene is worth the memory. The flat site's
 * `acquireGLTF`/`releaseGLTF` refcounting exists because it swaps between
 * venues constantly during a single session; here a venue change is a
 * deliberate act through a menu.
 */
export function VenueModel({
  pointerEvents,
}: {
  /**
   * Whether the model can be a ray target. "none" nearly everywhere: an
   * interactive model is an interactive WALL, and indoors it is usually nearer
   * to the head than the hotspot mounted on it or a panel at 2 m, so it wins
   * the ray and everything else stops responding.
   *
   * Applied to a wrapper group, not the loaded scene — `useGLTF` shares that
   * object between views and a write to it would leak across both.
   */
  pointerEvents?: "auto" | "none" | "listener";
}) {
  const venue = useVenue();

  return (
    <group pointerEvents={pointerEvents}>
      <Suspense fallback={null}>
        {/* Keyed by path so a venue change remounts rather than trying to
            reconcile one building into another. */}
        <VenueModelContent key={venue.model} path={venue.model} />
      </Suspense>
    </group>
  );
}

export { preloadModel } from "./loader";
