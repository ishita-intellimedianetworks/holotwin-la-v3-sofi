import type { WorldBounds } from "../shared/store/world-store";
import type { LightingMode } from "./view-store";

/**
 * Day / Dusk / Night environment modes for /lighting — ported from the
 * LA_Models_delivery viewer's MODES table (viewer.html).
 *
 * Day is the app's untouched current look. Dusk/Night reproduce the viewer's
 * recipe: its exposure, the venue's authored lighting scaled/re-aimed (via
 * the lights-store override), a twilight or moonlight hemisphere fill, a
 * physical sky dome with the viewer's turbidity/rayleigh/sun position, the
 * auto-detected light fixtures as real spot/point lights, boosted emissive
 * lamp materials, and the mode-coupled bloom pass.
 *
 * NOTE: tone mapping is NOT switched per mode (the viewer is ACES throughout,
 * the app Neutral throughout) — swapping it forces a full scene shader
 * recompile, a multi-second hitch on these models. The darker ambient/env
 * scales below compensate.
 */

export interface EnvMode {
  label: string;
  /** gl.toneMappingExposure — viewer values (1 = untouched). */
  exposure: number;
  /** The viewer's ABSOLUTE mode lighting, applied via the lights-store
   *  override (absent on Day → override stays null, the app's authored day
   *  rig renders). Same models + same physical light units + an env swapped
   *  to the mode's sky ⇒ same result as viewer.html, by construction. */
  lights?: {
    sunIntensity: number;
    sunColor: string;
    /** Sun direction in the viewer's mode (elevation/azimuth converted). */
    sunDirection: [number, number, number];
    ambientIntensity: number;
    /** scene.environmentIntensity for the PMREM'd mode sky (viewer: 1). */
    envIntensity: number;
  };
  /** Additive twilight/moonlight hemisphere fill (viewer's `hemi`). */
  hemi?: { sky: string; ground: string; intensity: number };
  /** Physical sky dome — sun BELOW/AT the horizon for the dusk/night colours.
   *  Absent on Day (the app's own backdrop stays). */
  sky?: { sunPosition: [number, number, number]; turbidity: number; rayleigh: number };
  /** scene.backgroundIntensity — dims the day-HDR panorama that interior
   *  floors show through their windows (texture backgrounds only; the
   *  exterior colour backdrop is untouched). 1 on Day. */
  backgroundIntensity?: number;
  /** Fixture-light intensity multiplier (0 = fixtures off / not mounted). */
  fixtureMul: number;
  /** Emissive lamp/screen material boost (1 = untouched). */
  emissiveMul: number;
  /** Mode-coupled bloom (viewer's bloom/thresh/radius). */
  bloom?: { intensity: number; threshold: number; radius: number };
  /** Dusk/Night-only cinematic pass set (absent on Day, which keeps matching /
   *  with just the final tone-map pass). SMAA + vignette + grade are merged by
   *  postprocessing into the same single fullscreen EffectPass as bloom, so
   *  the whole set costs one pass; fog is in-material (no pass at all). */
  fx?: {
    vignette: { offset: number; darkness: number };
    grade: { contrast: number; saturation: number };
    /** FogExp2 haze — density = k / venue bounding radius (scale-aware across
     *  the village/stadium world units); first-person only, eased with the
     *  sky-dome fade. Colour ≈ the mode dome's horizon. */
    fog?: { color: string; k: number };
  };
  /** /lighting-lite (post={false}) scene-side stand-in for `fx.grade`: with
   *  no composer there is no contrast pass, so the same read comes from the
   *  recipe's own uniform levers — the flat fill (ambient + hemisphere) drops
   *  so shadows deepen the way the grade's contrast term darkened them, while
   *  the emissives/fixtures keep the highlights. The grade's ±0.06–0.08
   *  saturation term has no scene-side equivalent, but at that size it
   *  doesn't read. Absent on Day (no grade to stand in for). */
  lite?: { ambientIntensity: number; hemiIntensity: number };
}

