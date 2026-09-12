"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useVenue } from "@/components/vr/data/venue-provider";
import {
  LEVEL_HEIGHT,
  floorAt,
  nearestCentroid,
  stepFloor,
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
  const { originRef, moveToLocation, finishTeleport, standingLiftRef } =
    useVRState();
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

  const venue = useVenue();
  const seconds = venue.locomotion.teleportSeconds;
  const groundOffset = venue.groundOffset;

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
       * THE AUTHORED HEIGHT PICKS THE STOREY. IT IS NOT THE LANDING HEIGHT.
       *
       * It used to be, and that is what made a glide land at one height and
       * then sink the moment the stick was touched. `scenes.json`'s POI cameras
       * are EYE positions authored for the flat player — 49.2 m at a stadium
       * gate whose floor is 47.8 — so setting the XR origin to 49.2 puts the
       * origin, which is the player's FEET, where their eyes should be, and
       * their actual eyes a further standing height above that. Locomotion then
       * samples the navmesh on the first frame of the first step and eases the
       * origin down to 47.8. Same place, two heights, and the correction is
       * felt as the floor dropping away underfoot.
       *
       * So the authored value is used for the ONE thing it can be trusted for:
       * saying which of the storeys stacked over this (x, z) was meant. The
       * height itself comes from the navmesh, which is the surface the player
       * will stand on and the same number locomotion will read a frame later.
       * The two cannot disagree any more, because there is only one of them.
       *
       * Both `scenes.json` conventions still work. The village authors every
       * camera at `y: 0` on flat ground — that means "unspecified", so the
       * storey hint is the height we are already at. The stadium and memorial
       * carry real elevations and those select a deck.
       */
      const targetY = moveToLocation.position[1];
      const hintY =
        Math.abs(targetY) > 1e-3
          ? targetY
          : origin.position.y - groundOffset - standingLiftRef.current;

      /**
       * SNAP ONTO THE STOREY THE HINT NAMES, not merely onto the footprint.
       *
       * The 2D question — is there navmesh over this column? — passes for the
       * four stadium Event Updates, which are notices pinned 15.9 m out in the
       * air above the pitch: there IS navmesh under them, it is just the pitch.
       * Nothing would be snapped and the player would be set down on the field
       * instead of at the notice. Asking for a floor near the authored height
       * catches those the same way it catches the two gates that miss the mesh
       * by 20 and 30 cm.
       */
      let toX = moveToLocation.position[0];
      let toZ = moveToLocation.position[2];

      /**
       * A SEAT IS NOT A PLACE ON THE FLOOR, so it does not get a floor.
       *
       * `exactPose` destinations — every stadium and memorial seat view — are
       * authored ABOVE the navmesh on purpose, and the nearest walkable surface
       * beneath one is the pitch. Running the snap on them is not a near miss,
       * it is a guaranteed forty-metre drop to the field, which is why the
       * authored height has to win outright here rather than merely hint.
       *
       * The subtraction is what makes it the EYE height it was authored as.
       * `scenes.json`'s cameras are eye positions from the flat player, and the
       * XR origin is the floor under the player's feet — so putting the origin
       * at the authored value would seat someone a standing height too high,
       * looking down on the row they meant to sit in. `headAbove` is the
       * wearer's own measured height in a session and the venue's fallback eye
       * height in the flat preview, so the eyes land on the authored number in
       * both.
       */
      let ground: number | null = null;
      let exactY: number | null = null;

      if (moveToLocation.exactPose) {
        exactY = targetY - (_head.y - origin.position.y);
      } else {
        ground = collider
          ? stepFloor(collider, toX, toZ, hintY, LEVEL_HEIGHT, LEVEL_HEIGHT)
          : null;
      }

      if (collider && exactY == null && ground == null) {
        const near = nearestCentroid(centroids, toX, toZ, hintY);
        if (near) {
          toX = near.x;
          toZ = near.z;
          // Unbounded here: the centroid IS the storey now, so the only job
          // left is reading the surface height across its triangle.
          ground = floorAt(collider, toX, toZ, near.y) ?? near.y;
        }
      }

      /**
       * The floor, plus the venue's offset if one is authored.
       *
       * `groundOffset` is a small shared lift off the navmesh surface, NOT an
       * eye height: a headset supplies standing height itself, measured from
       * the XR origin, so adding a person's full height here would put their
       * eyes through the ceiling. See `vr-scenes.json`.
       *
       * No floor found at all — a venue whose navmesh has not loaded — leaves
       * the hint standing, which is the old behaviour and the best guess
       * available.
       */
      const toY =
        exactY ?? (ground ?? hintY) + groundOffset + standingLiftRef.current;

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
