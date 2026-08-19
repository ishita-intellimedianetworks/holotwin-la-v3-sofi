"use client";

import { useRef, useState } from "react";
import { Billboard, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { VRHotspot } from "@/components/vr/data";
import { COLOR } from "../../ui/tokens";

/**
 * A hotspot marker: two rings around a dot, with a label that fades in when the
 * ray is on it.
 *
 * THE RINGS ARE NOT BILLBOARDED — a hotspot is mounted on a surface (a desk, a
 * gate, a wall) and holds the orientation `scenes.json` authored for it, so it
 * turns away as you walk past, exactly as the flat site's 3D markers do.
 * THE LABEL IS billboarded, and sits above the marker in world space: a name is
 * only worth drawing if it can be read, and it has no surface to belong to.
 *
 * The tooltip is always mounted with its opacity lerped, never conditionally
 * rendered — mounting on hover would slide the target out from under the ray at
 * the moment it arrives.
 *
 * `onPointerDown`, not `onClick`: a click needs press and release on the same
 * object, and a hand-held ray drifts between the two.
 */

const INNER_RADIUS = 0.04;

/**
 * The parts, as multiples of INNER_RADIUS. A single ring close to its dot
 * closes up at any real distance and reads as one white blob; the same
 * footprint with more space between the parts stays legible across a concourse.
 */
const DOT_SCALE = 0.55;
const INNER_RING = { inner: 0.85, outer: 0.95 };
const OUTER_RING = { inner: 1.2, outer: 1.4 };

/** An invisible collider, so the press target is not three thin rings. */
const HIT_BOX = 0.2;
const HIT_DEPTH = 0.1;

/**
 * The label. Sizes are metres, since this is plain three rather than uikit.
 *
 * Clear of the hit box (half of 0.2) so the plate never overlaps the rings it
 * is naming. The font size is set for reading from across a room: at 4 m,
 * 0.075 m subtends about 1.1°, which a headset resolves cleanly.
 */
const LABEL = {
  y: 0.175,
  fontSize: 0.075,
  /** Padding around the MEASURED text, not a fixed plate height. */
  padX: 0.07,
  padY: 0.045,
} as const;

export function HotspotMarker({
  hotspot,
  onOpen,
}: {
  hotspot: VRHotspot;
  onOpen: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  /** Plate size in metres, replaced by the real one once troika measures it. */
  const [plate, setPlate] = useState<[number, number, number]>([0.4, 0.16, 1]);
  const ringRef = useRef<THREE.Mesh>(null);
  const labelRef = useRef<THREE.Group>(null);
  const tooltipRef = useRef<THREE.Mesh>(null);
  /** troika's Text, which owns `fillOpacity` as a property, not a material one. */
  const textRef = useRef<(THREE.Mesh & { fillOpacity: number }) | null>(null);
  const opacity = useRef(0);

  useFrame((state, delta) => {
    if (ringRef.current) {
      const pulse = hovered
        ? 1.2 + 0.2 * Math.sin(state.clock.getElapsedTime() * 3)
        : 1.4;
      ringRef.current.scale.set(pulse, pulse, 1);
    }

    opacity.current = THREE.MathUtils.lerp(
      opacity.current,
      hovered ? 1 : 0,
      1 - Math.exp(-10 * delta),
    );

    const bg = tooltipRef.current?.material as THREE.Material | undefined;
    if (bg) bg.opacity = opacity.current;

    /**
     * `fillOpacity`, NOT `material.opacity`.
     *
     * troika multiplies the glyph alpha by a `uTroikaFillOpacity` uniform fed
     * from this property, so `alpha = material.opacity × fillOpacity`. Fading
     * the plate in through the material while `fillOpacity` stays at whatever
     * it was given statically leaves the text mathematically invisible at every
     * frame, whatever colour it is — a blank white plate with no name on it.
     */
    if (textRef.current) textRef.current.fillOpacity = opacity.current;

    // Nothing to draw at zero, and it keeps a faint ghost off the wall.
    if (labelRef.current) labelRef.current.visible = opacity.current > 0.01;
  });

  const [rx, ry, rz] = hotspot.rotation;
  const rotation: [number, number, number] = [
    THREE.MathUtils.degToRad(rx),
    THREE.MathUtils.degToRad(ry),
    THREE.MathUtils.degToRad(rz),
  ];

  return (
    <group
      position={hotspot.position}
      // On the OUTERMOST group, so every part of the marker is a press target.
      // Hover stays on the inner group, or the tooltip keeps itself alive by
      // covering the thing that is meant to dismiss it.
      onPointerDown={(event) => {
        event.stopPropagation();
        onOpen();
      }}
    >
      <group
        rotation={rotation}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        {/* The press target: a box, not the rings. Invisible, and still
            raycast — `visible={false}` would take it out of the hit test, so
            it is a transparent material instead. */}
        <mesh>
          <boxGeometry args={[HIT_BOX, HIT_BOX, HIT_DEPTH]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>

        <mesh>
          <circleGeometry args={[INNER_RADIUS * DOT_SCALE, 32]} />
          <meshBasicMaterial
            color={COLOR.accentBright}
            transparent
            opacity={0.95}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>

        <mesh>
          <ringGeometry
            args={[
              INNER_RADIUS * INNER_RING.inner,
              INNER_RADIUS * INNER_RING.outer,
              48,
            ]}
          />
          <meshBasicMaterial
            color={COLOR.text}
            transparent
            opacity={0.9}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>

        <mesh ref={ringRef}>
          <ringGeometry
            args={[
              INNER_RADIUS * OUTER_RING.inner,
              INNER_RADIUS * OUTER_RING.outer,
              48,
            ]}
          />
          <meshBasicMaterial
            color={COLOR.accentBright}
            transparent
            opacity={0.6}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* Billboarded, so the name faces the reader wherever they stand. */}
      <Billboard position={[0, LABEL.y, 0]}>
        <group ref={labelRef}>
          <mesh ref={tooltipRef} position={[0, 0, -0.001]}>
            <planeGeometry args={[plate[0], plate[1]]} />
            <meshBasicMaterial
              color={COLOR.panel}
              transparent
              opacity={0}
              depthWrite={false}
            />
          </mesh>
          <Text
            ref={textRef}
            fontSize={LABEL.fontSize}
            color={COLOR.text}
            anchorX="center"
            anchorY="middle"
            // Measured, so the plate is sized to the name rather than the name
            // being sized to a guessed plate.
            onSync={(troika) => {
              const box = troika.geometry.boundingBox;
              if (!box) return;
              setPlate([
                box.max.x - box.min.x + LABEL.padX * 2,
                box.max.y - box.min.y + LABEL.padY * 2,
                1,
              ]);
            }}
          >
            {hotspot.label}
          </Text>
        </group>
      </Billboard>
    </group>
  );
}
