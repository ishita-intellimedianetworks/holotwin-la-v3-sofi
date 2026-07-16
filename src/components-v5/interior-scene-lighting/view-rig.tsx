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

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Sky as SkyImpl } from "three/examples/jsm/objects/Sky.js";
import {
  EffectComposer,
  Bloom,
  ToneMapping,
  SMAA,
  Vignette,
  BrightnessContrast,
  HueSaturation,
} from "@react-three/postprocessing";
import {
  SMAAPreset,
  ToneMappingMode,
  type BloomEffect,
  type EffectComposer as EffectComposerImpl,
} from "postprocessing";

import AdaptivePerf from "../shared/canvas/adaptive-perf";
import { useInteriorInline } from "../interior-scene/inline-context";
import { useLightsStore } from "../shared/store/lights-store";
import { useWorldStore } from "../shared/store/world-store";
import isLowPower from "../shared/helpers";
import {
  ENV_MODES,
  VENUE_MAT_MODES,
  jsonSpaceMap,
  type EnvMode,
  type VenueLightsJson,
} from "./presets";
import LiteBakedLights, { bakedFixturesGroup } from "./lite-baked";
import { modeAnim } from "./mode-anim";
import SunCycle from "./sun-cycle";
import { useLightingStore } from "./view-store";
import type { LightingMode } from "./view-store";

// Same per-device budget as the viewer: how many fixture JSON entries become
// real lights (the rest are covered by the emissive boost + bloom).
const FIXTURE_LIGHT_BUDGET_FULL = 14;
const FIXTURE_LIGHT_BUDGET_LOW = 5;

// /lighting-lite = /lighting WITHOUT the composer, nothing else: the same
// real fixture lights, the same emissive boosts, the same sun/env recipe on
// every venue — just no bloom/postprocessing (native MSAA + native Neutral
// tone mapping + the LiteFx DOM vignette instead).
//
// /lighting-baked (the rig's `baked` prop) turns BOTH stand-ins on instead:
//   • fixtures → LiteBakedLights' clustered additive spill sprites (scene
//     programs compile with zero per-fixture lights — cheapest fragments);
//   • bloom → LiteGlow's threshold + dual-Kawase glow buffer (per-source
//     halos with no fullscreen pipeline).
// The consts below only set the DEFAULT for the non-baked lite route.
const LITE_BAKED_FIXTURES = false;
const LITE_GLOW = false;

// One boosted lamp/screen material: its authored backup (col/int), the
// viewer-recipe flags, and the from→to intensities the current transition
// lerps between (modeAnim.lampK — captured on every mode change).
type EmissiveBackup = {
  col: THREE.Color;
  int: number;
  /** In the venue JSON's lampNames set (viewer's lampMats). */
  lamp: boolean;
  /** Lamp with NO authored emissive colour: glows warm, and its Day target
   *  is intensity 0 (warm × 0 ≡ the authored black emissive). */
  dark: boolean;
  from: number;
  to: number;
};
const touchedMats = new Map<THREE.MeshStandardMaterial, EmissiveBackup>();

// The viewer's per-mode emissive target for one boosted material.
function emissiveTarget(e: EmissiveBackup, mode: LightingMode) {
  const mul = ENV_MODES[mode].emissiveMul;
  if (mul === 1) return e.dark ? 0 : e.int; // Day: the authored look
  return (e.lamp ? 1 : e.int) * mul;
}

// Venue-recipe materials (VENUE_MAT_MODES — the SoFi stadium's screens/field
// glow). Claimed once per venue load by the recipe effect below; the generic
// emissiveMul pass skips them. Module-level like touchedMats/liveFixtures:
// the mount effect populates, the mode effect only writes intensities.
type TunedMat = {
  mat: THREE.MeshStandardMaterial;
  base: { col: THREE.Color; int: number; map: THREE.Texture | null };
  intensity: Partial<Record<LightingMode, number>>;
  /** LED/score boards (recipes without useBaseMap). On the composer route
   *  their lit look is half BLOOM — the boards' texels are mostly dark, so
   *  at the same emissiveIntensity the no-post route shows a dim panel where
   *  /lighting shows a blown-out glowing screen. screens get LITE_SCREEN_MUL
   *  extra drive there instead (bright texels saturate to white through the
   *  tone mapper — reads "on" with zero extra passes). */
  screen: boolean;
  /** Transition endpoints, lerped by modeAnim.lampK (like EmissiveBackup). */
  from: number;
  to: number;
};
let venueTunedMats: TunedMat[] = [];
const venueTunedSet = new Set<THREE.MeshStandardMaterial>();
const LITE_SCREEN_MUL = 2.2;

// Matches BackgroundFade's dollhouse↔first-person backdrop ease.
const SKY_FADE_SEC = 1.6;

const fogColorTmp = new THREE.Color();

/**
 * ModeFog — the dusk/night atmospheric haze (the ez-tree demo's FogExp2
 * trick: depth fade lives in the material shaders, so it costs no pass).
 *
 * A FogExp2 is attached to the scene PERMANENTLY at rig mount with density 0
 * (invisible): fog presence is part of three's shader program key, so
 * attaching it later — on the first Dusk switch — would recompile every
 * material, the exact hitch this rig exists to avoid. Mode switches only
 * drive the density/colour, and like the sky dome the haze applies in first
 * person only, eased with the same fade (the dollhouse keeps its isolated-
 * object read).
 */
