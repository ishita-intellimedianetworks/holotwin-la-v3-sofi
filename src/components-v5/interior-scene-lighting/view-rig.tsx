"use client";

/**
 * LightingRig — the in-canvas half of the /lighting Day/Dusk/Night control.
 *
 * Ports the LA_Models_delivery viewer's mode recipe into the app's scene
 * without editing any authored lighting — and, like the viewer, keeps the
 * light TOPOLOGY constant so a mode switch is instant:
 *
 *   • The fixture lights and the hemisphere fill are created ONCE (per venue,
 *     during load) and a mode switch only writes their intensities — three
 *     recompiles every scene shader when the light COUNT changes, so
 *     mounting/unmounting lights per mode caused the multi-second hitch.
 *   • Tone mapping is never switched (that also recompiles all materials);
 *     only the cheap exposure uniform changes per mode.
 *   • The bloom composer is PERMANENTLY enabled (it forces NoToneMapping on
 *     the renderer while mounted, so toggling it would recompile the scene);
 *     Day just runs bloom at intensity 0, and the chain's final ToneMapping
 *     pass applies the same Neutral curve + exposure the app's renderer uses.
 *
 *   Day  → fixtures/hemi/bloom at intensity 0, no overrides — matches /.
 *   Dusk/Night → the viewer's recipe with its ABSOLUTE mode values: exposure,
 *          sun/ambient overrides (lights-store), scene.environment PMREM'd
 *          from the mode's sky, twilight/moonlight hemi fill, fixture
 *          flood/point lights, boosted emissive lamps, bloom, and a sky dome
 *          that fades in on first-person entry (dollhouse keeps its black
 *          backdrop; the lighting still applies there).
 */

import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Sky as SkyImpl } from "three/examples/jsm/objects/Sky.js";
import { EffectComposer, Bloom, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode, type EffectComposer as EffectComposerImpl } from "postprocessing";

import { useInteriorInline } from "../interior-scene/inline-context";
import { useLightsStore } from "../shared/store/lights-store";
import { useWorldStore } from "../shared/store/world-store";
import isLowPower from "../shared/helpers";
import { ENV_MODES, VENUE_MAT_MODES, type EnvMode, type VenueLightsJson } from "./presets";
import { useLightingStore } from "./view-store";
import type { LightingMode } from "./view-store";

// Same per-device budget as the viewer: how many fixture JSON entries become
// real lights (the rest are covered by the emissive boost + bloom).
const FIXTURE_LIGHT_BUDGET_FULL = 14;
const FIXTURE_LIGHT_BUDGET_LOW = 5;

type EmissiveBackup = { col: THREE.Color; int: number };
const touchedMats = new Map<THREE.MeshStandardMaterial, EmissiveBackup>();

// Venue-recipe materials (VENUE_MAT_MODES — the SoFi stadium's screens/field
// glow). Claimed once per venue load by the recipe effect below; the generic
// emissiveMul pass skips them. Module-level like touchedMats/liveFixtures:
// the mount effect populates, the mode effect only writes intensities.
type TunedMat = {
  mat: THREE.MeshStandardMaterial;
  base: { col: THREE.Color; int: number; map: THREE.Texture | null };
  intensity: Partial<Record<LightingMode, number>>;
};
let venueTunedMats: TunedMat[] = [];
const venueTunedSet = new Set<THREE.MeshStandardMaterial>();

// Matches BackgroundFade's dollhouse↔first-person backdrop ease.
const SKY_FADE_SEC = 1.6;

const dbsTmp = new THREE.Vector2();

/**
 * AdaptivePerf — drops the render resolution while the user is actively
 * dragging/zooming and restores it ~200ms after they stop (R3F's performance
 * regression). The dollhouse orbit forces full-scene re-renders every frame,
 * and at full DPR that lags on heavier GPUs — halving DPR during interaction
 * quarters the fragment work for an imperceptible momentary softness.
 */
