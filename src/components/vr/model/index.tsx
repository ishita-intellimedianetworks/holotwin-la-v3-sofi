"use client";

/**
 * The venue model. Paths live in `scenes.json`; nothing here hard-codes a URL.
 */

import { Suspense, useEffect, useMemo } from "react";
import { useAnimations, useGLTF } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useVenue } from "@/components/vr/data/venue-provider";
import { instanceRepeats } from "./instancing";
import { prepareMaterialsForVR } from "./materials";
import "./loader";

function VenueModelContent({
  path,
  instancing,
}: {
  path: string;
  /** Per venue — see `VRVenue.instancing`. */
  instancing: boolean;
}) {
  const { scene, animations } = useGLTF(path);

  /**
   * PLAY WHAT THE MODEL SHIPS WITH — the same clips, the same way, as the flat
   * site (`components-v5/.../model-content`), which loops every action it finds.
   *
   * VR ignored them entirely, and that was not a stylistic choice, it was an
   * omission with a visible cost. The memorial's single clip is 4.4 seconds and
   * drives MORPH TARGET WEIGHTS on sixteen primitives; with no mixer those
   * weights stay at zero forever, so those meshes sit in their rest shape. A
   * rest shape is whatever the model was authored around and it is frequently
   * the collapsed one, which is why a venue that is whole on the flat site can
   * show holes here while loading byte-identical geometry.
   *
   * Bound to `scene` rather than to a wrapper, so the clips address the same
   * nodes the file names. `useGLTF` shares that object between the doll house
   * and first person, and both mount this component — one at a time, so only
   * one mixer is ever driving it.
   */
  const { actions } = useAnimations(animations, scene);

  useEffect(() => {
    const playing = Object.values(actions).filter(
      (action): action is NonNullable<typeof action> => action != null,
    );

    for (const action of playing) {
      action.reset();
      action.setLoop(THREE.LoopRepeat, Infinity);
      // These are ambient loops — water, a crowd — with no end state to hold.
      action.clampWhenFinished = false;
      action.play();
    }

    return () => {
      for (const action of playing) action.stop();
    };
  }, [actions]);

  /**
   * Collapse repeated geometry into instanced draws before anything renders —
   * see `./instancing` for what it buys and what it cannot.
   *
   * During render rather than in an effect, so no frame is ever submitted at
   * the unoptimised draw-call count. Idempotent, so the doll house and first
   * person sharing this cached object do the work once between them.
   */
  useMemo(() => {
    if (instancing) instanceRepeats(scene);
  }, [scene, instancing]);

  /**
   * Neutralise the material features the VR rig cannot light — see
   * `./materials`. Same reasoning as the instancing above for doing it during
   * render: no frame is ever submitted with a wall rendering black, and it is
   * idempotent so the doll house and first person share the one pass.
   *
   * BEFORE the pre-compile below, not after. Changing `metalness` or
   * `transmission` sets `needsUpdate`, which throws away the compiled program —
   * so doing it afterwards would compile every shader in the venue twice and
   * leave the second one to land mid-session, which is the hitch the
   * pre-compile exists to prevent.
   */
  useMemo(() => prepareMaterialsForVR(scene), [scene]);

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
        <VenueModelContent
          key={venue.model}
          path={venue.model}
          instancing={venue.instancing}
        />
      </Suspense>
    </group>
  );
}

export { preloadModel } from "./loader";