function ModeFog({ fx, active }: { fx?: EnvMode["fx"]; active: boolean }) {
  const getThree = useThree((s) => s.get);
  const bounds = useWorldStore((s) => s.bounds);
  const fog = useMemo(() => new THREE.FogExp2("#000000", 0), []);
  // 0 → clear, 1 → the mode's full haze; eased like the dome fade.
  const mix = useRef(0);
  // Last real recipe, kept so a switch back to Day eases OUT instead of
  // popping to clear the moment `fx` disappears.
  const lastFog = useRef<{ color: string; k: number } | null>(null);
  useEffect(() => {
    if (fx?.fog) lastFog.current = fx.fog;
  }, [fx]);

  useEffect(() => {
    const scene = getThree().scene;
    const prev = scene.fog;
    scene.fog = fog;
    return () => {
      const sc = getThree().scene;
      if (sc.fog === fog) sc.fog = prev;
    };
  }, [getThree, fog]);

  useFrame((_, delta) => {
    const rec = lastFog.current;
    if (!rec) return;
    const step = delta / SKY_FADE_SEC;
    const target = active && fx?.fog ? 1 : 0;
    mix.current =
      target > mix.current
        ? Math.min(target, mix.current + step)
        : Math.max(target, mix.current - step);
    // Scale-aware density: k over the venue's bounding radius, so the village
    // and the (much larger) stadium haze proportionally.
    const density = bounds ? rec.k / bounds.radius : 0;
    const k = mix.current * mix.current; // ease-in reads better than linear
    fog.density = density * k;
    // Colour: snap while invisible, ease during a visible dusk↔night switch.
    if (mix.current <= 0.002) fog.color.set(rec.color);
    else fog.color.lerp(fogColorTmp.set(rec.color), Math.min(1, step * 2));
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

// Stand-in preset for building the permanent dome while the rig mounts on Day
// (its uniforms are overwritten the moment a dusk/night preset arrives, long
// before the dome is visible). Dusk always defines a sky.
const BOOT_SKY = ENV_MODES.dusk.sky as NonNullable<EnvMode["sky"]>;

/**
 * FadingSky — the dusk/night sky dome, run the ez-tree demo's Skybox way: ONE
 * dome built at rig mount (its shader compiles once, during load) and kept for
 * the rig's whole life; a mode switch only writes sky uniforms
 * (turbidity/rayleigh/sunPosition) — never rebuilds the material, so a
 * dusk↔night switch costs no shader compile and no allocation. `active`
 * (first person) eases it in; the dollhouse — and a switch back to Day —
 * eases it back out to the black backdrop instead of popping. The env
 * "effect" (lighting/fixtures/bloom) is NOT tied to this — it applies in
 * both views.
 */
function FadingSky({ preset, active }: { preset?: EnvMode["sky"]; active: boolean }) {
  const getThree = useThree((s) => s.get);
  const domeRef = useRef<SkyImpl | null>(null);
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  // Last real preset, kept (like ModeFog's lastFog) so a switch to Day eases
  // the dome OUT under the previous mode's sky instead of popping to black.
  const lastPreset = useRef<EnvMode["sky"] | null>(preset ?? null);
  const hasPreset = useRef(!!preset);

  useEffect(() => {
    const sky = buildSkyDome(lastPreset.current ?? BOOT_SKY, 0);
    const scene = getThree().scene;
    scene.add(sky);
    domeRef.current = sky;
    return () => {
      domeRef.current = null;
      scene.remove(sky);
      sky.geometry.dispose();
      (sky.material as THREE.Material).dispose();
    };
  }, [getThree]);

  useEffect(() => {
    hasPreset.current = !!preset;
    if (preset) lastPreset.current = preset; // Day keeps the old sky fading out
  }, [preset]);

  useFrame((_, delta) => {
    const sky = domeRef.current;
    if (!sky) return;
    const u = (sky.material as THREE.ShaderMaterial).uniforms;
    // The ez-tree Skybox setter pattern: a mode is uniform writes only (plain
    // per-frame assignments — no allocation, no material rebuild). While the
    // dome is VISIBLE the values glide toward the preset (a dusk↔night switch
    // moves the dome's sun with the real one instead of snapping); invisible
    // → land instantly.
    const p = lastPreset.current;
    if (p) {
      const visibleNow = u.uFade.value > 0.002;
      const sm = visibleNow ? Math.min(1, delta / 0.8) : 1;
      u.turbidity.value += (p.turbidity - u.turbidity.value) * sm;
      u.rayleigh.value += (p.rayleigh - u.rayleigh.value) * sm;
      const sp = u.sunPosition.value as THREE.Vector3;
      sp.x += (p.sunPosition[0] - sp.x) * sm;
      sp.y += (p.sunPosition[1] - sp.y) * sm;
      sp.z += (p.sunPosition[2] - sp.z) * sm;
    }
    const target = activeRef.current && hasPreset.current ? 1 : 0;
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

// PMREM'd mode-sky environments, cached per renderer (the ez-tree budget: a
// mode switch is uniform/pointer writes, not GPU bakes — the throwaway-dome
// shader compile + 6-face PMREM render happens once per mode, on first use,
// and every later visit to that mode just re-points scene.environment). The
// WeakMap lets the cache die with its renderer; the Set answers "is this
// texture one of OURS?" when deciding what to capture as the day env.
const modeEnvCache = new WeakMap<THREE.WebGLRenderer, Map<string, THREE.Texture>>();
const modeEnvTextures = new Set<THREE.Texture>();

// Bake (once) / fetch the PMREM'd sky env for a dusk/night mode.
function getModeEnv(gl: THREE.WebGLRenderer, mode: LightingMode) {
  let cache = modeEnvCache.get(gl);
  if (!cache) {
    cache = new Map();
    modeEnvCache.set(gl, cache);
  }
  let tex = cache.get(mode);
  if (!tex) {
    const sky = ENV_MODES[mode].sky as NonNullable<EnvMode["sky"]>;
    const pmrem = new THREE.PMREMGenerator(gl);
    const holder = new THREE.Scene();
    const dome = buildSkyDome(sky, 1);
    holder.add(dome);
    const rt = pmrem.fromScene(holder);
    pmrem.dispose();
    dome.geometry.dispose();
    (dome.material as THREE.Material).dispose();
    tex = rt.texture;
    cache.set(mode, tex);
    modeEnvTextures.add(tex);
  }
  return tex;
}

// Bloom's LUMINANCE pre-pass is the one FULL-resolution internal render the
// dusk/night chain adds (the mip blur under it shrinks geometrically — all
// its levels together cost about ⅔ of one fullscreen pass). Run it at half
// resolution: ~4× cheaper, and since bloom is low-frequency by nature the
// halos are indistinguishable — the bilinear read even pre-averages 2×2
// blocks, which steadies the threshold against single-pixel fireflies.
// (Module-level so the ref identity is stable across renders.)
const halveBloomLuminance = (bloom: BloomEffect | null) => {
  if (bloom) bloom.luminancePass.resolution.scale = 0.5;
};

// The /lighting-lite glow buffer's private layer bit (three supports 0–31).
const GLOW_LAYER = 30;

// Tag the glow SOURCES: every mesh whose material the rig already boosted
// (touchedMats = lamps/screens, venueTunedSet = the venue recipe's
// screens/field) joins GLOW_LAYER — exactly the set the main route's bloom
// picks out as over-threshold. Lights join too: that keeps each material's
// shader program IDENTICAL between the main render and the glow render (a
// zero-light layer would compile a second no-lights program variant for
// every tagged material — a hitch, and the diffuse light it adds is cut by
// the composite shader's threshold, like bloom's luminance pass).
function retagGlowLayer(scene: THREE.Scene) {
  scene.traverse((o) => {
    if ((o as THREE.Light).isLight) {
      o.layers.enable(GLOW_LAYER);
      return;
    }
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const glows = mats.some((raw) => {
      const m = raw as THREE.MeshStandardMaterial;
      return !!m && !!m.emissive && (venueTunedSet.has(m) || touchedMats.has(m));
    });
    if (glows) o.layers.enable(GLOW_LAYER);
    else o.layers.disable(GLOW_LAYER);
  });
}

// The composite overlay: ONE fullscreen triangle, drawn additively at the
// very end of the normal scene pass (renderOrder), so the glow needs no
// second fullscreen pipeline — the vertex shader writes clip space directly
// and the fragment sums four mip taps of the glow buffer, each thresholded
// like bloom's luminance pre-pass. Fragment cost: 4 texture reads.
const GLOW_OVERLAY_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;
const GLOW_OVERLAY_FRAG = /* glsl */ `
  uniform sampler2D tGlow;
  uniform float uIntensity;
  varying vec2 vUv;
  void main() {
    // tGlow is the FINISHED bloom pyramid (threshold → dual-Kawase down/up
    // accumulate, see the pass chain in LiteGlow) — one bilinear tap is the
    // whole composite. No mip sampling: auto-mips are box filters, and
    // tapping them with LOD bias gave square, shimmering blobs.
    vec3 glow = texture2D(tGlow, vUv).rgb;
    gl_FragColor = vec4(glow * uIntensity, 1.0);
    #include <colorspace_fragment>
  }
`;

// Dual-Kawase DOWN: 4x centre + 4 diagonal half-taps, /8 — each level halves
// the resolution and doubles the blur radius with a smooth round kernel
// (this is what postprocessing's mipmap bloom actually runs, versus the
// square box average a raw mip chain stores).
const GLOW_DOWN_FRAG = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uTexel; // 1 / SOURCE size
  varying vec2 vUv;
  void main() {
    vec2 h = uTexel;
    vec3 c = texture2D(tSrc, vUv).rgb * 4.0
           + texture2D(tSrc, vUv + vec2(-h.x, -h.y)).rgb
           + texture2D(tSrc, vUv + vec2( h.x, -h.y)).rgb
           + texture2D(tSrc, vUv + vec2(-h.x,  h.y)).rgb
           + texture2D(tSrc, vUv + vec2( h.x,  h.y)).rgb;
    gl_FragColor = vec4(c * 0.125, 1.0);
  }
`;

// Temporal smoothing: mix this frame's finished glow with the previous
// frame's (ping-pong pair). A distant bulb covers <1 glow-buffer pixel and
// blinks as the camera moves it across pixel centres; one frame of feedback
// turns that blink into a steady soft glow (and the ~65ms lag is invisible
// on a light).
const GLOW_BLEND_FRAG = /* glsl */ `
  uniform sampler2D tCur;
  uniform sampler2D tPrev;
  uniform float uFeedback;
  varying vec2 vUv;
  void main() {
    gl_FragColor = vec4(
      mix(texture2D(tCur, vUv).rgb, texture2D(tPrev, vUv).rgb, uFeedback), 1.0);
  }
`;

// Dual-Kawase UP + accumulate: the 8-tap tent upsample of the level below,
// plus the same-resolution down level (tAdd) — walking back up the chain
// sums every blur scale, exactly like bloom's upsample-accumulate.
const GLOW_UP_FRAG = /* glsl */ `
  uniform sampler2D tSrc;  // lower-res level being upsampled
  uniform sampler2D tAdd;  // same-res down level to accumulate onto
  uniform vec2 uTexel;     // 1 / SOURCE (lower-res) size
  varying vec2 vUv;
  void main() {
    vec2 h = uTexel;
    vec3 c = (texture2D(tSrc, vUv + vec2(-2.0 * h.x, 0.0)).rgb
            + texture2D(tSrc, vUv + vec2( 2.0 * h.x, 0.0)).rgb
            + texture2D(tSrc, vUv + vec2(0.0, -2.0 * h.y)).rgb
            + texture2D(tSrc, vUv + vec2(0.0,  2.0 * h.y)).rgb
            + 2.0 * (texture2D(tSrc, vUv + vec2(-h.x, -h.y)).rgb
                   + texture2D(tSrc, vUv + vec2( h.x, -h.y)).rgb
                   + texture2D(tSrc, vUv + vec2(-h.x,  h.y)).rgb
                   + texture2D(tSrc, vUv + vec2( h.x,  h.y)).rgb)) / 12.0;
    gl_FragColor = vec4(c + texture2D(tAdd, vUv).rgb, 1.0);
  }
`;

// The threshold blit (glow buffer A → mip buffer B): bloom's luminance
// pre-pass, run at the glow buffer's own (half) resolution. Soft knee ≈
// luminanceSmoothing — cuts the dim lit-surface residue of the tagged
// meshes, keeps every actual emitter.
const GLOW_THRESH_FRAG = /* glsl */ `
  uniform sampler2D tSrc;
  uniform float uThreshold;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tSrc, vUv).rgb;
    float l = max(c.r, max(c.g, c.b));
    gl_FragColor = vec4(c * smoothstep(uThreshold * 0.6, uThreshold, l), 1.0);
  }
`;

function fullscreenTri(mat: THREE.ShaderMaterial) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
  );
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

// Overlay singleton, built once per session (module-level like modeEnvCache
// so the useFrame writes below stay off hook-held objects). The rig
// adds/removes it from the scene per mount.
let glowOverlay: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial } | null = null;
function getGlowOverlay() {
  if (glowOverlay) return glowOverlay;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tGlow: { value: null },
      uIntensity: { value: 0 },
    },
    vertexShader: GLOW_OVERLAY_VERT,
    fragmentShader: GLOW_OVERLAY_FRAG,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    fog: false,
  });
  const mesh = fullscreenTri(mat);
  mesh.renderOrder = 10000; // after every scene object, incl. transparents
  mesh.visible = false;
  glowOverlay = { mesh, mat };
  return glowOverlay;
}

// Blit-pass singletons (threshold / Kawase down / Kawase up): each a
// one-triangle scene + material, reused for every pass of its kind per
// frame (uniform writes between renders).
type BlitPass = { scene: THREE.Scene; mat: THREE.ShaderMaterial };
const blitCache = new Map<string, BlitPass>();
function getBlit(key: string, fragment: string, uniforms: Record<string, THREE.IUniform>) {
  let pass = blitCache.get(key);
  if (pass) return pass;
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: GLOW_OVERLAY_VERT,
    fragmentShader: fragment,
    depthTest: false,
    depthWrite: false,
    fog: false,
  });
  const scene = new THREE.Scene();
  scene.add(fullscreenTri(mat));
  pass = { scene, mat };
  blitCache.set(key, pass);
  return pass;
}
const getGlowThresh = () =>
  getBlit("thresh", GLOW_THRESH_FRAG, { tSrc: { value: null }, uThreshold: { value: 0.75 } });
const getGlowDown = () =>
  getBlit("down", GLOW_DOWN_FRAG, {
    tSrc: { value: null },
    uTexel: { value: new THREE.Vector2() },
  });
const getGlowUp = () =>
  getBlit("up", GLOW_UP_FRAG, {
    tSrc: { value: null },
    tAdd: { value: null },
    uTexel: { value: new THREE.Vector2() },
  });
// 0.82 feedback ≈ a 5–6-frame smoothing tail (~90ms at 60fps): the dollhouse
// camera never fully rests (idle drift), so a distant bulb crosses buffer
// pixel centres every frame — 0.65's ~3-frame tail still let that read as a
// constant blink on venues whose bulbs are tiny on screen (the memorial's
// flood poles). The extra lag is invisible on a light.
const getGlowBlend = () =>
  getBlit("blend", GLOW_BLEND_FRAG, {
    tCur: { value: null },
    tPrev: { value: null },
    uFeedback: { value: 0.82 },
  });

const glowPrevClearColor = new THREE.Color();

// Occluder override for the glow pre-pass: the whole scene renders BLACK
// (with depth) into the glow buffer before the emissives draw depth-tested
// on top — a lamp behind a wall stays black instead of hazing through it,
// matching how real bloom (which sees the whole frame) occludes. The pass
// is trivial per-fragment; its cost is one extra half-res geometry pass.
// polygonOffset pushes the occluders' HALF-RES depth slightly away from the
// camera: an emissive bulb nested in its own housing otherwise LOSES the
// quantised depth tie on some frames and not others while the camera moves —
// the halo pops on/off ("the lights blink"). The bias makes the emitter win
// against its own fixture every frame; a lamp truly behind a wall is metres
// behind it, far beyond this epsilon, so occlusion still holds.
const glowBlackMat = new THREE.MeshBasicMaterial({
  color: 0x000000,
  fog: false,
  polygonOffset: true,
  polygonOffsetFactor: 2,
  polygonOffsetUnits: 4,
});

/**
 * LiteGlow — the /lighting-lite bloom: a GLOW BUFFER (the pre-composer
 * selective-bloom technique) instead of fullscreen postprocessing.
 *
 * Per frame in Dusk/Night, the scene's glow SOURCES — the same boosted
 * lamp/screen materials the main route's bloom threshold picks out — are
 * re-rendered through the camera into a small offscreen target (½ of the
 * canvas per axis, so ~¼ of the pixels; three auto-builds its mip chain).
 * One additive fullscreen triangle then sums four soft-knee-thresholded mip
 * taps of that buffer over the finished frame: the real image of the
 * emissives, blurred at four scales — so EVERY source gets its own halo
 * following its actual SHAPE (screens spill along their edges, lamp banks
 * glow as banks), which no sprite fake can do. Known trade-off: non-glowing geometry isn't drawn into the buffer,
 * so a source behind a wall can faintly haze through it (rendering the
 * occluders black would fix that at the cost of a second full-geometry
 * pass — the exact cost this route avoids). Versus the composer's bloom this
 * skips everything fullscreen: the main render stays on the native
 * framebuffer (MSAA + native tone mapping intact) and the only added GPU
 * work is a tiny re-render of a few dozen tagged meshes + one cheap blit.
 *
 * The rig's budget rules hold: tagging meshes into GLOW_LAYER re-runs only
 * on mode/venue changes (a traverse + layer-bit writes, no recompiles — and
 * lights join the layer so no material compiles a second program variant);
 * Day renders nothing and hides the overlay, exactly like bloom-at-0.
 */
function LiteGlow() {
  const getThree = useThree((s) => s.get);
  const size = useThree((s) => s.size);
  const worldVersion = useWorldStore((s) => s.version);
  const mode = useLightingStore((s) => s.environment);

  const rtARef = useRef<THREE.WebGLRenderTarget | null>(null);
  // The bloom pyramid: T (thresholded, ½ res) → D1..D3 (Kawase downs) →
  // U2..U0 (Kawase up + accumulate; U0 is what the overlay composites).
  const chainRef = useRef<{ rt: THREE.WebGLRenderTarget; w: number; h: number }[] | null>(null);
  // Tags depend on what the emissive/venue effects touched, and those run
  // AFTER this child's effects on the same commit — so effects only mark
  // dirty, and the retag itself happens in useFrame (after all effects).
  const tagsDirty = useRef(true);
  useEffect(() => {
    tagsDirty.current = true;
  }, [mode, worldVersion]);

  // Overlay mount + tag cleanup.
  useEffect(() => {
    const scene = getThree().scene;
    const { mesh } = getGlowOverlay();
    scene.add(mesh);
    return () => {
      mesh.visible = false;
      scene.remove(mesh);
      scene.traverse((o) => o.layers.disable(GLOW_LAYER));
    };
  }, [getThree]);

  // Glow buffers, rebuilt on canvas resize. The source render is ½ of the
  // CSS size per axis (the same scale as the main route's halved bloom
  // luminance pass — any smaller and a distant lamp bulb bilinear-averages
  // toward black and loses its halo). HalfFloatType everywhere — the same
  // HDR headroom the composer's frame buffer gives real bloom: render-target
  // renders skip tone mapping, so a boosted lamp lands here at its LINEAR
  // emissive value (6+ at night); 8-bit would clamp that to 1.0 and small
  // halos would round to invisible.
  // Fixed allocation DPR: match the drawing buffer (a distant bulb must not
  // shrink below a buffer pixel — subpixel sources blink while the camera
  // moves), but ignore AdaptivePerf's temporary drag-time DPR drops so the
  // targets don't reallocate mid-gesture.
  const [glowDpr] = useState(() =>
    Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 1.5),
  );
  const flipRef = useRef(0);
  // Change detection for the freeze/throttle in useFrame below.
  const prevCamM = useRef(new THREE.Matrix4());
  const prevProjM = useRef(new THREE.Matrix4());
  const prevGlowState = useRef({ i: -1, t: -1 });
  const quietFrames = useRef(0);
  const frameNo = useRef(0);
  useEffect(() => {
    const opts: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    };
    const w = Math.max(64, Math.round((size.width * glowDpr) / 2));
    const h = Math.max(64, Math.round((size.height * glowDpr) / 2));
    const rtA = new THREE.WebGLRenderTarget(w, h, opts);
    rtARef.current = rtA;
    getGlowThresh().mat.uniforms.tSrc.value = rtA.texture;
    // Pyramid levels: [T(½), D1(¼), D2(⅛), D3(1/16), U2(⅛), U1(¼), U0(½),
    // S0(½), S1(½)] — S0/S1 are the temporal-smoothing ping-pong pair.
    // Every blit target is tiny and depthless.
    const level = (div: number) => {
      const lw = Math.max(8, Math.round(w / div));
      const lh = Math.max(8, Math.round(h / div));
      return { rt: new THREE.WebGLRenderTarget(lw, lh, { ...opts, depthBuffer: false }), w: lw, h: lh };
    };
    const chain = [
      level(1), level(2), level(4), level(8),
      level(4), level(2), level(1),
      level(1), level(1),
    ];
    chainRef.current = chain;
    getGlowOverlay().mat.uniforms.tGlow.value = chain[7].rt.texture;
    quietFrames.current = 0; // fresh (empty) buffers — the freeze must not hold
    return () => {
      rtARef.current = null;
      chainRef.current = null;
      rtA.dispose();
      for (const l of chain) l.rt.dispose();
    };
  }, [size, glowDpr]);

  useFrame(() => {
    const { gl, scene, camera } = getThree();
    const overlay = getGlowOverlay();
    const rtA = rtARef.current;
    const chain = chainRef.current;
    // Animated by SunCycle: the glow fades in/out with the lamp phase of a
    // mode transition instead of popping (0 on settled Day → skip fully).
    const intensity = modeAnim.bloomIntensity;
    if (intensity <= 0.004 || !rtA || !chain) {
      overlay.mesh.visible = false;
      return;
    }
    if (tagsDirty.current) {
      tagsDirty.current = false;
      quietFrames.current = 0;
      retagGlowLayer(scene);
    }

    // The glow sources and occluders are STATIC scenery: when neither the
    // camera nor the lamp state has changed, re-rendering the whole chain
    // (incl. the full-geometry occluder pass — the expensive one) produces
    // the same buffer. Freeze it: keep compositing the last smoothed buffer
    // for free — the route's idle GPU cost drops to the raw scene. A
    // generous settle window lets the temporal blend converge first. (No
    // update throttling while moving — a skipped frame doubles the halos'
    // step size, which reads as flicker, the exact thing being fixed.)
    frameNo.current++;
    const s = prevGlowState.current;
    const unchanged =
      s.i === intensity &&
      s.t === modeAnim.bloomThreshold &&
      prevCamM.current.equals(camera.matrixWorld) &&
      prevProjM.current.equals(camera.projectionMatrix);
    quietFrames.current = unchanged ? quietFrames.current + 1 : 0;
    prevCamM.current.copy(camera.matrixWorld);
    prevProjM.current.copy(camera.projectionMatrix);
    s.i = intensity;
    s.t = modeAnim.bloomThreshold;
    if (quietFrames.current > 30) {
      overlay.mesh.visible = true;
      overlay.mat.uniforms.uIntensity.value = intensity * 0.35;
      return;
    }

    // 1) Render buffer A through the live camera in two passes:
    //    a) the WHOLE scene black (glowBlackMat override) — writes the
    //       occluders' depth, so lamps behind walls stay dark (no glow
    //       bleeding through geometry);
    //    b) the GLOW_LAYER emissives, depth-tested against (a), drawn in
    //       their real colours.
    // Everything swapped here is restored before r3f's own render; the
    // baked sprites/pools hide for both passes (they must not enter the
    // glow input), shadow maps don't re-render, the overlay is hidden.
    overlay.mesh.visible = false;
    const bakedGroup = bakedFixturesGroup.current;
    const prevBakedVisible = bakedGroup?.visible ?? false;
    if (bakedGroup) bakedGroup.visible = false;
    const prevMask = camera.layers.mask;
    const prevBg = scene.background;
    const prevOverride = scene.overrideMaterial;
    const prevShadowAuto = gl.shadowMap.autoUpdate;
    const prevAutoClear = gl.autoClear;
    gl.getClearColor(glowPrevClearColor);
    const prevClearAlpha = gl.getClearAlpha();
    scene.background = null;
    gl.shadowMap.autoUpdate = false;
    gl.setClearColor(0x000000, 0);
    // (a) occluders
    scene.overrideMaterial = glowBlackMat;
    gl.autoClear = true;
    gl.setRenderTarget(rtA);
    gl.render(scene, camera);
    // (b) emissives, keeping (a)'s depth
    scene.overrideMaterial = prevOverride;
    camera.layers.set(GLOW_LAYER);
    gl.autoClear = false;
    gl.render(scene, camera);
    gl.autoClear = true;
    camera.layers.mask = prevMask; // blit triangles live on layer 0
    if (bakedGroup) bakedGroup.visible = prevBakedVisible;

    // 2) The bloom pyramid, all tiny blits: threshold (BEFORE the blur, like
    // bloom's luminance pre-pass) → dual-Kawase downs → up + accumulate.
    const [T, D1, D2, D3, U2, U1, U0, S0, S1] = chain;
    const thresh = getGlowThresh();
    thresh.mat.uniforms.uThreshold.value = modeAnim.bloomThreshold;
    gl.setRenderTarget(T.rt);
    gl.render(thresh.scene, camera);

    const down = getGlowDown();
    for (const [src, dst] of [
      [T, D1],
      [D1, D2],
      [D2, D3],
    ] as const) {
      down.mat.uniforms.tSrc.value = src.rt.texture;
      (down.mat.uniforms.uTexel.value as THREE.Vector2).set(1 / src.w, 1 / src.h);
      gl.setRenderTarget(dst.rt);
      gl.render(down.scene, camera);
    }

    const up = getGlowUp();
    for (const [src, add, dst] of [
      [D3, D2, U2],
      [U2, D1, U1],
      [U1, T, U0],
    ] as const) {
      up.mat.uniforms.tSrc.value = src.rt.texture;
      up.mat.uniforms.tAdd.value = add.rt.texture;
      (up.mat.uniforms.uTexel.value as THREE.Vector2).set(1 / src.w, 1 / src.h);
      gl.setRenderTarget(dst.rt);
      gl.render(up.scene, camera);
    }

    // 3) Temporal smoothing (see GLOW_BLEND_FRAG): mix into the ping-pong
    // pair and composite the smoothed buffer.
    const cur = flipRef.current === 0 ? S0 : S1;
    const prev = flipRef.current === 0 ? S1 : S0;
    flipRef.current ^= 1;
    const blend = getGlowBlend();
    blend.mat.uniforms.tCur.value = U0.rt.texture;
    blend.mat.uniforms.tPrev.value = prev.rt.texture;
    gl.setRenderTarget(cur.rt);
    gl.render(blend.scene, camera);
    overlay.mat.uniforms.tGlow.value = cur.rt.texture;

    gl.setRenderTarget(null);
    gl.setClearColor(glowPrevClearColor, prevClearAlpha);
    gl.autoClear = prevAutoClear;
    gl.shadowMap.autoUpdate = prevShadowAuto;
    scene.background = prevBg;

    overlay.mesh.visible = true;
    // The up-accumulate sums ~4 blur scales — scale down to bloom's level.
    overlay.mat.uniforms.uIntensity.value = intensity * 0.35;
  });

  return null;
}

/**
 * `post={false}` (the /lighting-lite route) drops the EffectComposer entirely
 * for weak devices: the canvas's own MSAA + the renderer's native Neutral
 * tone mapping take over (both already configured in CanvasWithWrapper), and
 * the per-mode exposure write below drives gl.toneMappingExposure directly.
 * Every LIGHT in the recipe — sun/ambient override, mode-sky environment,
 * hemi fill, fixtures, emissive boosts, fog, sky dome — is scene lighting,
 * not post, so it applies identically. The dropped chain's stand-ins: the
 * grade is baked into the scene recipe itself (the ENV_MODES `lite` fill
 * values swapped in below), the vignette is a static LiteFx DOM gradient
 * (rasterised once — no per-frame filter work), and bloom becomes LiteGlow's
 * glow buffer — a half-resolution re-render of just the emissive meshes,
 * composited by one additive triangle, instead of any fullscreen pipeline.
 */
export default function LightingRig({
  post = true,
  baked = false,
}: {
  post?: boolean;
  /** Baked stand-ins (see the LITE_* note above): clustered halo/spill
   *  sprites + ground pools instead of real fixture lights. noPost only. */
  baked?: boolean;
}) {
  const bakedFixtures = baked || LITE_BAKED_FIXTURES;
  // Read renderer/scene through the store getter (not hook return values) so
  // the imperative writes below satisfy the compiler's immutability rule.
  const getThree = useThree((s) => s.get);
  const { floors, activeFloorIndex, phase } = useInteriorInline();
  const venueKey = floors[activeFloorIndex]?.id;

  const mode = useLightingStore((s) => s.environment);
  const M = ENV_MODES[mode];
  // (/lighting-lite: no composer means no grade pass — the mode's `lite`
  // fill values stand in, lower ambient/hemi deepening shadows the way the
  // grade's contrast term did. Both halves are SunCycle animation targets.)
  const [lowPower] = useState(() => isLowPower());
  const composerRef = useRef<EffectComposerImpl | null>(null);

  // Bumped on every model load (bounds publish) — re-runs the scene-dependent
  // effects once the new venue's meshes are actually in the tree.
  const worldVersion = useWorldStore((s) => s.version);

  // ── Venue-lighting override + exposure + window backdrop: animated by
  //    <SunCycle/> (mounted below) — the mode's ABSOLUTE sun values are still
  //    the targets (same models + same physical light units ⇒ same settled
  //    result as viewer.html), but a mode switch now SWEEPS the sun there in
  //    real time, and SceneLights re-renders its frozen shadow map along the
  //    way so the shadows travel with it. ─────────────────────────────────────

  // ── Environment swap — the viewer's applyMode() regenerates
  //    scene.environment from the mode's SKY (pmrem.fromScene(sky)); at dusk
  //    that sunset-sky env is the dominant warm fill, at night it's the dark
  //    sky. A texture can't crossfade, so the swap is CHOREOGRAPHED instead
  //    of instant: SunCycle dips the env fill through the transition and
  //    flips modeAnim.envMode at the t=0.5 trough — the useFrame below
  //    applies it there (and hides the clouds/day-backdrop with it), where
  //    it reads as dusk falling rather than the whole scene jerking at click
  //    time. Each mode's env is baked ONCE (getModeEnv), the app's HDR is
  //    re-captured/restored around it, and drei <Environment> re-asserts
  //    (venue loads) are healed by the per-frame pointer check. ──────────────
  const envApplied = useRef<{ tex: THREE.Texture | null; prevEnv: THREE.Texture | null }>({
    tex: null,
    prevEnv: null,
  });
  useEffect(() => {
    return () => {
      // Unmount: put the venue HDR back if one of our mode envs is live.
      const sc = getThree().scene;
      const a = envApplied.current;
      if (sc.environment && modeEnvTextures.has(sc.environment) && a.prevEnv)
        sc.environment = a.prevEnv;
      a.tex = null;
      a.prevEnv = null;
      useLightsStore.getState().setCloudsHidden(false);
    };
  }, [getThree]);

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
    // Baked path: the fixtures are LiteBakedLights' sprites instead —
    // mounting zero real lights here also means every scene program compiles
    // WITHOUT the per-fixture lighting term (the cheapest fragments).
    if (!post && bakedFixtures) return;
    const bounds = useWorldStore.getState().bounds;
    if (!bounds) return;
    const scene = getThree().scene;

    const { jmin, jc, jdiag, s, map } = jsonSpaceMap(venueJson, bounds);
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

    // Land at the current animated value right away; the per-frame apply
    // below (modeAnim.fixtureMul) takes over from the next frame.
    for (const fx of created) fx.light.intensity = fx.base * modeAnim.fixtureMul;

    liveFixtures = created;
    return () => {
      liveFixtures = [];
      for (const fx of created) scene.remove(fx.light);
      scene.remove(target);
    };
  }, [getThree, venueJson, lowPower, worldVersion, post, bakedFixtures]);

  // ── Venue material recipe (VENUE_MAT_MODES — the SoFi package viewer's
  //    screens/field-glow groups). Claimed ONCE per venue/model load, like the
  //    fixture lights: `useBaseMap` mats get emissiveMap = their base map here
  //    (the one-time USE_EMISSIVEMAP program change lands during load, hidden
  //    by the blackout) and KEEP it across mode switches — a switch only
  //    writes emissiveIntensity, so no shader ever recompiles. Must run BEFORE
  //    the generic emissiveMul pass below (source order): that pass skips
  //    everything claimed in venueTunedSet. ──────────────────────────────────
  // Per-mode target for a venue-recipe material (see TunedMat.screen for the
  // no-composer screen boost). Day (no per-mode entry) = the authored value.
  const tunedTarget = (t: TunedMat, m: LightingMode) => {
    const v = t.intensity[m];
    if (v === undefined) return t.base.int;
    return t.screen && !post ? v * LITE_SCREEN_MUL : v;
  };

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
          screen: !recipe.useBaseMap,
          from: 0,
          to: 0,
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
    // A venue load lands directly in the CURRENT mode — no animation.
    const cur = useLightingStore.getState().environment;
    for (const t of found) {
      const target = tunedTarget(t, cur);
      t.mat.emissiveIntensity = target;
      t.from = t.to = target;
    }
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

  // ── Emissive lamp/screen boost (the viewer's lampMats pass) — CLAIMED once
  //    per venue/model load, mode-independent: every qualifying material is
  //    collected in EVERY mode (Day included) so a later mode switch is pure
  //    intensity animation, no traverse. Colourless lamps get their warm
  //    colour here with intensity 0 — warm × 0 ≡ the authored black emissive,
  //    so the Day look is untouched. ─────────────────────────────────────────
  useEffect(() => {
    const restore = () => {
      for (const [m, b] of touchedMats) {
        m.emissive.copy(b.col);
        m.emissiveIntensity = b.int;
      }
      touchedMats.clear();
    };
    restore();

    const lampNames = new Set(venueJson?.lampNames ?? []);
    const cur = useLightingStore.getState().environment;
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
        const entry: EmissiveBackup = {
          col: m.emissive.clone(),
          int: m.emissiveIntensity ?? 1,
          lamp: isLamp,
          dark: isLamp && baseSum < 0.02,
          from: 0,
          to: 0,
        };
        // Lamps whose material carries no emissive colour glow warm (viewer
        // fallback); everything else keeps its own colour, just boosted.
        if (entry.dark) m.emissive.setRGB(1, 0.82, 0.5);
        // A venue load lands directly in the CURRENT mode — no animation.
        const target = emissiveTarget(entry, cur);
        m.emissiveIntensity = target;
        entry.from = entry.to = target;
        touchedMats.set(m, entry);
      }
    });
    return restore;
  }, [getThree, venueJson, worldVersion]);

  // ── Mode switch = capture transition endpoints; SunCycle's lampK then
  //    carries every one of these from→to in the useFrame below, staggered
  //    like real lights (on after sundown, off before sunrise). ──────────────
  useEffect(() => {
    for (const [m, e] of touchedMats) {
      e.from = m.emissiveIntensity;
      e.to = emissiveTarget(e, mode);
    }
    for (const t of venueTunedMats) {
      t.from = t.mat.emissiveIntensity;
      t.to = tunedTarget(t, mode);
    }
  }, [mode]);

  // ── The per-frame apply: everything lamp-ish follows modeAnim (written by
  //    SunCycle) — plain uniform/value writes on a few dozen objects — and
  //    the env swap lands the frame modeAnim.envMode flips (midpoint). ───────
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  useFrame(() => {
    const k = modeAnim.lampK;
    for (const fx of liveFixtures) fx.light.intensity = fx.base * modeAnim.fixtureMul;
    for (const [m, e] of touchedMats) m.emissiveIntensity = e.from + (e.to - e.from) * k;
    for (const t of venueTunedMats) t.mat.emissiveIntensity = t.from + (t.to - t.from) * k;
    if (hemiRef.current) hemiRef.current.intensity = modeAnim.hemiIntensity;

    const { gl, scene } = getThree();
    const want = modeAnim.envMode;
    const a = envApplied.current;
    // Day → null (venue HDR); dusk/night → the baked mode sky. The pointer
    // check also heals a drei <Environment> re-assert after a venue load.
    const wantTex = ENV_MODES[want].lights ? getModeEnv(gl, want) : null;
    if (wantTex !== a.tex || (wantTex && scene.environment !== wantTex)) {
      if (wantTex) {
        if (scene.environment && !modeEnvTextures.has(scene.environment))
          a.prevEnv = scene.environment; // capture the venue HDR to restore
        scene.environment = wantTex;
      } else {
        if (scene.environment && modeEnvTextures.has(scene.environment) && a.prevEnv)
          scene.environment = a.prevEnv;
      }
      a.tex = wantTex;
      // Clouds/day-backdrop are a daytime read — flip with the env, at the
      // trough, not at click time.
      useLightsStore.getState().setCloudsHidden(!!wantTex);
    }
  });

  // Composer children. The COMPOSER itself never unmounts (it forces
  // NoToneMapping on the renderer while mounted; toggling that would
  // recompile every scene material — the slow switches). Its CHILD passes are
  // cheap to swap though, so bloom AND the M.fx cinematic set (grade,
  // vignette) exist only in Dusk/Night — Day pays zero effect cost beyond
  // SMAA + the tone-map composite and keeps matching /. The chain compiles to
  // the ez-tree demo's exact pass layout — RenderPass + SMAAPass + ONE
  // composite EffectPass: every non-convolution child below (bloom composite,
  // grade, vignette, tone map) merges into that single fullscreen shader, so
  // the whole cinematic set is a few ALU ops, not passes. The only real
  // per-frame additions in Dusk/Night are bloom's internals — a half-res
  // luminance pre-pass (halveBloomLuminance) + the geometrically-shrinking
  // mip chain.
  const passes = [];
  // (post={false} skips the whole chain — the canvas's native MSAA and the
  // renderer's own Neutral tone mapping stand in; see the header note.)
  // SMAA in EVERY mode — it IS the antialiasing (the ez-tree demo's swap):
  // the composer runs with multisampling 0, so instead of a multisampled
  // offscreen buffer + per-frame resolve (the expensive part, especially on
  // mobile GPUs) edges are cleaned by this post effect at a flat ~1ms at the
  // capped DPR. Permanent so Day's edge quality never changes on a switch.
  // SMAA is a CONVOLUTION effect so it always compiles into its OWN pass —
  // exactly the demo's dedicated SMAAPass; everything below it merges. LOW
  // preset on weak devices trims the weight-search steps in its two internal
  // full-res passes (same pass count, cheaper fragments).
  passes.push(<SMAA key="smaa" preset={lowPower ? SMAAPreset.LOW : SMAAPreset.MEDIUM} />);
  if (M.bloom) {
    passes.push(
      <Bloom
        key="bloom"
        ref={halveBloomLuminance}
        mipmapBlur
        intensity={M.bloom.intensity}
        luminanceThreshold={M.bloom.threshold}
        luminanceSmoothing={0.2}
        radius={M.bloom.radius}
      />,
    );
  }
  if (M.fx) {
    passes.push(
      <BrightnessContrast key="grade-bc" brightness={0} contrast={M.fx.grade.contrast} />,
      <HueSaturation key="grade-hs" hue={0} saturation={M.fx.grade.saturation} />,
      <Vignette
        key="vignette"
        eskil={false}
        offset={M.fx.vignette.offset}
        darkness={M.fx.vignette.darkness}
      />,
    );
  }
  passes.push(<ToneMapping key="tonemap" mode={ToneMappingMode.NEUTRAL} />);

  return (
    <>
      {/* Real-time sun sweep: eases the mode's sun direction/colour/intensity,
          fill, exposure and backdrop dim over ~2.5s per mode switch; the frozen
          shadow map re-renders each frame of the sweep (see SunCycle). */}
      <SunCycle post={post} />
      {/* Twilight / moonlight hemisphere fill — ALWAYS mounted (constant light
          count); its intensity is animated per frame from modeAnim (SunCycle's
          sun phase — Day fades it to 0). Colours via props, not args, so a
          mode change mutates the light instead of recreating it. */}
      <hemisphereLight
        ref={hemiRef}
        color={M.hemi?.sky ?? "#5a4a6a"}
        groundColor={M.hemi?.ground ?? "#241e24"}
        intensity={0}
      />
      {/* Dusk/night sky dome — FIRST PERSON ONLY: the dollhouse keeps its
          black isolated-object backdrop in every mode (the lighting effect
          still applies there); entering first person eases the selected sky
          in, leaving eases it back out. ALWAYS mounted (the ez-tree Skybox
          pattern — one dome, mode switches write uniforms); Day just fades
          it out — its blue sky stays the existing BackgroundFade ease on
          first-person entry. */}
      <FadingSky preset={M.sky} active={phase === "firstPerson"} />
      {/* Dusk/night depth haze — in-material FogExp2, zero passes (see
          ModeFog). Mounted always; Day just eases its density to 0. */}
      <ModeFog fx={M.fx} active={phase === "firstPerson"} />
      {/* noPost default: NO bloom, real lights (it IS /lighting minus the
          composer). `baked` swaps in the sprite/pool stand-ins instead.
          NOTE the baked path mounts NO LiteGlow any more — its per-frame
          scene re-render (the occluder pass) was the route's whole remaining
          GPU cost and read as lag; the spill sprites alone carry the halo.
          LITE_GLOW still forces it on for experiments. */}
      {!post && LITE_GLOW && <LiteGlow />}
      {!post && bakedFixtures && <LiteBakedLights venueJson={venueJson} />}
      {/* Interaction-adaptive resolution: halves DPR while dragging/zooming,
          restores after the gesture. COMPOSER ROUTES ONLY — with no
          fullscreen passes the lite route doesn't need it, and its DPR drop
          reads as the scene going blurry on every rotate. */}
      {post && <AdaptivePerf composer={composerRef} />}
      {/* Permanently-enabled composer (see the passes note): the scene
          renders linear into its buffer, then the final ToneMapping pass
          applies the SAME Khronos Neutral curve + exposure the app's renderer
          uses — so Day matches / visually while mode switches never touch a
          scene shader. Mounted on EVERY device so the dusk/night bloom halos
          match across desktop and mobile. multisampling 0 on EVERY device:
          the permanent SMAA pass replaces MSAA (the ez-tree swap), dropping
          the multisampled offscreen buffer + per-frame resolve entirely —
          Day's overhead is the SMAA composite + one tone-map blit. */}
      {post && (
        <EffectComposer ref={composerRef} multisampling={0}>
          {passes}
        </EffectComposer>
      )}
    </>
  );
}