function AdaptivePerf({ composer }: { composer: React.RefObject<EffectComposerImpl | null> }) {
  const getThree = useThree((s) => s.get);
  const current = useThree((s) => s.performance.current);
  const setDpr = useThree((s) => s.setDpr);
  const baseDpr = useRef(0);

  // Flag a performance regression on every interaction movement — R3F then
  // holds performance.current at its min until the debounce elapses.
  useEffect(() => {
    const el = getThree().gl.domElement;
    const regress = () => getThree().performance.regress();
    const onPointerMove = (e: PointerEvent) => {
      if (e.buttons !== 0) regress();
    };
    el.addEventListener("pointermove", onPointerMove, { passive: true });
    el.addEventListener("wheel", regress, { passive: true });
    el.addEventListener("touchmove", regress, { passive: true });
    return () => {
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("wheel", regress);
      el.removeEventListener("touchmove", regress);
    };
  }, [getThree]);

  // Scale DPR with the performance factor (1 → base, 0.5 → half base).
  useEffect(() => {
    if (!baseDpr.current) baseDpr.current = getThree().viewport.dpr;
    setDpr(baseDpr.current * current);
  }, [getThree, setDpr, current]);
  useEffect(
    () => () => {
      if (baseDpr.current) setDpr(baseDpr.current);
    },
    [setDpr],
  );

  // The composer only resizes its buffers on CSS-size changes — a DPR change
  // would leave them stale (stuck soft after restore), so resync whenever the
  // drawing-buffer size and the composer's input buffer disagree.
  useFrame(() => {
    const c = composer.current;
    if (!c) return;
    const t = getThree();
    const dbs = t.gl.getDrawingBufferSize(dbsTmp);
    const ib = c.inputBuffer;
    if (ib && (ib.width !== dbs.width || ib.height !== dbs.height)) {
      c.setSize(t.size.width, t.size.height);
    }
  });

  return null;
}

// Build the dusk/night dome: three's Sky with an `uFade` alpha uniform patched
// into its shader so the whole dome can ease in/out. If the shader source ever
// changes and the pattern misses, the dome degrades to an unfaded (instant)
// sky — still correct, just without the ease.
function buildSkyDome(preset: NonNullable<EnvMode["sky"]>, startFade: number): SkyImpl {
  const sky = new SkyImpl();
  // Kept inside the camera's 10000 far plane.
  sky.scale.setScalar(8000);
  // The fade makes the dome TRANSPARENT, and three sorts transparent objects
  // by their centre distance — the dome's centre is the origin, i.e. right at
  // the player, so it would sort CLOSEST and draw over other transparent
  // surfaces (the trees' foliage went "alpha" under it). Force it to render
  // first among transparents: everything else then blends on top, exactly
  // like a real opaque-pass skybox.
  sky.renderOrder = -1000;
  const mat = sky.material as THREE.ShaderMaterial;
  mat.transparent = true;
  mat.depthWrite = false;
  mat.uniforms.uFade = { value: startFade };
  // Two patches in the output line:
  //  • alpha ← uFade (the ease in/out);
  //  • restore the r161 sunfade pow-curve. The delivery viewer runs three
  //    r161, whose Sky applied `pow(texColor, 1/(1.2 + 1.2*vSunfade))` before
  //    output; r184 dropped it — and with it the whole grey-mauve night sky
  //    (night texColor is ~0.003; the curve lifts it to ~0.09). Without this
  //    the night dome renders black no matter what the presets say.
  // vSunfade is still computed by the r184 VERTEX shader — only the fragment
  // lost its declaration along with the curve, so re-declare the varying.
  mat.fragmentShader =
    "uniform float uFade;\nvarying float vSunfade;\n" +
    mat.fragmentShader.replace(
      "vec4( texColor, 1.0 )",
      "vec4( pow( texColor, vec3( 1.0 / ( 1.2 + ( 1.2 * vSunfade ) ) ) ), uFade )",
    );
  mat.uniforms.turbidity.value = preset.turbidity;
  mat.uniforms.rayleigh.value = preset.rayleigh;
  mat.uniforms.mieCoefficient.value = 0.005;
  mat.uniforms.mieDirectionalG.value = 0.8;
  (mat.uniforms.sunPosition.value as THREE.Vector3).set(...preset.sunPosition);
  // This three's Sky ships PROCEDURAL CLOUDS ON by default (cloudCoverage
  // 0.4) — the delivery viewer's older Sky had none, and at night they render
  // a visible cloudy sky over what should be near-black. Kill them, and the
  // explicit sun disc (also new; the viewer's sun glow is pure mie scatter).
  mat.uniforms.cloudCoverage.value = 0;
  mat.uniforms.cloudDensity.value = 0;
  mat.uniforms.showSunDisc.value = 0;
  sky.visible = startFade > 0.002;
  return sky;
}

