"use client";

import { useGLTF } from "@react-three/drei";

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

/** Warm the cache for a model that is about to be rendered. */
export function preloadModel(path: string): void {
  useGLTF.preload(path);
}
