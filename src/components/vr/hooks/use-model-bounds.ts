"use client";

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import "@/components/vr/model/loader";

/**
 * The active venue model's world bounding box.
 *
 * TWO CALLERS WANT IT and they want it for opposite reasons: the doll house
 * fits the model onto a table, and the floor plan maps world coordinates onto a
 * PNG. Sharing one hook keeps them measuring the same box — a doll house framed
 * on one bbox and a map projected through another would disagree about where
 * the middle of the venue is.
 *
 * `useGLTF` caches by path, so this suspends on work the scene is already doing
 * rather than loading a second copy.
 */
export function useModelBounds(path: string): {
  box: THREE.Box3;
  size: THREE.Vector3;
  center: THREE.Vector3;
} {
  const { scene } = useGLTF(path);

  return useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    return {
      box,
      size: box.getSize(new THREE.Vector3()),
      center: box.getCenter(new THREE.Vector3()),
    };
  }, [scene]);
}

/**
 * World XZ to a 0–1 position on the floor-plan image.
 *
 * BOTH AXES ARE REVERSED, and that is not a bug to tidy away. The flat site
 * publishes its minimap bounds as `{ minX: bbox.max.x, maxX: bbox.min.x,
 * minZ: bbox.max.z, maxZ: bbox.min.z }` (see
 * `scene-content/hooks/use-minimap-bounds`), which encodes the 180° rotation
 * between world XZ and the orientation these PNGs were rendered at. Reproducing
 * the reversal is what makes a VR marker land on the same spot as the flat
 * viewer's dot; dropping it would put the player diagonally opposite where they
 * are standing, which looks plausible enough to ship and is wrong everywhere
 * except the exact centre.
 *
 * It also means the PNG must be a top-down orthographic render whose frame
 * matches the model bbox exactly — the same requirement the flat pipeline
 * documents. Nothing here can detect a mismatched crop.
 */
export function worldToPlan(
  box: THREE.Box3,
  x: number,
  z: number,
): { u: number; v: number } {
  const spanX = box.max.x - box.min.x;
  const spanZ = box.max.z - box.min.z;

  return {
    u: spanX === 0 ? 0.5 : (box.max.x - x) / spanX,
    v: spanZ === 0 ? 0.5 : (box.max.z - z) / spanZ,
  };
}

/** The inverse, for turning a press on the plan into somewhere to stand. */
export function planToWorld(
  box: THREE.Box3,
  u: number,
  v: number,
): { x: number; z: number } {
  return {
    x: box.max.x - u * (box.max.x - box.min.x),
    z: box.max.z - v * (box.max.z - box.min.z),
  };
}