/**
 * FadingSky — the dusk/night sky dome. `active` (first person) eases it in;
 * the dollhouse eases it back out to the black backdrop. The env "effect"
 * (lighting/fixtures/bloom) is NOT tied to this — it applies in both views.
 */
function FadingSky({ preset, active }: { preset: NonNullable<EnvMode["sky"]>; active: boolean }) {
  const getThree = useThree((s) => s.get);
  const domeRef = useRef<SkyImpl | null>(null);
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    // Carry the current fade across a dusk↔night switch so the dome doesn't
    // blink out and re-fade.
    const prev = domeRef.current;
    const startFade =
      ((prev?.material as THREE.ShaderMaterial | undefined)?.uniforms.uFade.value as
        | number
        | undefined) ?? 0;
    const sky = buildSkyDome(preset, startFade);
    const scene = getThree().scene;
    scene.add(sky);
    domeRef.current = sky;
    return () => {
      domeRef.current = null;
      scene.remove(sky);
      sky.geometry.dispose();
      (sky.material as THREE.Material).dispose();
    };
  }, [getThree, preset]);

  useFrame((_, delta) => {
    const sky = domeRef.current;
    if (!sky) return;
    const u = (sky.material as THREE.ShaderMaterial).uniforms;
    const target = activeRef.current ? 1 : 0;
    const step = delta / SKY_FADE_SEC;
    u.uFade.value =
      target > u.uFade.value
        ? Math.min(target, u.uFade.value + step)
        : Math.max(target, u.uFade.value - step);
    // Fully faded out → skip the draw call entirely.
    sky.visible = u.uFade.value > 0.002;
  });

  return null;
}

// A mounted fixture light + its full-on intensity (mode multipliers scale it).
// Module-level (like touchedMats): the mount effect populates it, the mode
// effect only writes intensities into it.
type Fixture = { light: THREE.SpotLight | THREE.PointLight; base: number };
let liveFixtures: Fixture[] = [];

