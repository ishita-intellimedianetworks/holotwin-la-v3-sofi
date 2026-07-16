'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Gradient endpoints, written directly as sRGB 0–1 components (a raw
// ShaderMaterial gets no automatic colour-space conversion, so we output the
// display values straight). Sky-blue overhead → soft grey toward the ground.
const TOP_COLOR    = new THREE.Vector3(0.498, 0.749, 0.988); // #7fbffc sky blue
// For now the WHOLE sphere is the flat sky blue (no grey below the horizon) —
// the aerial fly-over poses (e.g. Parking) look straight down and would
// otherwise frame the venue against the shaded grey half.
const BOTTOM_COLOR = TOP_COLOR;
// Horizon band: where blue fades to grey, in view-direction Y (-1 down … +1 up).
//   HORIZON  = centre of the blend. Blue covers everything above it, grey below,
//             so the blue share of the sky ≈ (1 - HORIZON) / 2. Lower it for more
//             blue, raise it for more grey. -0.2 ⇒ ~60% blue.
//   SOFTNESS = half-width of the blend band: small = crisp horizon line,
//             large = gradual fade.
const HORIZON  = -0.04;
const SOFTNESS = 0.03;

// Mount fade: the sky only mounts on the dollhouse → first-person switch, so
// it eases in from the black dollhouse backdrop instead of popping.
const FADE_IN_SEC = 1.5;

const VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3  uTop;
  uniform vec3  uBottom;
  uniform float uHorizon;
  uniform float uSoftness;
  uniform float uOpacity;
  varying vec3 vDir;
  void main() {
    float t = smoothstep(uHorizon - uSoftness, uHorizon + uSoftness, vDir.y);
    gl_FragColor = vec4(mix(uBottom, uTop, t), uOpacity);
  }
`;

/**
 * Sky — an inward-facing backdrop sphere (ported from the reference exterior).
 * Centred on the camera every frame and scaled to sit just inside the far
 * plane, so it always fills the background regardless of the model's (very
 * large) world units and however far the orbit pulls back.
 *
 * Shaded as a vertical GRADIENT — sky-blue overhead fading through a soft
 * horizon to grey below — instead of a single flat colour. `BackSide` because
 * the camera is inside it; `depthWrite`/`depthTest` off so the building still
 * draws over it.
 */
export default function Sky() {
  const meshRef = useRef<THREE.Mesh>(null);
  const fadeRef = useRef(0);

  const uniforms = useMemo(
    () => ({
      uTop:      { value: TOP_COLOR },
      uBottom:   { value: BOTTOM_COLOR },
      uHorizon:  { value: HORIZON },
      uSoftness: { value: SOFTNESS },
      uOpacity:  { value: 0 },
    }),
    [],
  );

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.position.copy(state.camera.position);
    // Sit inside the far plane (geometry radius is 1, so scale == radius).
    const far = (state.camera as THREE.PerspectiveCamera).far;
    mesh.scale.setScalar(far * 0.45);

    // Ease the dome in over the black backdrop after mount.
    if (fadeRef.current < 1) {
      fadeRef.current = Math.min(1, fadeRef.current + delta / FADE_IN_SEC);
      const k = fadeRef.current;
      uniforms.uOpacity.value = k * k * (3 - 2 * k); // smoothstep
    }
  });

  return (
    <mesh ref={meshRef} frustumCulled={false} renderOrder={-5000}>
      <sphereGeometry args={[1, 32, 16]} />
      <shaderMaterial
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
        side={THREE.BackSide}
        transparent
        depthWrite={false}
        depthTest={false}
        toneMapped={false}
        fog={false}
      />
    </mesh>
  );
}
