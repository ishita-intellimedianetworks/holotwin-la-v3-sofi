"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useXRInputSourceState } from "@react-three/xr";
import * as THREE from "three";
import {
  floorAt,
  isWalkable,
  nearestCentroid,
} from "@/components/vr/hooks/use-navmesh-collider";

/**
 * Thumbstick locomotion with navmesh occlusion. Left stick walks, right stick
 * turns smoothly; a step off the navmesh is refused.
 *
 * TWO SEPARATE QUESTIONS ABOUT THE GROUND. Whether a step is allowed is purely
 * 2D — is (x, z) inside the navmesh footprint? — and the player's HEIGHT is
 * then read off the navmesh surface underneath them.
 *
 * Doing only the first is what made walking feel like flying. The height stayed
 * at whatever the spawn was, so a ramp or a flight of steps passed underneath
 * the player instead of carrying them, and on the memorial's tiers or the
 * stadium's bowl that is most of the venue.
 *
 * NO PATHFINDING. The flat site routes the player with `three-pathfinding`
 * because it walks them to a destination they tapped; here the stick decides,
 * one step at a time, so there is no route to compute.
 */

/** Fallback metres per second. Overridden per venue — see `data`. */
const DEFAULT_MOVE_SPEED = 1.6;
/** Fallback degrees per second at full deflection of the turn stick. */
const DEFAULT_TURN_SPEED = 90;
/** Below this the stick is treated as centred. */
const DEADZONE = 0.15;

/**
 * How fast the player settles onto the floor height, per second.
 *
 * Smoothed rather than snapped so a step up reads as a step rather than a jolt
 * — the eye tolerates the floor arriving over ~100 ms, and a hard snap in a
 * headset is felt in the stomach. High enough that a ramp never lags behind the
 * walk.
 */
const FLOOR_FOLLOW_RATE = 12;

/**
 * A height change this big is not a step, it is a different storey — a bad
 * sample where two levels overlap, or a navmesh seam at a balcony edge.
 * Applying it would drop the player through the building, so it is ignored and
 * the next frame gets another go.
 */
const MAX_FLOOR_JUMP = 3;

const UP = new THREE.Vector3(0, 1, 0);

// Module scope: a useFrame body must not allocate.
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _step = new THREE.Vector3();
const _head = new THREE.Vector3();

