"use client";

/**
 * SunCycle — the real-time transition driver behind the Day / Dusk / Night
 * switch: everything animates together, choreographed like a real sunset.
 *
 * Two phases run inside one SUN_ANIM_SEC timeline:
 *
 *   • SUN phase (full span): the sun's direction sweeps across the sky
 *     (day's high sun → dusk's western horizon → night's moon direction)
 *     while its colour/intensity, the ambient/env fill, the twilight/
 *     moonlight hemisphere, the exposure and the window-backdrop dim ride
 *     the same ease. Per-frame lights-store override writes make
 *     SceneLights re-fit the sun and re-render its frozen shadow map each
 *     frame — the shadows sweep and lengthen live, then freeze again.
 *
 *   • LAMP phase (staggered, written into `modeAnim` for the rig /
 *     LiteGlow / LiteBakedLights to apply): fixtures, emissive lamps and
 *     screens, bloom and the lite spill sprites. Day→Dusk/Night: the lamps
 *     wait until the sun is already low (t 0.45..1) — the street lights
 *     "come on" as it gets dark. →Day: the lamps go out early (t 0..0.55)
 *     while the sun climbs back. Dusk↔Night: both worlds are lit, so the
 *     lamp values just track the sun 1:1.
 *
 * Budget rules hold: every animated thing is a uniform/value write — no
 * light is mounted or unmounted, no tone mapping switch, no recompiles.
 * The per-frame shadow render (one depth pass) is the transition's only
 * real GPU cost — it lasts SUN_ANIM_SEC and ends; low-power devices run
 * the canvas with shadows off entirely, so they pay nothing extra.
 */

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { useLightsStore } from "../shared/store/lights-store";
import { modeAnim } from "./mode-anim";
import { ENV_MODES } from "./presets";
import { useLightingStore } from "./view-store";

// Long enough to read as a time-lapse sunset; the sky dome / fog eases
// (1.6s) finish inside it, so the whole mode change lands together.
const SUN_ANIM_SEC = 2.5;

// Day baseline if the venue hasn't seeded the lights-store yet (matches
// SceneLights' DEFAULT_LIGHTS — normally the seeded values win).
const DAY_FALLBACK = {
  sunIntensity: 7.9,
  sunColor: "#ffffff",
  sunDirection: [-1.5, 5.9, -2.6] as [number, number, number],
  ambientIntensity: 0.8,
  envIntensity: 0.65,
};

type SunState = {
  dir: THREE.Vector3;
  col: THREE.Color;
  sun: number;
  ambient: number;
  env: number;
  exposure: number;
  bg: number;
  hemi: number;
  fixtureMul: number;
  bloomI: number;
  bloomT: number;
};

const cloneState = (s: SunState): SunState => ({
  ...s,
  dir: s.dir.clone(),
  col: s.col.clone(),
});

