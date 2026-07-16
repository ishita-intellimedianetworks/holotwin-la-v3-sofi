"use client";

/**
 * CrowdFlowMesh — the crowd-flow heatmap GLB (memorial). The GLB carries one
 * named zone mesh per venue area ("crowd-flow-001"…); each is tinted a
 * TRANSPARENT colour by its congestion tier from scenes.json (`crowdFlowGlb.
 * levels`): red = high, yellow = med, blue = low. The whole overlay shows ONLY
 * while the Crowd Flow category is open (panel or map) and hides with it.
 *
 * On load it also publishes each zone's world-XZ rect + tier to the nav store,
 * so the map draws the SAME zones as matching colour overlays.
 */

import { Suspense, useEffect } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { CrowdLevel } from "@/components-v5/shared/types";
import { acquireGLTF, releaseGLTF } from "@/components-v5/shared/helpers";
import { useNavUiStore, type CrowdFlowZoneRect } from "../../../store/nav-ui-store";

/** Congestion tier → overlay colour (shared with the map's zone overlays). */
export const CROWD_FLOW_COLOR: Record<CrowdLevel, string> = {
  high: "#ff453a", // red
  med: "#ffd60a",  // yellow
  low: "#0a84ff",  // blue
};

interface CrowdFlowMeshProps {
  url: string;
  levels: Record<string, CrowdLevel>;
}

function CrowdFlowMeshContent({ url, levels }: CrowdFlowMeshProps) {
  const { scene } = useGLTF(url);
  // Visible only while the Crowd Flow category is open — panel or map agree
  // via the shared openLabel.
  const open = useNavUiStore((s) => s.openLabel === "crowdflow");
  const setCrowdFlowZones = useNavUiStore((s) => s.setCrowdFlowZones);

  // Tint each named zone mesh by its authored tier.
  useEffect(() => {
    scene.traverse((obj: THREE.Object3D) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const level = levels[mesh.name] ?? "low";
      mesh.material = new THREE.MeshBasicMaterial({
        color: CROWD_FLOW_COLOR[level],
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
      });
      // Draw in the transparent pass over the venue, under the hotspot discs.
      mesh.renderOrder = 500;
    });
  }, [scene, levels]);

  // Publish the zones' ACTUAL world-XZ triangles (not bboxes) so the map draws
  // the exact same shapes the 3D overlay shows; clear on unmount/floor swap.
  useEffect(() => {
    scene.updateWorldMatrix(true, true);
    const zones: CrowdFlowZoneRect[] = [];
    const v = new THREE.Vector3();
    scene.traverse((obj: THREE.Object3D) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
      const pos = mesh.geometry.attributes.position;
      const idx = mesh.geometry.index;
      const read = (i: number): [number, number] => {
        v.fromBufferAttribute(pos as THREE.BufferAttribute, i).applyMatrix4(mesh.matrixWorld);
        return [v.x, v.z];
      };
      const tris: [number, number][][] = [];
      let sx = 0, sz = 0, n = 0;
      const count = idx ? idx.count : pos.count;
      for (let t = 0; t + 2 < count; t += 3) {
        const a = read(idx ? idx.getX(t) : t);
        const b = read(idx ? idx.getX(t + 1) : t + 1);
        const c = read(idx ? idx.getX(t + 2) : t + 2);
        tris.push([a, b, c]);
        sx += a[0] + b[0] + c[0];
        sz += a[1] + b[1] + c[1];
        n += 3;
      }
      if (!tris.length) return;
      zones.push({
        level: levels[mesh.name] ?? "low",
        tris,
        center: [sx / n, sz / n],
      });
    });
    setCrowdFlowZones(zones);
    return () => setCrowdFlowZones([]);
  }, [scene, levels, setCrowdFlowZones]);

  // Ref-counted GLTF lifecycle — same pattern as the venue models.
  useEffect(() => {
    acquireGLTF(url);
    return () => releaseGLTF(url, scene, useGLTF.clear);
  }, [scene, url]);

  return <primitive object={scene} visible={open} />;
}

export function CrowdFlowMesh(props: CrowdFlowMeshProps) {
  return (
    <Suspense fallback={null}>
      <CrowdFlowMeshContent {...props} />
    </Suspense>
  );
}
