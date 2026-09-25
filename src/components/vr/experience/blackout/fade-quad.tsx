"use client";

import { useMemo, type RefObject } from "react";
import * as THREE from "three";

/**
 * A black quad that covers each eye's whole image, at a given opacity.
 *
 * DRAWN IN SCREEN SPACE, NOT PLACED IN THE WORLD. The player is moved while
 * the screen is black, and a cover placed at the head from a frame callback is
 * one frame behind that move — the scene shows through for a frame. This quad
 * ignores the camera entirely: its vertex shader writes clip-space corners
 * directly, so it covers the view on every frame, wherever the player is.
 *
 * The owner drives it by writing `setFadeOpacity(mesh, value)` every frame.
 */

const VERTEX = /* glsl */ `
  void main() {
    // A 1x1 plane -> the full clip-space square, at mid depth. No camera.
    gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  void main() {
    gl_FragColor = vec4(0.0, 0.0, 0.0, uOpacity);
  }
`;

export function FadeQuad({
  meshRef,
  renderOrder,
}: {
  meshRef: RefObject<THREE.Mesh | null>;
  renderOrder: number;
}) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uOpacity: { value: 0 } },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  );

  return (
    <mesh
      ref={meshRef}
      material={material}
      renderOrder={renderOrder}
      visible={false}
      // Clip space is not where the camera frustum thinks this is.
      frustumCulled={false}
      raycast={() => null}
    >
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}

/** Sets the quad's opacity and hides it outright when it is clear. */
export function setFadeOpacity(mesh: THREE.Mesh, opacity: number) {
  (mesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value = opacity;
  mesh.visible = opacity > 0.002;
}