// The venue's live day rig (its scenes.json lights resolved over the shared
// defaults — SceneLights seeds it for every venue, controls panel or not).
function dayBaseline(): SunState {
  const v = useLightsStore.getState().values ?? DAY_FALLBACK;
  return {
    dir: new THREE.Vector3(...v.sunDirection).normalize(),
    col: new THREE.Color(v.sunColor),
    sun: v.sunIntensity,
    ambient: v.ambientIntensity,
    env: v.envIntensity,
    exposure: 1,
    bg: 1,
    hemi: 0,
    fixtureMul: 0,
    bloomI: 0,
    bloomT: 0.75,
  };
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

export default function SunCycle({ post }: { post: boolean }) {
  const getThree = useThree((s) => s.get);
  const mode = useLightingStore((s) => s.environment);

  const cur = useRef<SunState | null>(null);
  const from = useRef<SunState | null>(null);
  const to = useRef<SunState | null>(null);
  const toIsDay = useRef(true);
  const toMode = useRef<typeof mode>("day");
  const fromLit = useRef(false);
  // The lamp phase's sub-window inside the sun timeline (see header).
  const lampWin = useRef<[number, number]>([0, 1]);
  const t = useRef(1); // 1 = settled, no per-frame work
  const first = useRef(true);

  // Retarget on every mode change, starting FROM the current animated state —
  // a switch mid-transition just bends the sun's path, no pop.
  useEffect(() => {
    const M = ENV_MODES[mode];
    const day = dayBaseline();
    // /lighting-lite: no composer means no grade pass — the mode's `lite`
    // ambient (deeper shadows) is the target instead.
    const liteFill = post ? undefined : M.lite;
    const target: SunState = M.lights
      ? {
          dir: new THREE.Vector3(...M.lights.sunDirection).normalize(),
          col: new THREE.Color(M.lights.sunColor),
          sun: M.lights.sunIntensity,
          ambient: liteFill?.ambientIntensity ?? M.lights.ambientIntensity,
          env: M.lights.envIntensity,
          exposure: M.exposure,
          bg: M.backgroundIntensity ?? 1,
          hemi: liteFill?.hemiIntensity ?? M.hemi?.intensity ?? 0,
          fixtureMul: M.fixtureMul,
          bloomI: M.bloom?.intensity ?? 0,
          bloomT: M.bloom?.threshold ?? (cur.current?.bloomT ?? 0.75),
        }
      : day;

    if (first.current) {
      first.current = false;
      cur.current = day;
      if (!M.lights) {
        // Booted on Day — settle immediately, nothing to animate.
        modeAnim.lampK = 1;
        modeAnim.fixtureMul = 0;
        modeAnim.bloomIntensity = 0;
        modeAnim.hemiIntensity = 0;
        modeAnim.envMode = "day";
        return;
      }
    }
    const toLit = !!M.lights;
    // Street-light realism: lights come ON once the sun is low, go OFF
    // while it rises; a lit↔lit switch tracks the sun the whole way.
    lampWin.current = toLit && !fromLit.current ? [0.45, 1] : !toLit && fromLit.current ? [0, 0.55] : [0, 1];
    from.current = cloneState(cur.current ?? day);
    to.current = target;
    toIsDay.current = !toLit;
    toMode.current = mode; // envMode flips to this at the midpoint (useFrame)
    fromLit.current = toLit;
    modeAnim.lampK = 0;
    t.current = 0;
  }, [mode, post]);

  // Restore the untouched day pipeline when the rig unmounts (route change).
  useEffect(() => {
    return () => {
      useLightsStore.getState().setOverride(null);
      const three = getThree();
      three.gl.toneMappingExposure = 1;
      three.scene.backgroundIntensity = 1;
    };
  }, [getThree]);

  useFrame((_, delta) => {
    if (t.current >= 1 || !from.current || !to.current || !cur.current) return;
    t.current = Math.min(1, t.current + delta / SUN_ANIM_SEC);
    const k = smoothstep(t.current);
    const [w0, w1] = lampWin.current;
    const lampK = smoothstep(clamp01((t.current - w0) / (w1 - w0)));
    const a = from.current;
    const b = to.current;
    const c = cur.current;

    // ── Sun phase ──
    // nlerp keeps the sun above the horizon along the whole day↔dusk arc.
    c.dir.copy(a.dir).lerp(b.dir, k).normalize();
    c.col.copy(a.col).lerp(b.col, k);
    c.sun = lerp(a.sun, b.sun, k);
    c.ambient = lerp(a.ambient, b.ambient, k);
    c.exposure = lerp(a.exposure, b.exposure, k);
    c.bg = lerp(a.bg, b.bg, k);
    c.hemi = lerp(a.hemi, b.hemi, k);

    // ── Environment choreography ──
    // scene.environment is a texture — it can't crossfade. Instead the env
    // FILL dips through the transition (twilight) and the texture swap
    // (modeAnim.envMode, applied by the rig) lands at the t=0.5 trough,
    // where the fill is ~25% and the swap reads as dusk falling instead of
    // the whole scene jerking at click time.
    c.env = lerp(a.env, b.env, k) * (1 - 0.75 * Math.sin(Math.PI * t.current));
    if (t.current >= 0.5) modeAnim.envMode = toMode.current;

    // ── Lamp phase (readers: view-rig useFrame, LiteGlow, LiteBakedLights) ──
    c.fixtureMul = lerp(a.fixtureMul, b.fixtureMul, lampK);
    c.bloomI = lerp(a.bloomI, b.bloomI, lampK);
    c.bloomT = lerp(a.bloomT, b.bloomT, lampK);
    modeAnim.lampK = lampK;
    modeAnim.fixtureMul = c.fixtureMul;
    modeAnim.bloomIntensity = c.bloomI;
    modeAnim.bloomThreshold = c.bloomT;
    modeAnim.hemiIntensity = c.hemi;

    const st = useLightsStore.getState();
    if (t.current >= 1 && toIsDay.current) {
      // Settled on Day → clear the override entirely so / and Day render
      // through the exact same untouched path as before.
      st.setOverride(null);
    } else {
      // Per-frame override write → SceneLights re-fits the sun + re-renders
      // its frozen shadow map this frame: the shadows sweep in real time.
      st.setOverride({
        sunIntensity: c.sun,
        sunColor: `#${c.col.getHexString()}`,
        sunDirection: [c.dir.x, c.dir.y, c.dir.z],
        ambientIntensity: c.ambient,
        envIntensity: c.env,
      });
    }
    const three = getThree();
    three.gl.toneMappingExposure = c.exposure;
    three.scene.backgroundIntensity = c.bg;
  });

  return null;
}