// Sun/sky directions from the viewer's (elevation°, azimuth°) pairs via
// setFromSphericalCoords(1, 90−elev, az):
//   dusk  elev 2.5, az 110 → [0.94,  0.044, −0.342]
//   night elev −7,  az 70  → [0.933, −0.122, 0.34]
// The night SUN direction is raised to a moon-height (+y) so the shadow-casting
// light still comes from above; the sky dome keeps the true below-horizon sun.
export const ENV_MODES: Record<LightingMode, EnvMode> = {
  day: {
    label: "Day",
    exposure: 1,
    fixtureMul: 0,
    emissiveMul: 1,
  },
  // Dusk/Night are the viewer's MODES values verbatim (sun/ambient/hemi and
  // exposure), not scaled versions of the app's day rig. Combined with the
  // PMREM'd mode sky as scene.environment (the rig swaps it, exactly like
  // the viewer's applyMode) the output matches the delivery previews — at
  // dusk that sunset-sky environment is the dominant warm fill.
  dusk: {
    label: "Dusk",
    exposure: 0.85,
    lights: {
      sunIntensity: 1.6,
      sunColor: "#ffb066",
      // The viewer's true dusk sun sits at 2.5° elevation (y 0.09) — at that
      // grazing angle every shadow is effectively infinite, the whole town is
      // inside one, and NO shadow reads on screen. Raised to ~13° (the sky
      // dome keeps the true horizon sun for the visuals): shadows stay long
      // and dramatic but visibly BAND the streets, and the sun sweep is
      // readable in real time.
      sunDirection: [0.94, 0.23, -0.34],
      ambientIntensity: 0.07,
      envIntensity: 1.0,
    },
    hemi: { sky: "#5a4a6a", ground: "#241e24", intensity: 0.32 },
    sky: { sunPosition: [0.94, 0.044, -0.342], turbidity: 6, rayleigh: 2.5 },
    backgroundIntensity: 0.35,
    fixtureMul: 1.0,
    emissiveMul: 3.0,
    // Bloom numbers are calibrated for postprocessing's mipmap bloom to match
    // the viewer's UnrealBloomPass halos — its `radius` is a different unit
    // (0..1 mip blend, default 0.85), so the viewer's 0.4/0.45 must NOT be
    // copied verbatim (that reads as a tight, weak glow).
    bloom: { intensity: 0.7, threshold: 0.75, radius: 0.7 },
    fx: {
      vignette: { offset: 0.3, darkness: 0.45 },
      grade: { contrast: 0.05, saturation: 0.06 },
      fog: { color: "#7a5a66", k: 0.35 },
    },
    // grade contrast +0.05 ≈ fill −~15%: ambient 0.07→0.055, hemi 0.32→0.29.
    lite: { ambientIntensity: 0.055, hemiIntensity: 0.29 },
  },
  // Night is the viewer's MODES values verbatim. Its grey-mauve night sky
  // (and the matching env fill) comes from the r161 sunfade pow-curve the
  // dome patch restores — see buildSkyDome.
  night: {
    label: "Night",
    exposure: 0.95,
    lights: {
      // Moon bumped from the viewer's 0.55 so moonlight visibly out-punches
      // the ambient+hemi fill — buildings cast readable blue moon-shadows
      // instead of the fill flattening them away.
      sunIntensity: 0.9,
      sunColor: "#53668f",
      sunDirection: [0.93, 0.55, 0.34],
      ambientIntensity: 0.11,
      envIntensity: 1.0,
    },
    hemi: { sky: "#33425f", ground: "#1a1e26", intensity: 0.3 },
    sky: { sunPosition: [0.933, -0.122, 0.34], turbidity: 10, rayleigh: 0.6 },
    backgroundIntensity: 0.12,
    fixtureMul: 1.5,
    emissiveMul: 6.0,
    bloom: { intensity: 1.25, threshold: 0.62, radius: 0.85 },
    fx: {
      vignette: { offset: 0.25, darkness: 0.6 },
      grade: { contrast: 0.08, saturation: -0.08 },
      fog: { color: "#151a28", k: 0.45 },
    },
    // grade contrast +0.08 ≈ fill −~20%: ambient 0.11→0.085, hemi 0.30→0.25.
    lite: { ambientIntensity: 0.085, hemiIntensity: 0.25 },
  },
};

/** Shape of /lights/{venue}_lights.json (from LA_Models_delivery). */
export interface VenueLightsJson {
  bbox: [number[], number[]];
  lampNames?: string[];
  fixtures: { x: number; y: number; z: number; col?: [number, number, number] }[];
}

/**
 * Affine map from the delivery JSON's bounding volume onto the live model's
 * (identical geometry → identity mapping). Shared by the rig's fixture lights
 * and the /lighting-lite baked fixture sprites.
 */
export function jsonSpaceMap(json: VenueLightsJson, bounds: WorldBounds) {
  const [jmin, jmax] = json.bbox;
  const jc = [(jmin[0] + jmax[0]) / 2, (jmin[1] + jmax[1]) / 2, (jmin[2] + jmax[2]) / 2];
  const jsize = [jmax[0] - jmin[0], jmax[1] - jmin[1], jmax[2] - jmin[2]];
  const jdiag = Math.hypot(jsize[0], jsize[1], jsize[2]);
  const s = bounds.radius / (jdiag / 2);
  const [cx, cy, cz] = bounds.center;
  return {
    jmin,
    jc,
    jdiag,
    s,
    map: (x: number, y: number, z: number): [number, number, number] => [
      cx + (x - jc[0]) * s,
      cy + (y - jc[1]) * s,
      cz + (z - jc[2]) * s,
    ],
  };
}

/**
 * Per-venue material recipe — the SoFi_Stadium_package viewer's mode-driven
 * material groups, matched by material NAME (its fieldMats/screenMats sets).
 * `intensity` is the ABSOLUTE emissiveIntensity per mode; undefined keeps the
 * material's authored value (Day = the app's untouched look). `useBaseMap`
 * marks the viewer's fieldMats prep: emissive forced WHITE, and the
 * base-colour map copied into emissiveMap once at venue load (`m.emissiveMap =
 * m.map`; untextured paints — the roof lettering — glow solid white instead).
 * Assigned permanently so a mode switch never flips a shader define (no
 * recompile), Day just drives the intensity to 0.
 */
export interface VenueMatRecipe {
  pattern: RegExp;
  useBaseMap?: boolean;
  intensity: Partial<Record<LightingMode, number>>;
}

export const VENUE_MAT_MODES: Record<string, VenueMatRecipe[]> = {
  stadium: [
    // Field glow — grass/pitch/paint self-illuminate at night (viewer's
    // setFieldGlow 0 / 0.2 / 0.95).
    {
      pattern: /grass|pitch|paint/i,
      useBaseMap: true,
      intensity: { day: 0, dusk: 0.2, night: 0.95 },
    },
    // LED boards / scoreboards / adboards — authored emissive (strength 3 in
    // the delivery GLB) driven to the viewer's setScreens 3.2 / 5.5; Day keeps
    // the authored value. These are handled HERE, not by the generic
    // emissiveMul pass (which would over-boost them: 3 × 6 at night).
    {
      pattern: /led|scoreboard|adboard/i,
      intensity: { dusk: 3.2, night: 5.5 },
    },
  ],
};
