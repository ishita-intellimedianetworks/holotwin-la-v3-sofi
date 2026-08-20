"use client";

import { useRef } from "react";
import { Environment } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useVRState } from "../state";

/**
 * The venue's surroundings: what lights it, and what you see past it.
 *
 * TWO PIECES, MOUNTED IN DIFFERENT PLACES, because they answer to different
 * things. The image-based lighting is a property of the SITE and never changes;
 * the backdrop is a property of the VIEW and changes when you step inside.
 *
 * IT IS THE FLAT SITE'S OWN HDR, not a generated studio box. `/env.hdr` at 0.65
 * is exactly what `components-v5/.../SceneLights` lights every venue with, so
 * the two views of the same building are lit by the same sky rather than by two
 * different guesses at one. A generated `RoomEnvironment` was tried first and
 * was wrong twice over: it is a white box, so everything reflective picked up a
 * flat white sheen, and it looked nothing like the flat site.
 *
 * WHY THERE HAS TO BE ONE AT ALL. Half of physically-based shading is a
 * reflection of the surroundings, and the VR scene had none — a single
 * `ambientLight` and black in every direction. Ambient light is not a function
 * of the surface normal, and a material with `metalness` above zero has no
 * diffuse term to catch it, so it rendered black. Black, through a headset,
 * against a black background, is indistinguishable from a hole in the wall.
 */

/** What the flat site uses. Matching it is the whole point. */
const ENV_FILE = "/env.hdr";
const ENV_INTENSITY = 0.65;

/**
 * The image-based lighting. Never unmounted, never per-venue.
 *
 * Mounted above the venue so a venue change does not tear the IBL down and
 * re-attach it — and so there is only ever one, since two would leave whichever
 * unmounted second restoring a stale value.
 *
 * `background={false}`: this lights the model and nothing more. What is BEHIND
 * the model is `VRBackdrop` below, because the answer differs by view.
 */
export function VREnvironment() {
  return (
    <Environment
      files={ENV_FILE}
      environmentIntensity={ENV_INTENSITY}
      background={false}
    />
  );
}

/** The first-person sky. Same blue the flat site fades to. */
const SKY = new THREE.Color("#7fbffc");
const BLACK = new THREE.Color("#000000");

/**
 * How long the crossfade takes, in seconds. Matches the flat site's
 * `BackgroundFade`, which rides its dollhouse-to-first-person fly.
 */
const FADE_SECONDS = 1.6;

/**
 * Written from a plain function outside the component: assigning to a value
 * that came out of a hook trips `react-hooks/immutability`, which has no way to
 * know that a three `Scene` is exactly the sort of object you are meant to
 * mutate. `ui/progress-bar` does the same thing for the same reason.
 */
function paintBackground(scene: THREE.Scene, mix: number) {
  if (!(scene.background instanceof THREE.Color)) {
    scene.background = new THREE.Color(0x000000);
  }
  // Smoothstep, so the fade eases in and out rather than starting at full rate.
  const k = mix * mix * (3 - 2 * mix);
  (scene.background as THREE.Color).copy(BLACK).lerp(SKY, k);
}

/**
 * What is behind the venue — BLACK IN THE DOLL HOUSE, SKY IN FIRST PERSON.
 *
 * The two views want opposite things and the flat site already settled this:
 * the doll house is a model on a table, and a model on a table reads as an
 * OBJECT — something you are holding at arm's length and turning over. Put a
 * sky behind it and it stops being an object and starts being a tiny building
 * you are floating above, which is a different and worse illusion. Black is
 * what isolates it.
 *
 * First person is the opposite case. Standing at street level with black above
 * the roofline is the one thing on screen that says none of this is real, and
 * every opening — a gate, a doorway, a gap between stands — reads as a void
 * rather than as somewhere the outside is.
 *
 * Mounted inside `Session` rather than beside the IBL above, because this is
 * the only piece that needs to know which view is up, and `view` lives in the
 * per-visit state that `VREnvironment` sits above.
 */
export function VRBackdrop() {
  const { view } = useVRState();
  const scene = useThree((state) => state.scene);

  /** 0 = black, 1 = sky. Eased toward the target rather than snapped. */
  const mix = useRef(0);

  useFrame((_, delta) => {
    const target = view === "first-person" ? 1 : 0;
    const step = delta / FADE_SECONDS;

    mix.current =
      target > mix.current
        ? Math.min(target, mix.current + step)
        : Math.max(target, mix.current - step);

    paintBackground(scene, mix.current);
  });

  return null;
}
