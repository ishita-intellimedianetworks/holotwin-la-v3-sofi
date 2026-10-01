"use client";

import { use, useEffect } from "react";
import { useGLTF } from "@react-three/drei";
import type { ObjectMap } from "@react-three/fiber";
import * as THREE from "three";
import type { GLTF } from "three-stdlib";
import {
  forgetAsset,
  prefetchAsset,
  releaseAssetBytes,
} from "@/components/vr/hooks/use-asset-progress";

/**
 * Global GLTF loader setup. Import for the side effect before any `useGLTF`.
 *
 * EVERY VENUE MODEL IS DRACO-COMPRESSED — all four declare
 * `KHR_draco_mesh_compression` as REQUIRED, so without a decoder the load does
 * not degrade, it fails. drei points at a gstatic CDN by default and that is
 * what the flat site already relies on, so this route uses the same one rather
 * than vendoring a second copy: two decoder paths in one app means two chances
 * to be wrong about which is current.
 *
 * The navmeshes are plain, uncompressed GLBs and go through the same loader
 * regardless — the decoder is only consulted when a file asks for it.
 */
useGLTF.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/");

type GLTFResult = GLTF & ObjectMap;

/** Parsed results this route holds, so a venue it leaves can be freed. */
const held = new Map<string, GLTFResult>();

/**
 * `useGLTF` for a venue's model or navmesh — EVERY caller on this route goes
 * through here rather than calling drei directly.
 *
 * It waits for the byte prefetch first (`hooks/use-asset-progress`), so the
 * loader finds the bytes in `THREE.Cache` instead of starting a second
 * download of the same 8–11 MB file alongside the one the bar is measuring.
 * Once parsed, the raw bytes are dropped: drei keeps the parsed result.
 */
export function useVenueGLTF(path: string): GLTFResult {
  use(prefetchAsset(path).promise);
  const gltf = useGLTF(path);
  useEffect(() => {
    held.set(path, gltf);
    releaseAssetBytes(path);
  }, [path, gltf]);
  return gltf;
}

function disposeMaterial(material: THREE.Material): void {
  for (const value of Object.values(material)) {
    const texture = value as THREE.Texture | null;
    if (texture?.isTexture) texture.dispose();
  }
  material.dispose();
}

/**
 * Free a venue the player has left: GPU buffers, textures, and drei's cache
 * entry, so coming back re-loads it rather than finding a disposed scene.
 *
 * THIS IS WHAT KEEPS A HEADSET ALIVE ACROSS VENUES. Kept, every venue visited
 * stays uploaded — ~380 MB of textures after all three — which is exactly the
 * context loss `ContextWatch` exists to report.
 *
 * The caller must be sure nothing still renders `path`.
 */
export function releaseVenueGLTF(path: string): void {
  const gltf = held.get(path);
  held.delete(path);
  forgetAsset(path);
  useGLTF.clear(path);
  if (!gltf) return;

  gltf.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const material of materials) if (material) disposeMaterial(material);
    // Instance matrices, for meshes `./instancing` collapsed.
    (mesh as THREE.Mesh & { dispose?: () => void }).dispose?.();
  });
}

/** Warm the cache for a model that is about to be rendered. */
export function preloadModel(path: string): void {
  useGLTF.preload(path);
}
