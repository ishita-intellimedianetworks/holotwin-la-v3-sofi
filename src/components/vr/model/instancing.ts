"use client";

import * as THREE from "three";

/**
 * Collapse repeated geometry into `InstancedMesh` at load time.
 *
 * WHY. glTF gives every repeat of a mesh its own node, and three gives every
 * node its own draw call. The memorial is 2,471 nodes drawing 260 repeated
 * shapes — a seat, a column, a rail, a step — so it submits roughly ten times
 * what a standalone headset can manage, doubled again because the scene is
 * drawn once per eye.
 *
 * A missed deadline in WebXR is not a slow frame, it is NO frame: the
 * compositor reprojects the previous one or shows nothing. Miss most of them
 * and the view strobes or goes black. The flat site renders the same model
 * happily because a desktop GPU draws one eye with no deadline — the model is
 * not broken, the budget is different.
 *
 * WHAT THIS DOES. One pass on load: group every mesh by (geometry, material),
 * and where a group repeats, replace those nodes with a single `InstancedMesh`
 * carrying their transforms. Same geometry, same materials, same positions —
 * the picture is identical.
 *
 * WHAT IT CANNOT DO. It only removes draw calls that are DUPLICATES. The floor
 * it can reach is the number of distinct (geometry, material) pairs, and that
 * is bounded below by the material count. Measured on this project:
 *
 *   venue      draws now   floor after instancing   materials
 *   memorial       2,471                   ~1,037         190
 *   village          302                     ~232          76
 *   stadium          228                     ~200          64
 *
 * So the memorial goes from ~10x over budget to ~3.5x — a real improvement and
 * not a fix. Getting it under 300 needs its 190 materials merged, which is an
 * asset change no amount of code can substitute for. Triangles are untouched
 * either way; this moves the calls that submit them, nothing else.
 */

/**
 * Below this a group is left alone. Instancing three copies saves two draw
 * calls and costs a buffer upload; the win is in shapes repeated dozens of
 * times.
 */
const MIN_INSTANCES = 4;

/** `useGLTF` hands out one shared object per URL, so this must run once on it. */
const done = new WeakSet<THREE.Object3D>();

const _local = new THREE.Matrix4();
const _rootInverse = new THREE.Matrix4();

export function instanceRepeats(root: THREE.Object3D): void {
  if (done.has(root)) return;
  done.add(root);

  root.updateMatrixWorld(true);
  _rootInverse.copy(root.matrixWorld).invert();

  const groups = new Map<string, THREE.Mesh[]>();

  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    // A skinned mesh carries a bone hierarchy an instance cannot express, and a
    // multi-material mesh would need per-group instancing. Neither appears in
    // these venues; both are left alone rather than mis-drawn.
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
    if (Array.isArray(mesh.material)) return;

    const key = `${mesh.geometry.uuid}|${(mesh.material as THREE.Material).uuid}`;
    const list = groups.get(key);
    if (list) list.push(mesh);
    else groups.set(key, [mesh]);
  });

  for (const meshes of groups.values()) {
    if (meshes.length < MIN_INSTANCES) continue;

    const first = meshes[0];
    const instances = new THREE.InstancedMesh(
      first.geometry,
      first.material as THREE.Material,
      meshes.length,
    );

    // Named for the debugger's benefit; nothing reads it.
    instances.name = `${first.name}__x${meshes.length}`;

    for (let i = 0; i < meshes.length; i++) {
      // Relative to the root, not the world: this is parented to the root, so
      // world matrices would apply the root's own transform a second time —
      // and the doll house scales that root by a factor of hundreds.
      _local.multiplyMatrices(_rootInverse, meshes[i].matrixWorld);
      instances.setMatrixAt(i, _local);
    }
    instances.instanceMatrix.needsUpdate = true;

    // Without this the bounding sphere is the single source mesh's, and every
    // copy but the one at the origin is culled the moment you look away.
    instances.computeBoundingSphere();

    root.add(instances);
    for (const mesh of meshes) mesh.removeFromParent();
  }
}
