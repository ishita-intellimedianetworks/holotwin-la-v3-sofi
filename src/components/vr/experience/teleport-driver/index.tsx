"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useVenue } from "@/components/vr/data/venue-provider";
import {
  isWalkable,
  nearestCentroid,
  useNavmeshCollider,
} from "@/components/vr/hooks/use-navmesh-collider";
import { useVRState } from "../state";

/**
 * Performs the glide described by `moveToLocation`.
 *
 * The store holds the INTENT and this component carries it out and clears it,
 * so everything else can ask "are we travelling?" from state alone, with no
 * callbacks threaded through the tree.
 *
 * A GLIDE, NOT A CUT. A hard jump is the more comfortable option in most VR
 * guidance and it is the wrong one here: the venues are large and mostly
 * symmetrical — one stadium concourse looks much like the next — so a cut
 * leaves the player with no idea which way they have been turned or how far
 * they have come. Moving them through the space keeps the journey legible. The
 * per-venue duration (see `data`) is what keeps the speed tolerable: the same
 * two seconds that crosses a hotel room would cross the stadium at 400 m/s.
 *
 * HEAD-ACCURATE LANDING. Under room-scale the origin is the guardian's centre,
 * not the player, so setting it to the target lands them a metre off. The
 * destination origin is solved once at departure:
 *
 *     originTarget = target − R(Δyaw) · (head − origin)
 *
 * Once, because recomputing mid-flight chases itself: the head moves with the
 * origin it is measured against.
 */

/** Cosine ease — no abrupt start or stop. */
const ease = (t: number) =>
  0.5 - 0.5 * Math.cos(Math.PI * THREE.MathUtils.clamp(t, 0, 1));

const _head = new THREE.Vector3();

interface Trip {
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromYaw: number;
  toYaw: number;
  elapsed: number;
  duration: number;
}

export function TeleportDriver() {
  const { originRef, moveToLocation, finishTeleport } = useVRState();
  const camera = useThree((state) => state.camera);
  const trip = useRef<Trip | null>(null);

  /**
   * THE LANDING IS SNAPPED ONTO WALKABLE GROUND, and that is a fix rather than
   * a precaution.
   *
   * Checked against the real navmeshes, six of the stadium's thirty-six
   * authored viewpoints sit off it: two by 0.2 and 0.3 m — a rounding-level
   * miss at a gate — and the four Event Updates by 15.9 m each, which are
   * notices pinned in mid-air rather than places to stand. Every other venue is
   * clean (village 6/6, memorial 21/21).
   *
   * Landing on one of those puts the player over nothing. Locomotion's
   * walk-back-from-outside branch would eventually let them crawl to safety,
   * and the clamp deliberately holds off after a glide, so the result is
   * standing in space next to the stand you asked to see.
   *
   * The flat site never has this problem because it PATHFINDS to a destination,
   * which cannot leave its own navmesh. Snapping is the same guarantee arrived
   * at differently.
   */
  const { collider, centroids } = useNavmeshCollider();

  const seconds = useVenue().locomotion.teleportSeconds;

  /** Identity, not value: `teleportTo` makes a new object every call, so the
   *  same layout chosen twice is still a new trip. */
  const plannedFor = useRef<typeof moveToLocation>(null);

  useFrame((_, delta) => {
    const origin = originRef.current;

    if (!moveToLocation) {
      trip.current = null;
      plannedFor.current = null;
      return;
    }

    /**
     * Planned in the frame loop, NOT an effect. An effect runs once per
     * destination and bails if the origin is not mounted yet — then nothing
     * calls `finishTeleport`, `moveToLocation` stays set, and every control
     * that stands down during a glide stays down for good. Here it simply
     * retries next frame.
     */
    if (!origin) return;

    if (plannedFor.current !== moveToLocation) {
      plannedFor.current = moveToLocation;

      const targetYaw = THREE.MathUtils.degToRad(moveToLocation.rotationY);
      const deltaYaw = targetYaw - origin.rotation.y;

      camera.getWorldPosition(_head);
      const offX = _head.x - origin.position.x;
      const offZ = _head.z - origin.position.z;

      const cos = Math.cos(deltaYaw);
      const sin = Math.sin(deltaYaw);

      /**
       * THE TARGET'S HEIGHT IF IT HAS ONE, otherwise the height we are already
       * at.
       *
       * Both readings are needed, because `scenes.json` uses both conventions.
       * The village authors every POI camera at `y: 0` — its ground is flat and
       * the flat player supplies the height from the navmesh — so taking 0
       * literally would sink the player into the floor. The stadium and the
       * memorial do the opposite: their cameras carry real elevations (49.2 at
       * the gates, 12.1 at a Level 1 seat, 4.3 on the memorial concourse) and
       * ignoring them would put a player who asked for a seat in the upper
       * bowl down on the pitch instead, underneath the floor they asked to
       * stand on.
       *
       * So 0 keeps its meaning of "unspecified, stay where you are", and a real
       * value is honoured. The flat viewer reads this same column the same way.
       */
      const targetY = moveToLocation.position[1];
      const toY = Math.abs(targetY) > 1e-3 ? targetY : origin.position.y;

      // Snap X/Z onto the navmesh. Height is left alone: it is either the
      // authored storey or the one we are already on, and the nearest triangle
      // may belong to a different level entirely.
      let toX = moveToLocation.position[0];
      let toZ = moveToLocation.position[2];
      if (collider && !isWalkable(collider, toX, toZ)) {
        const near = nearestCentroid(centroids, toX, toZ);
        if (near) {
          toX = near.x;
          toZ = near.z;
        }
      }

      trip.current = {
        fromPos: origin.position.clone(),
        toPos: new THREE.Vector3(
          toX - (offX * cos + offZ * sin),
          toY,
          toZ - (-offX * sin + offZ * cos),
        ),
        fromYaw: origin.rotation.y,
        toYaw: targetYaw,
        elapsed: 0,
        duration: Math.max(0.01, seconds),
      };
    }

    const current = trip.current;
    if (!current) return;

    current.elapsed += delta;
    const t = ease(current.elapsed / current.duration);

    origin.position.lerpVectors(current.fromPos, current.toPos, t);

    // Shortest way round, so 170° → -170° turns 20°, not 340°.
    let turn = current.toYaw - current.fromYaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    origin.rotation.y = current.fromYaw + turn * t;

    if (current.elapsed >= current.duration) {
      origin.position.copy(current.toPos);
      origin.rotation.y = current.toYaw;
      trip.current = null;
      plannedFor.current = null;
      finishTeleport();
    }
  });

  return null;
}