export function NavmeshLocomotion({
  originRef,
  navmesh,
  centroids,
  spawn,
  landToken,
  moveSpeed = DEFAULT_MOVE_SPEED,
  turnSpeed = DEFAULT_TURN_SPEED,
  isTravelling,
}: {
  originRef: RefObject<THREE.Group | null>;
  navmesh: THREE.Mesh | null;
  /** One point per navmesh triangle, for placing a player who starts off it. */
  centroids: THREE.Vector3[];
  /** Landing pose. Applied once, on the first frame after a `landToken` bump. */
  spawn: { position: [number, number, number]; rotationY: number };
  /** Walking speed in m/s. Per-venue: a hotel room is not a stadium. */
  moveSpeed?: number;
  /** Degrees per second at full stick deflection. */
  turnSpeed?: number;
  /** True while a "travel to" glide is in flight — sticks are ignored then. */
  isTravelling?: () => boolean;
  /** Bump to re-apply the landing pose, so re-landing is the same code path. */
  landToken?: number;
}) {
  const left = useXRInputSourceState("controller", "left");
  const right = useXRInputSourceState("controller", "right");
  const placed = useRef(false);

  // In an effect, not during render: mutating a ref while rendering can
  // silently miss updates.
  useEffect(() => {
    placed.current = false;
  }, [landToken]);

  useFrame((state, delta) => {
    const origin = originRef.current;
    if (!origin) return;

    // ── Land the player, once ────────────────────────────────────────────────
    // Imperative, not props on XROrigin: this group is mutated every frame
    // below, and a prop would snap the player back on every re-render.
    //
    // A landing point off the navmesh falls back to the nearest walkable
    // triangle, or every step would be refused and the player could not move.
    if (!placed.current && navmesh) {
      placed.current = true;

      origin.position.set(...spawn.position);
      origin.rotation.y = THREE.MathUtils.degToRad(spawn.rotationY);

      if (!isWalkable(navmesh, origin.position.x, origin.position.z)) {
        const nearest = nearestCentroid(
          centroids,
          origin.position.x,
          origin.position.z,
        );
        if (nearest) {
          origin.position.x = nearest.x;
          origin.position.z = nearest.z;
        }
      }
    }

    // The teleport owns the origin until it lands.
    if (isTravelling?.()) return;

    // Clamp so a stalled frame — a shader compile, a texture upload — cannot
    // fling the player across the stadium.
    const dt = Math.min(delta, 0.1);

    // ── Walk — left stick, relative to where the head is looking ─────────────
    const move = left?.gamepad?.["xr-standard-thumbstick"];
    const mx = move?.xAxis ?? 0;
    const my = move?.yAxis ?? 0;

    if (Math.hypot(mx, my) > DEADZONE) {
      // In session, three writes the HMD pose onto the default camera each
      // frame, so this is the direction the user is actually facing.
      state.camera.getWorldDirection(_forward);
      _forward.y = 0;
      _forward.normalize();
      _right.crossVectors(_forward, UP).normalize();

      // Pushing the stick forward reports yAxis ≈ -1, hence the negation.
      _step
        .set(0, 0, 0)
        .addScaledVector(_forward, -my)
        .addScaledVector(_right, mx);

      if (_step.lengthSq() > 0) {
        _step.normalize().multiplyScalar(moveSpeed * dt);

        const p = origin.position;
        const dx = _step.x;
        const dz = _step.z;

        // Test where the HEAD is going, not the origin. The origin is the
        // guardian's centre and the turn pivots it around the head, so it can
        // sit inside a wall while the player stands on good floor — testing it
        // then refuses every direction and walking dies.
        state.camera.getWorldPosition(_head);
        const hx = _head.x;
        const hz = _head.z;

        if (!navmesh) {
          // Still loading — move unbounded rather than freeze.
          p.x += dx;
          p.z += dz;
        } else if (isWalkable(navmesh, hx + dx, hz + dz)) {
          p.x += dx;
          p.z += dz;
        } else if (isWalkable(navmesh, hx + dx, hz)) {
          // Blocked diagonally — slide along the wall instead of stopping dead.
          p.x += dx;
        } else if (isWalkable(navmesh, hx, hz + dz)) {
          p.z += dz;
        } else if (!isWalkable(navmesh, hx, hz)) {
          /**
           * WALKING BACK FROM OUTSIDE. Nothing above can succeed here, and
           * without this the sticks are dead.
           *
           * The navmesh only ever gated the STICK. Physical room-scale walking
           * writes the head pose, never the origin, so it passes no test at all
           * and can put the player through a wall. Once the head is off the
           * mesh every branch above fails — a step is a couple of centimetres,
           * so `hx + dx` is still outside unless you are on the very edge — and
           * the player is stranded somewhere they cannot see the venue from,
           * with controls that appear broken. The only way out was to
           * physically walk back.
           *
           * So while outside, allow any step that CLOSES on walkable ground.
           * Monotonic, therefore it cannot be used to travel: every accepted
           * step strictly reduces the distance, and the moment the head is back
           * over the mesh the branches above take over again.
           */
          const target = nearestCentroid(centroids, hx, hz);
          if (target) {
            // Measured against ONE fixed target, not re-nearest per position:
            // recomputing could pick a different triangle for the after-step
            // and report an improvement that is really a sideways move.
            const beforeSq = (target.x - hx) ** 2 + (target.z - hz) ** 2;
            const afterSq =
              (target.x - (hx + dx)) ** 2 + (target.z - (hz + dz)) ** 2;
            if (afterSq < beforeSq) {
              p.x += dx;
              p.z += dz;
            }
          }
        }
        // else: cornered on both axes, hold position.

        /**
         * FOLLOW THE FLOOR. Sampled at the head, like every other test here,
         * and seeded with the height we are already at so a multi-level
         * navmesh resolves to the storey the player is actually on rather than
         * the one below it.
         */
        if (navmesh) {
          const ground = floorAt(navmesh, hx + dx, hz + dz, p.y);
          if (ground != null) {
            const rise = ground - p.y;
            if (Math.abs(rise) <= MAX_FLOOR_JUMP) {
              p.y += rise * (1 - Math.exp(-FLOOR_FOLLOW_RATE * dt));
            }
          }
        }
      }
    }

    // ── Smooth turn — right stick X, pivoting about the HEAD ─────────────────
    // Not the origin: room-scale puts the user a metre off it, and rotating the
    // group alone swings them around an off-body pivot.
    //
    //     newOrigin = head + R(angle) · (origin − head)
    const turn = right?.gamepad?.["xr-standard-thumbstick"];
    const tx = turn?.xAxis ?? 0;

    if (Math.abs(tx) < DEADZONE) return;

    // Rescaled from the deadzone edge, so the turn eases in from a standstill
    // instead of jumping to a fraction of full speed the moment it engages.
    const throttle = (Math.abs(tx) - DEADZONE) / (1 - DEADZONE);

    // Stick right (x > 0) → turn right → clockwise from above → negative Y.
    // Per second, scaled by dt: the rate must not follow the frame rate.
    const angle =
      (tx < 0 ? 1 : -1) * THREE.MathUtils.degToRad(turnSpeed) * throttle * dt;

    state.camera.getWorldPosition(_head);
    _head.y = origin.position.y;

    origin.position.sub(_head).applyAxisAngle(UP, angle).add(_head);
    origin.rotation.y += angle;
  });

  return null;
}
