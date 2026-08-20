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

/** Triangles a subtree would submit, counting every node that draws. */
function triangleCount(root: THREE.Object3D): number {
  let total = 0;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const geometry = mesh.geometry;
    const count = geometry.index
      ? geometry.index.count
      : (geometry.getAttribute("position")?.count ?? 0);
    const copies = (mesh as THREE.InstancedMesh).isInstancedMesh
      ? (mesh as THREE.InstancedMesh).count
      : 1;
    total += (count / 3) * copies;
  });
  return total;
}

/**
 * Turn instancing off for one load: `/vr/<venue>?noinstancing=true`.
 *
 * THIS PASS IS THE ONLY THING IN VR THAT REMOVES MESHES FROM THE SCENE, and the
 * flat site has no equivalent — so when a venue shows gaps here and the same
 * file is whole there, this is the first suspect and the only way to clear it
 * is to run once without it. A flag rather than an edit, because the comparison
 * has to be makeable from inside a headset in the time it takes to reload.
 *
 * Read once at module scope: it cannot change without a reload anyway.
 */
const DISABLED =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("noinstancing") === "true";

export function instanceRepeats(root: THREE.Object3D): void {
  if (done.has(root)) return;
  done.add(root);

  if (DISABLED) {
    console.warn("[VR] instancing disabled by ?noinstancing=true");
    return;
  }

  const before = triangleCount(root);

  root.updateMatrixWorld(true);
  _rootInverse.copy(root.matrixWorld).invert();

  const groups = new Map<string, THREE.Mesh[]>();
  let replaced = 0;
  let created = 0;

  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    // A skinned mesh carries a bone hierarchy an instance cannot express, and a
    // multi-material mesh would need per-group instancing. Neither appears in
    // these venues; both are left alone rather than mis-drawn.
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
    if (Array.isArray(mesh.material)) return;

    /**
     * A MORPHED MESH CANNOT BE INSTANCED, and leaving this out is how a mesh
     * ends up drawn in the wrong shape rather than not drawn at all.
     *
     * `InstancedMesh` carries a transform per copy and nothing else — there is
     * no per-instance morph state, and three does not read
     * `morphTargetInfluences` from one. The memorial has sixteen primitives with
     * morph targets, driven by a 4.4-second animation, so any of them collapsed
     * into an instance would be frozen at its rest shape with no way back.
     */
    if (mesh.geometry.morphAttributes?.position != null) return;

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

    replaced += meshes.length;
    created++;
  }

  /**
   * AN AUDIT, because the failure mode of this pass is silent.
   *
   * Everything here is a swap — n meshes out, one `InstancedMesh` of n in — so
   * the number of triangles the scene submits must be identical afterwards. If
   * it is not, geometry has gone missing, and the way that shows up is a hole
   * in a wall rather than an error. Cheap enough to run always: two traversals
   * of a tree that was just traversed twice anyway, once per venue load.
   */
  const after = triangleCount(root);
  const message =
    `[VR] instancing: ${created} groups, ${replaced} meshes -> ${created} draws, ` +
    `${before.toLocaleString()} triangles before, ${after.toLocaleString()} after`;

  if (Math.abs(before - after) > 0.5) {
    console.error(`${message} — MISMATCH, geometry was lost`);
  } else {
    console.info(message);
  }
}