export default function LightingRig() {
  // Read renderer/scene through the store getter (not hook return values) so
  // the imperative writes below satisfy the compiler's immutability rule.
  const getThree = useThree((s) => s.get);
  const { floors, activeFloorIndex, phase } = useInteriorInline();
  const venueKey = floors[activeFloorIndex]?.id;

  const mode = useLightingStore((s) => s.environment);
  const M = ENV_MODES[mode];
  const [lowPower] = useState(() => isLowPower());
  const composerRef = useRef<EffectComposerImpl | null>(null);

  // Bumped on every model load (bounds publish) — re-runs the scene-dependent
  // effects once the new venue's meshes are actually in the tree.
  const worldVersion = useWorldStore((s) => s.version);

  // ── Exposure + interior-window backdrop (both cheap uniforms/values; tone
  //    mapping is NOT switched, see the header note). backgroundIntensity only
  //    affects TEXTURE backgrounds — i.e. the day-HDR panorama interior floors
  //    show through their windows; exterior colour backdrops ignore it. ──────
  useEffect(() => {
    const t = getThree();
    t.gl.toneMappingExposure = M.exposure;
    t.scene.backgroundIntensity = M.backgroundIntensity ?? 1;
    return () => {
      const r = getThree();
      r.gl.toneMappingExposure = 1;
      r.scene.backgroundIntensity = 1;
    };
  }, [getThree, M]);

  // ── Clouds/day-backdrop are a daytime read — off in Dusk/Night ────────────
  useEffect(() => {
    const st = useLightsStore.getState();
    st.setCloudsHidden(!!M.lights);
    return () => st.setCloudsHidden(false);
  }, [M]);

  // ── Venue-lighting override — the viewer's ABSOLUTE mode values (same
  //    models + same physical light units ⇒ same result as viewer.html) ──────
  useEffect(() => {
    const st = useLightsStore.getState();
    if (!M.lights) {
      st.setOverride(null);
      return;
    }
    st.setOverride({
      sunIntensity: M.lights.sunIntensity,
      sunColor: M.lights.sunColor,
      sunDirection: M.lights.sunDirection,
      ambientIntensity: M.lights.ambientIntensity,
      envIntensity: M.lights.envIntensity,
    });
    return () => st.setOverride(null);
  }, [M]);

  // ── Environment swap — the viewer's applyMode() regenerates
  //    scene.environment from the mode's SKY (pmrem.fromScene(sky)); at dusk
  //    that sunset-sky env is the dominant warm fill, at night it's the dark
  //    sky. Do exactly that: PMREM a throwaway mode-sky and swap it in,
  //    restoring the app's HDR on Day/unmount. Re-runs on model loads in case
  //    the venue's own <Environment> re-asserted the HDR. The swap doesn't
  //    recompile materials (an env map is always present either way). ────────
  useEffect(() => {
    if (!M.sky || !M.lights) return; // Day — the app's HDR env stays
    const { gl, scene } = getThree();
    const pmrem = new THREE.PMREMGenerator(gl);
    const holder = new THREE.Scene();
    const dome = buildSkyDome(M.sky, 1);
    holder.add(dome);
    const rt = pmrem.fromScene(holder);
    pmrem.dispose();
    dome.geometry.dispose();
    (dome.material as THREE.Material).dispose();
    const prevEnv = scene.environment;
    scene.environment = rt.texture;
    return () => {
      const sc = getThree().scene;
      // Only restore if nothing else (drei <Environment>) replaced it since.
      if (sc.environment === rt.texture) sc.environment = prevEnv;
      rt.dispose();
    };
  }, [getThree, M, venueKey, worldVersion]);

  // ── Fixture JSON (one fetch per venue, cached; null = venue has none) ─────
  const [lightsJson, setLightsJson] = useState<Record<string, VenueLightsJson | null>>({});
  useEffect(() => {
    if (!venueKey || lightsJson[venueKey] !== undefined) return;
    let cancelled = false;
    fetch(`/lights/${venueKey}_lights.json`)
      .then((r) => (r.ok ? (r.json() as Promise<VenueLightsJson>) : null))
      .catch(() => null)
      .then((j) => {
        if (!cancelled) setLightsJson((prev) => ({ ...prev, [venueKey]: j }));
      });
    return () => {
      cancelled = true;
    };
  }, [venueKey, lightsJson]);
  const venueJson = venueKey ? lightsJson[venueKey] : null;

  // ── Fixture lights — created ONCE per venue/model (viewer style), in EVERY
  //    mode, at the CURRENT mode's intensity (0 in Day). Mode switches only
  //    write intensities below, so the light count — and therefore every
  //    compiled shader — never changes on a switch. The one-time program
  //    recompile happens here, during load, hidden by the loader/blackout.
  //    JSON coordinates are affine-mapped from the delivered model's bounding
  //    volume onto the live model's (identical geometry → identity mapping).
  useEffect(() => {
    if (!venueJson) return;
    const bounds = useWorldStore.getState().bounds;
    if (!bounds) return;
    const scene = getThree().scene;

    const [jmin, jmax] = venueJson.bbox;
    const jc = [(jmin[0] + jmax[0]) / 2, (jmin[1] + jmax[1]) / 2, (jmin[2] + jmax[2]) / 2];
    const jsize = [jmax[0] - jmin[0], jmax[1] - jmin[1], jmax[2] - jmin[2]];
    const jdiag = Math.hypot(jsize[0], jsize[1], jsize[2]);
    const s = bounds.radius / (jdiag / 2);
    const [cx, cy, cz] = bounds.center;
    const map = (x: number, y: number, z: number): [number, number, number] => [
      cx + (x - jc[0]) * s,
      cy + (y - jc[1]) * s,
      cz + (z - jc[2]) * s,
    ];
    const liveDiag = bounds.radius * 2;

    // Tall fixtures flood the ground centre (the viewer's stadium banks).
    const target = new THREE.Object3D();
    target.position.set(...map(jc[0], jmin[1] + jdiag * 0.004, jc[2]));
    scene.add(target);

    const budget = lowPower ? FIXTURE_LIGHT_BUDGET_LOW : FIXTURE_LIGHT_BUDGET_FULL;
    const stride = Math.max(1, Math.ceil(venueJson.fixtures.length / budget));
    const created: Fixture[] = [];
    venueJson.fixtures.forEach((f, idx) => {
      if (idx % stride !== 0) return;
      const col = new THREE.Color(...(f.col ?? [1, 0.8, 0.5]));
      const hJson = Math.max(f.y - jmin[1], 3);
      const h = hJson * s;
      const pos = map(f.x, f.y, f.z);
      if (hJson > 15) {
        const sp = new THREE.SpotLight(col, 0, liveDiag * 1.3, 0.6, 0.6, 2.0);
        sp.position.set(...pos);
        sp.target = target;
        scene.add(sp);
        created.push({ light: sp, base: Math.min(3.5 * h * h, 7000) });
      } else {
        const pl = new THREE.PointLight(col, 0, liveDiag * 0.9, 2.0);
        pl.position.set(...pos);
        scene.add(pl);
        created.push({ light: pl, base: Math.min(120 + 4 * h * h, 600) });
      }
    });

    // Apply the CURRENT mode right away (this effect re-runs on venue/model
    // changes, where the mode hasn't changed so the mode effect won't fire).
    const mul = ENV_MODES[useLightingStore.getState().environment].fixtureMul;
    for (const fx of created) fx.light.intensity = fx.base * mul;

    liveFixtures = created;
    return () => {
      liveFixtures = [];
      for (const fx of created) scene.remove(fx.light);
      scene.remove(target);
    };
  }, [getThree, venueJson, lowPower, worldVersion]);

  // Mode switch = intensity writes only. Instant.
  useEffect(() => {
    for (const fx of liveFixtures) fx.light.intensity = fx.base * M.fixtureMul;
  }, [M]);

  // ── Venue material recipe (VENUE_MAT_MODES — the SoFi package viewer's
  //    screens/field-glow groups). Claimed ONCE per venue/model load, like the
  //    fixture lights: `useBaseMap` mats get emissiveMap = their base map here
  //    (the one-time USE_EMISSIVEMAP program change lands during load, hidden
  //    by the blackout) and KEEP it across mode switches — a switch only
  //    writes emissiveIntensity, so no shader ever recompiles. Must run BEFORE
  //    the generic emissiveMul pass below (source order): that pass skips
  //    everything claimed in venueTunedSet. ──────────────────────────────────
  useEffect(() => {
    const recipes = venueKey ? VENUE_MAT_MODES[venueKey] : undefined;
    if (!recipes) return;
    const found: TunedMat[] = [];
    getThree().scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const raw of mats) {
        const m = raw as THREE.MeshStandardMaterial;
        if (!m || !m.emissive || venueTunedSet.has(m)) continue;
        const recipe = recipes.find((r) => r.pattern.test(m.name || ""));
        if (!recipe) continue;
        venueTunedSet.add(m);
        found.push({
          mat: m,
          base: { col: m.emissive.clone(), int: m.emissiveIntensity ?? 1, map: m.emissiveMap },
          intensity: recipe.intensity,
        });
        if (recipe.useBaseMap) {
          // The viewer's fieldMats prep: textured mats glow their own content
          // (emissive white × emissiveMap = base map). Untextured ones (the
          // solid-paint roof lettering, lot markings) glow — but tinted to
          // their own base colour rather than the viewer's plain white, so
          // the grey "SoFi Stadium" lettering reads white-hot while orange /
          // yellow markings keep their colour at night.
          if (m.map) {
            m.emissive.setRGB(1, 1, 1);
            if (!m.emissiveMap) {
              m.emissiveMap = m.map;
              m.needsUpdate = true;
            }
          } else {
            m.emissive.copy(m.color);
          }
        }
      }
    });
    // Apply the CURRENT mode right away (this effect re-runs on venue/model
    // changes, where the mode hasn't changed so the mode effect won't fire).
    const cur = useLightingStore.getState().environment;
    for (const t of found) t.mat.emissiveIntensity = t.intensity[cur] ?? t.base.int;
    venueTunedMats = found;
    return () => {
      for (const t of found) {
        t.mat.emissive.copy(t.base.col);
        t.mat.emissiveIntensity = t.base.int;
        if (t.mat.emissiveMap !== t.base.map) {
          t.mat.emissiveMap = t.base.map;
          t.mat.needsUpdate = true;
        }
        venueTunedSet.delete(t.mat);
      }
      venueTunedMats = [];
    };
  }, [getThree, venueKey, worldVersion]);

  // Mode switch on recipe materials = absolute intensity writes only. Instant.
  // (Day: field glow → 0, screens → their authored value.)
  useEffect(() => {
    for (const t of venueTunedMats) t.mat.emissiveIntensity = t.intensity[mode] ?? t.base.int;
  }, [mode]);

  // ── Emissive lamp/screen boost (the viewer's lampMats pass) ───────────────
  useEffect(() => {
    const restore = () => {
      for (const [m, b] of touchedMats) {
        m.emissive.copy(b.col);
        m.emissiveIntensity = b.int;
      }
      touchedMats.clear();
    };
    restore();
    if (M.emissiveMul === 1) return;

    const lampNames = new Set(venueJson?.lampNames ?? []);
    getThree().scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const raw of mats) {
        const m = raw as THREE.MeshStandardMaterial;
        // venueTunedSet: recipe-driven materials (SoFi screens/field) carry
        // their own absolute per-mode intensities — the multiplier must not
        // stack on top.
        if (!m || !m.emissive || touchedMats.has(m) || venueTunedSet.has(m)) continue;
        const name = (m.name || "").split(".")[0];
        const isLamp = lampNames.has(name);
        const baseSum = m.emissive.r + m.emissive.g + m.emissive.b;
        if (!isLamp && baseSum <= 0.02) continue;
        touchedMats.set(m, { col: m.emissive.clone(), int: m.emissiveIntensity ?? 1 });
        // Lamps whose material carries no emissive colour glow warm (viewer
        // fallback); everything else keeps its own colour, just boosted.
        if (isLamp && baseSum < 0.02) m.emissive.setRGB(1, 0.82, 0.5);
        m.emissiveIntensity = (isLamp ? 1.0 : m.emissiveIntensity ?? 1) * M.emissiveMul;
      }
    });
    return restore;
  }, [getThree, venueJson, M, worldVersion]);

  // Composer children. The COMPOSER itself never unmounts (it forces
  // NoToneMapping on the renderer while mounted; toggling that would
  // recompile every scene material — the slow switches). Its CHILD passes are
  // cheap to swap though, so the bloom pass exists only in Dusk/Night — Day
  // pays zero bloom cost (just the final tone-map pass + MSAA resolve).
  const passes = [];
  if (M.bloom) {
    passes.push(
      <Bloom
        key="bloom"
        mipmapBlur
        intensity={M.bloom.intensity}
        luminanceThreshold={M.bloom.threshold}
        luminanceSmoothing={0.2}
        radius={M.bloom.radius}
      />,
    );
  }
  passes.push(<ToneMapping key="tonemap" mode={ToneMappingMode.NEUTRAL} />);

  return (
    <>
      {/* Twilight / moonlight hemisphere fill — ALWAYS mounted (constant light
          count); Day just drives it to 0. Colour/intensity via props, not
          args, so changes mutate the light instead of recreating it. */}
      <hemisphereLight
        color={M.hemi?.sky ?? "#5a4a6a"}
        groundColor={M.hemi?.ground ?? "#241e24"}
        intensity={M.hemi?.intensity ?? 0}
      />
      {/* Dusk/night sky dome — FIRST PERSON ONLY: the dollhouse keeps its
          black isolated-object backdrop in every mode (the lighting effect
          still applies there); entering first person eases the selected sky
          in, leaving eases it back out. Day mounts no dome — its blue sky is
          the existing BackgroundFade ease on first-person entry. */}
      {M.sky && <FadingSky preset={M.sky} active={phase === "firstPerson"} />}
      {/* Interaction-adaptive resolution: halves DPR while dragging/zooming
          (dollhouse orbit especially), restores ~200ms after the gesture. */}
      <AdaptivePerf composer={composerRef} />
      {/* Permanently-enabled composer (see the passes note): the scene
          renders linear into its buffer, then the final ToneMapping pass
          applies the SAME Khronos Neutral curve + exposure the app's renderer
          uses — so Day matches / visually while mode switches never touch a
          scene shader. Mounted on EVERY device so the dusk/night bloom halos
          match across desktop and mobile; the per-device budget is the MSAA:
          2 on desktop (halves the offscreen bandwidth vs 4, near-identical
          edges), 0 on low-power (MSAA resolves are the expensive part on
          mobile GPUs — bloom itself runs at mip resolution and Day mounts no
          bloom pass at all, so Day's overhead is one tone-map blit). */}
      <EffectComposer ref={composerRef} multisampling={lowPower ? 0 : 2}>
        {passes}
      </EffectComposer>
    </>
  );
}
