"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  VENUE_FADE_IN_MS,
  useVenueContext,
} from "@/components/vr/data/venue-provider";
import { useVenueLoad } from "../load-progress";
import { LoadingPanel } from "../loading-panel";
import { FadeQuad, setFadeOpacity } from "./fade-quad";

/**
 * The black dip between venues — the ARCHVIZ reference's `VRBlackout`, brought
 * over: black fades in before the swap, holds while the next venue loads with
 * the loading line drawn on it, and fades away once the venue is drawing
 * steadily.
 *
 * The black itself is `./fade-quad`, drawn in screen space so a player moved
 * during the black can never see the scene through it for a frame.
 *
 * Mounted in the Canvas OUTSIDE the per-venue key, so it survives the swap it
 * is covering.
 */

/** Seconds. In matches the delay `switchVenue` waits before swapping. */
const FADE_IN = VENUE_FADE_IN_MS / 1000;
const FADE_OUT = 0.7;

/**
 * THE BLACK LIFTS ON STEADY FRAMES, NOT ON "LOADED".
 *
 * A venue that has loaded still has work to do the first time it is drawn —
 * shaders compiled, textures uploaded — and that arrives as a burst of long
 * frames, which a headset shows as flicker. So once it is ready its materials
 * are compiled and its textures uploaded while still black, and the black waits
 * for this many consecutive steady frames before fading.
 */
const STEADY_FRAMES = 24;
/** A frame this long or shorter counts as steady (72 Hz is 13.9 ms). */
const STEADY_FRAME_S = 1 / 45;
/** Never wait longer than this for steady frames. */
const SETTLE_MAX_S = 4;

/** Under the loading line and every panel (1000), over the whole venue. */
const RENDER_ORDER = 900;

export function VenueBlackout() {
  const { venue, switchPhase, finishSwitch } = useVenueContext();
  const { ready } = useVenueLoad();

  const ref = useRef<THREE.Mesh>(null);
  const strength = useRef(0);
  const settle = useRef({ warmed: false, steady: 0, elapsed: 0 });

  const holding = switchPhase === "hold";

  useFrame((state, delta) => {
    const mesh = ref.current;
    if (!mesh) return;

    // ── Settling: warm up the new venue behind the black, then wait ──
    if (holding && ready) {
      const s = settle.current;
      if (!s.warmed) {
        s.warmed = true;
        s.steady = 0;
        s.elapsed = 0;
        const { gl, scene, camera } = state;
        // Upload every texture and compile every material now, in the dark.
        scene.traverse((object) => {
          const mat = (object as THREE.Mesh).material as
            THREE.Material | THREE.Material[] | undefined;
          if (!mat) return;
          for (const m of Array.isArray(mat) ? mat : [mat]) {
            for (const value of Object.values(m)) {
              if (value && (value as THREE.Texture).isTexture) {
                gl.initTexture(value as THREE.Texture);
              }
            }
          }
        });
        gl.compile(scene, camera);
      } else {
        s.elapsed += delta;
        s.steady = delta <= STEADY_FRAME_S ? s.steady + 1 : 0;
        if (s.steady >= STEADY_FRAMES || s.elapsed >= SETTLE_MAX_S) {
          finishSwitch();
        }
      }
    } else {
      settle.current.warmed = false;
    }

    // ── The fade itself, eased at both ends ──
    const target = switchPhase === "idle" ? 0 : 1;
    const step = delta / (target > strength.current ? FADE_IN : FADE_OUT);
    strength.current += THREE.MathUtils.clamp(
      target - strength.current,
      -step,
      step,
    );
    // While the swap is held, it is fully black whatever the ramp says.
    if (holding) strength.current = 1;
    const opacity = holding
      ? 1
      : THREE.MathUtils.smootherstep(strength.current, 0, 1);

    setFadeOpacity(mesh, opacity);
  });

  return (
    <>
      <FadeQuad meshRef={ref} renderOrder={RENDER_ORDER} />

      {/* The loading line, on the black, for as long as the black holds. */}
      {/* Between venues it names the venue being loaded; the site name is
          for the first load, on the gate. */}
      {holding && <LoadingPanel title={venue.title} />}
    </>
  );
}
