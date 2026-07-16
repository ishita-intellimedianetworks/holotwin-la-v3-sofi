"use client";

/**
 * LiteBakedLights — /lighting-lite's TEXTURE stand-in for the DYNAMIC
 * FIXTURE LIGHTS only. The bloom is NOT its job: gradient sprites can't
 * follow the emissive shapes, so a halo sprite at each lamp head read as one
 * flat fake "glow light" — the bloom stand-in is LiteGlow's re-render of the
 * actual emissive meshes (see view-rig), which halos each bulb/screen/window
 * with its real silhouette, like the composer's bloom.
 *
 * What this replaces: the per-fixture spot/point light — a per-fragment term
 * in EVERY lit material's shader. Each fixture instead gets one additive
 * `spill` billboard — a wide dim disc centred just below the lamp head,
 * tinted with the fixture's JSON colour and textured with ONE canvas-baked
 * radial gradient (rasterised once per session). Depth-tested against the
 * venue, it washes the nearby ground/pole/walls the way the point light's
 * falloff did. Tall fixtures (the stadium flood banks) get nothing — their
 * light lands far from the head, where a head-centred disc would read wrong.
 *
 * Budget rules (same as the rig's): every fixture in the JSON gets a sprite —
 * no FIXTURE_LIGHT_BUDGET stride, ~40 quads is nothing — and since no real
 * light is added or removed, NO scene material ever compiles a different
 * program. A mode switch only eases shared sprite-material opacities (driven
 * by the same ENV_MODES.fixtureMul the real lights use): no allocation, no
 * recompile. Known trade-off vs real lights: sprites ADD glow over the scene
 * but don't diffusely shade it — surfaces near a lamp don't pick up its
 * colour from new angles. True parity there means offline-baked lightmaps.
 */

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { useWorldStore } from "../shared/store/world-store";
import { modeAnim } from "./mode-anim";
import { jsonSpaceMap, type VenueLightsJson } from "./presets";

// The one baked texture every sprite shares: a radial gradient whose bright
// core + long soft tail approximates the bloom kernel's summed mip pyramid.
// Rasterised ONCE per session on a 128² canvas, then it's an ordinary
// texture — this is the "baked" in texture-baked.
let gradientTex: THREE.CanvasTexture | null = null;
function getGradientTexture() {
  if (gradientTex) return gradientTex;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, "rgba(255,255,255,1)");
  g.addColorStop(0.15, "rgba(255,255,255,0.7)");
  g.addColorStop(0.4, "rgba(255,255,255,0.22)");
  g.addColorStop(0.75, "rgba(255,255,255,0.05)");
  g.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  gradientTex = new THREE.CanvasTexture(canvas);
  gradientTex.colorSpace = THREE.SRGBColorSpace;
  return gradientTex;
}

// The pools get their OWN falloff: a real light's wash on the ground is far
// flatter than its air-glow (inverse-square over the slant distance, not over
// the radius), so the spill gradient's steep tail reduced each pool to a tiny
// core dot. Wide plateau + soft rim ≈ the /lighting point light's ground read.
let poolTex: THREE.CanvasTexture | null = null;
function getPoolTexture() {
  if (poolTex) return poolTex;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.35, "rgba(255,255,255,0.6)");
  g.addColorStop(0.7, "rgba(255,255,255,0.2)");
  g.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  poolTex = new THREE.CanvasTexture(canvas);
  poolTex.colorSpace = THREE.SRGBColorSpace;
  return poolTex;
}

// Shared materials (one per colour × role, a handful per venue) + the
// full-on opacity each fades toward. Mode switches write opacities only.
type FadeMat = { mat: THREE.SpriteMaterial | THREE.MeshBasicMaterial; base: number };

/** The live sprite/pool group, exposed so LiteGlow can hide it while it
 *  renders its glow buffer (the fakes must not feed the bloom input). */
export const bakedFixturesGroup = { current: null as THREE.Group | null };

// Flat ground-pool quad geometry (shared): lies on the street under the
// lamp — the "light hits the ground" read a camera-facing sprite can't give.
let poolGeo: THREE.PlaneGeometry | null = null;
function getPoolGeo() {
  if (poolGeo) return poolGeo;
  poolGeo = new THREE.PlaneGeometry(1, 1);
  poolGeo.rotateX(-Math.PI / 2);
  return poolGeo;
}

