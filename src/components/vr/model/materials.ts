"use client";

import * as THREE from "three";

/**
 * Make a venue's materials survive the VR lighting rig.
 *
 * THE RIG IS ONE `ambientLight` AND NOTHING ELSE — no sun, no environment map —
 * and that is a frame-budget decision the scene cannot afford to revisit: a
 * shadow-casting directional light renders a depth pass over a kilometre-wide
 * stadium once per eye per frame. See `experience/index.tsx`.
 *
 * These models come out of CAD with real PBR materials authored for a viewer
 * that looks at them from the front, and two of those assumptions do not
 * survive being walked around in a headset:
 *
 *   SINGLE-SIDED surfaces are invisible from behind, and behind is somewhere a
 *   navmesh will happily take you. See the note on `side` below.
 *
 *   TRANSMISSIVE surfaces — glass — are see-through by construction, and three
 *   pays for them by rendering the WHOLE scene an extra time every frame to
 *   have something to refract. Twice, here, once per eye, on venues that are
 *   already over their draw budget. The flat site turns this off for exactly
 *   that reason; so does this.
 *
 * METALNESS USED TO BE ZEROED HERE TOO, because a metallic surface has no
 * diffuse term and there was no environment for it to reflect, so it rendered
 * black — which in a headset, against a black background, is indistinguishable
 * from a hole in the wall. `experience/environment` supplies one now, so that
 * is no longer true and metals are left as authored.
 */

/** `useGLTF` hands out one shared object per URL, so this must run once on it. */
const done = new WeakSet<THREE.Object3D>();

/**
 * `?model=wire` and `?model=unlit` — two diagnostics for the same question.
 *
 * WHEN A SURFACE IS NOT THERE, there are only two possibilities and they need
 * completely different fixes: either the geometry is genuinely absent from the
 * scene, or it is present and something about how it is being drawn makes it
 * invisible — unlit, black, or losing a depth fight with the surface behind it.
 * From outside a headset the two are indistinguishable, and from inside it they
 * look identical too. So each is made visible on its own:
 *
 *   `wire`   every material drawn as wireframe. Geometry that exists shows its
 *            edges whatever its shading was doing. A hole that is still a hole
 *            here has no triangles in it — the mesh really is missing.
 *
 *   `unlit`  every material replaced by `MeshBasicMaterial` carrying the same
 *            colour map. `MeshBasicMaterial` ignores lights, normals, metalness
 *            and the environment entirely, so a surface that appears under this
 *            and not otherwise was never missing: it was unlit.
 *
 * Read once at module scope; neither can change without a reload.
 */
const MODE =
  typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("model")
    : null;

export function prepareMaterialsForVR(root: THREE.Object3D): void {
  if (done.has(root)) return;
  done.add(root);

  if (MODE === "wire" || MODE === "unlit") {
    debugMaterials(root, MODE);
    return;
  }

  /**
   * Materials are shared between meshes, so the same one arrives many times.
   * Editing it twice is harmless; setting `needsUpdate` twice recompiles a
   * shader that was already queued, which is not.
   */
  const seen = new Set<THREE.Material>();

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;

    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];

    for (const material of materials) {
      if (seen.has(material)) continue;
      seen.add(material);

      const physical = material as THREE.MeshPhysicalMaterial;
      let changed = false;

      /**
       * DRAW BOTH SIDES OF EVERY SURFACE.
       *
       * A single-sided wall is not drawn when you are behind it, and in a
       * headset you can be. That is the difference between the two viewers: the
       * flat one moves between authored viewpoints, all of which face the
       * fronts of things, while here you walk a navmesh that runs behind the
       * stands, along service corridors and around the back of a restroom
       * block. From there a wall the exporter marked front-facing simply is not
       * there, and what you see is the room beyond it.
       *
       * It is a small number of materials — ten of the memorial's 190, eleven
       * of the stadium's 64, seven of the village's 76 — so the cost is losing
       * backface culling on those alone. A wall you can see through is worse
       * than a wall drawn twice.
       */
      if (material.side === THREE.FrontSide) {
        material.side = THREE.DoubleSide;
        changed = true;
      }

      /**
       * METALNESS IS LEFT ALONE NOW. It was being zeroed, because a metallic
       * surface has no diffuse term and the scene had no environment to give it
       * anything to reflect, so it rendered black — and black in a headset
       * against a black background is indistinguishable from a hole. That was
       * the right call while it was true and it stopped being true when
       * `experience/environment` was added: the reflections are back, so the
       * thirteen metallic materials on the memorial are lit as authored rather
       * than flattened into diffuse.
       */

      if (typeof physical.transmission === "number" && physical.transmission > 0) {
        physical.transmission = 0;
        changed = true;
      }

      /**
       * A surface that no longer refracts should not still be treated as having
       * a volume to refract THROUGH — three attenuates colour by thickness for
       * transmissive materials, and left set it tints the glass toward black.
       */
      if (typeof physical.thickness === "number" && physical.thickness > 0) {
        physical.thickness = 0;
        changed = true;
      }

      if (changed) material.needsUpdate = true;
    }
  });
}

/**
 * The two diagnostic modes. Deliberately destructive and deliberately not
 * reachable without typing a query parameter.
 */
function debugMaterials(root: THREE.Object3D, mode: "wire" | "unlit"): void {
  console.warn(`[VR] material debug mode: ${mode}`);

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;

    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];

    if (mode === "wire") {
      for (const material of materials) {
        const line = material as THREE.MeshStandardMaterial;
        line.wireframe = true;
        // Depth off, so a wall in front cannot hide the edges of one behind —
        // the whole point is to see whether the triangles exist at all.
        line.depthTest = false;
        material.needsUpdate = true;
      }
      return;
    }

    /**
     * `MeshBasicMaterial` is not lit by anything, so what it draws is the
     * texture and nothing else. `side` and the alpha settings are carried over
     * because they decide whether a face is drawn at all, which is the very
     * thing under test.
     */
    const replaced = materials.map((source) => {
      const standard = source as THREE.MeshStandardMaterial;
      return new THREE.MeshBasicMaterial({
        map: standard.map ?? null,
        color: standard.color ?? new THREE.Color(0xffffff),
        side: standard.side,
        transparent: standard.transparent,
        alphaTest: standard.alphaTest,
        opacity: standard.opacity,
      });
    });

    mesh.material = replaced.length === 1 ? replaced[0] : replaced;
  });
}