export default function LiteBakedLights({
  venueJson,
}: {
  venueJson?: VenueLightsJson | null;
}) {
  const getThree = useThree((s) => s.get);
  // Bumped on every model load — rebuilds the sprites once the new venue's
  // bounds are published (same trigger as the rig's fixture lights).
  const worldVersion = useWorldStore((s) => s.version);

  const groupRef = useRef<THREE.Group | null>(null);
  const matsRef = useRef<FadeMat[]>([]);

  useEffect(() => {
    if (!venueJson) return;
    const bounds = useWorldStore.getState().bounds;
    if (!bounds) return;
    const scene = getThree().scene;
    const { jmin, jc, jdiag, s, map } = jsonSpaceMap(venueJson, bounds);

    const tex = getGradientTexture();
    const group = new THREE.Group();
    group.name = "lite-baked-fixtures";
    group.visible = false;

    const mats: FadeMat[] = [];
    const matCache = new Map<string, THREE.SpriteMaterial | THREE.MeshBasicMaterial>();
    // Fog on an additive quad lifts its TRANSPARENT corners toward the fog
    // colour — the quad edges become visible under the haze — so fog: false
    // on both material kinds.
    const material = (col: THREE.Color, role: "spill" | "pool", base: number) => {
      const key = `${role}:${base}:${col.getHexString()}`;
      let m = matCache.get(key);
      if (!m) {
        const opts = {
          map: role === "pool" ? getPoolTexture() : tex,
          color: col,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: false,
        } as const;
        m = role === "pool" ? new THREE.MeshBasicMaterial(opts) : new THREE.SpriteMaterial(opts);
        matCache.set(key, m);
        mats.push({ mat: m, base });
      }
      return m;
    };

    // Ground finder for the pools: one raycast straight down per cluster at
    // build time (never per frame). Vertical pole walls are skipped by the
    // up-facing-normal filter; capped ray length keeps the sky dome out.
    const ray = new THREE.Raycaster();
    // Sprites in the scene (venue flags/markers) refuse to raycast without a
    // camera — set it even though sprite hits (no face) are filtered anyway.
    ray.camera = getThree().camera;
    const down = new THREE.Vector3(0, -1, 0);
    const worldN = new THREE.Vector3();
    const findGround = (x: number, yTop: number, z: number, far: number, minDist: number) => {
      ray.set(new THREE.Vector3(x, yTop, z), down);
      ray.far = far;
      const hits = ray.intersectObjects(scene.children, true);
      for (const hit of hits) {
        const n = hit.face?.normal;
        if (!n) continue;
        // face.normal is OBJECT-space — GLB venue roots often carry a Z-up→
        // Y-up rotation, so it must be taken to world space before the
        // up-facing test or every ground face fails it (no pools at all).
        worldN.copy(n).transformDirection(hit.object.matrixWorld);
        if (worldN.y > 0.6 && hit.distance > minDist) return hit.point.y;
      }
      return null;
    };

    // Every SIZE heuristic below is RELATIVE to the venue's own scale — the
    // delivery JSONs use wildly different units (the village spans ~200 json
    // units, the memorial ~950 real metres). The one deliberate absolute is
    // the hJson > 15 flood/lamp split, which must MATCH the rig's real-light
    // split exactly (spot-at-centre vs point) so both routes light a venue
    // the same way.
    const R = bounds.radius; // world half-diagonal — the world-unit yardstick

    // CLUSTER the fixtures first: venue lamps come in tight groups (the
    // village's 4–5-bulb posts) and one additive sprite PER FIXTURE stacked
    // into hot "extra light" blobs. One spill per cluster instead — the
    // real lights' overlap is approximated by a slightly larger/brighter
    // disc, and the scene stops reading as having more lights than it has.
    type Cluster = { x: number; y: number; z: number; col: THREE.Color; n: number };
    const clusters: Cluster[] = [];
    const clusterR2 = (jdiag * 0.018) ** 2; // same-post/same-corner groups
    for (const f of venueJson.fixtures) {
      const near = clusters.find((c) => (c.x - f.x) ** 2 + (c.z - f.z) ** 2 < clusterR2);
      if (near) {
        near.x = (near.x * near.n + f.x) / (near.n + 1);
        near.z = (near.z * near.n + f.z) / (near.n + 1);
        near.y = Math.max(near.y, f.y);
        near.n += 1;
      } else {
        clusters.push({ x: f.x, y: f.y, z: f.z, col: new THREE.Color(...(f.col ?? [1, 0.8, 0.5])), n: 1 });
      }
    }

    // Small bright halo AT each lamp head — the "glowing bulb" read. With the
    // glow buffer off (see view-rig: its per-frame occluder pass was the lite
    // route's whole remaining GPU cost), this sprite is the halo. Bulb-scale,
    // not the wide spill disc. PER FIXTURE, not per cluster: the cluster's
    // averaged centroid floats between the physical lamps — the glowing point
    // must sit ON each real bulb.
    for (const f of venueJson.fixtures) {
      const hJson = Math.max(f.y - jmin[1], jdiag * 0.01);
      const h = hJson * s;
      const head = map(f.x, f.y, f.z);
      const halo = new THREE.Sprite(
        material(new THREE.Color(...(f.col ?? [1, 0.8, 0.5])), "spill", 0.6) as THREE.SpriteMaterial,
      );
      halo.raycast = () => {};
      halo.position.set(head[0], head[1], head[2]);
      const d = Math.min(h * 0.9, R * 0.035);
      halo.scale.set(d, d, 1);
      group.add(halo);
    }

    // A wash quad, oriented/stretched and made pointer-invisible in one place.
    const addWash = (
      col: THREE.Color, base: number,
      x: number, y: number, z: number,
      w: number, l: number, yaw: number,
    ) => {
      const pool = new THREE.Mesh(getPoolGeo(), material(col, "pool", base));
      // Glow quads must be invisible to raycasting: the app's pointer /
      // navigation raycasters sweep the scene and must never hit a light wash.
      pool.raycast = () => {};
      pool.position.set(x, y, z);
      pool.scale.set(w, 1, l);
      pool.rotation.y = yaw;
      group.add(pool);
    };

    for (const c of clusters) {
      const hJson = Math.max(c.y - jmin[1], jdiag * 0.01);
      const h = hJson * s;
      const head = map(c.x, c.y, c.z);
      // A cluster glows a touch brighter/wider than a lone lamp (sub-linear:
      // five bulbs on one post read as one strong light, not five).
      const boost = Math.min(1.5, Math.sqrt(c.n));

      // The SAME split the rig's real lights use (view-rig fixture effect):
      // hJson > 15 = a flood bank the rig aims as a SpotLight AT THE VENUE
      // CENTRE — its light lands INSIDE the bowl, not at the pole. Everything
      // else is an omnidirectional PointLight — symmetric wash at its base.
      if (hJson > 15) {
        // NO wide head disc (its light leaves the head sideways) and NO
        // base-drop pool. The spot cone's landing is baked as a short TRAIL of small,
        // dim washes along the aim line, each raycast onto the surface it
        // actually hits (stands / walkway / field) — one giant quad can't
        // follow the bowl's stepped surfaces (it floats), and at that size
        // its additive overdraw is a real fill-rate cost (the lag). Small
        // patches overlap into a soft corridor the way the cone reads on
        // /lighting, and stay subtle where they stack.
        const centre = map(jc[0], jmin[1], jc[2]);
        const dx = centre[0] - head[0];
        const dz = centre[2] - head[2];
        const dist = Math.hypot(dx, dz);
        if (dist > 1e-3) {
          const yaw = Math.atan2(dx, dz);
          const d = Math.min(dist * 0.4, R * 0.1);
          for (const t of [0.35, 0.6, 0.85]) {
            const px = head[0] + dx * t;
            const pz = head[2] + dz * t;
            const gy = findGround(px, head[1] + h * 0.5, pz, h * 6, 0);
            if (gy === null) continue;
            addWash(
              c.col, Math.min(0.22, 0.15 * boost),
              px, gy + h * 0.03, pz,
              d * 0.8, d, yaw,
            );
          }
          // Faint wash at the pole base too — in the real rig the FAR side's
          // floods cross-light the near concourse (every cone reaches past
          // the centre target); one dim local pool reads the same.
          const by = findGround(head[0], head[1] - h * 0.05, head[2], h * 3, h * 0.3);
          if (by !== null) {
            const bd = R * 0.06 * (1 + (boost - 1) * 0.3);
            addWash(c.col, Math.min(0.3, 0.2 * boost), head[0], by + h * 0.02, head[2], bd, bd, 0);
          }
        }
        continue;
      }

      // Street lamp: wide head-centred spill disc (the point light's local
      // wash on pole/walls — the bulb halos above are per fixture)…
      const spill = new THREE.Sprite(
        material(c.col, "spill", Math.min(0.5, 0.26 * boost)) as THREE.SpriteMaterial,
      );
      spill.raycast = () => {}; // same — never a pointer/nav hit target
      spill.position.set(head[0], head[1] - h * 0.25, head[2]);
      const spillD = Math.min(h * 2.2, R * 0.1) * (1 + (boost - 1) * 0.35);
      spill.scale.set(spillD, spillD, 1);
      group.add(spill);

      // …plus the symmetric ground pool under it. Skipped when no up-facing
      // surface is found below (bridge lamps over void etc.).
      const groundY = findGround(head[0], head[1] - h * 0.05, head[2], h * 3, h * 0.3);
      if (groundY !== null) {
        const poolD = Math.min(h * 3.6, R * 0.16) * (1 + (boost - 1) * 0.3);
        addWash(
          c.col, Math.min(0.7, 0.5 * boost),
          head[0], groundY + h * 0.02, head[2],
          poolD, poolD, 0,
        );
      }
    }

    scene.add(group);
    groupRef.current = group;
    bakedFixturesGroup.current = group;
    matsRef.current = mats;
    return () => {
      groupRef.current = null;
      if (bakedFixturesGroup.current === group) bakedFixturesGroup.current = null;
      matsRef.current = [];
      scene.remove(group);
      for (const { mat } of mats) mat.dispose();
      // poolGeo + gradientTex are session-level caches — kept.
    };
  }, [getThree, venueJson, worldVersion]);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    // modeAnim.fixtureMul is SunCycle's animated fixture drive — the sprites
    // ride the SAME staggered lamp phase as the emissives/bloom, so the whole
    // "lights come on" moment lands together. Night's 1.5 brightens them the
    // way it boosts the real lights (opacity clamps at 1).
    const mul = modeAnim.fixtureMul;
    group.visible = mul > 0.002;
    if (!group.visible) return;
    for (const { mat, base } of matsRef.current) {
      mat.opacity = Math.min(1, base * mul);
    }
  });

  return null;
}
