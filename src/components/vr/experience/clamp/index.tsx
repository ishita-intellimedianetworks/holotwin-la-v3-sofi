"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { isWalkable } from "@/components/vr/hooks/use-navmesh-collider";
import { useVRState } from "../state";

/**
 * Keeps the player's head over the walkable area — a hard stop at the navmesh
 * edge, rather than letting them walk out.
 *
 * The alternative is fading the view to black at the boundary, which is the
 * comfort-safe choice and avoids exactly the trade being made here: pushing the
 * origin moves the world under someone who is standing still, and that is the
 * most reliable way to make a person ill in a headset. It is bounded, though —
 * the correction only ever equals the distance walked past the edge, so it is a
 * wall you cannot push through, not a shove.
 *
 * WHY IT IS NEEDED AT ALL. Locomotion gates the THUMBSTICK against the navmesh,
 * but physical room-scale walking writes the head pose straight from the
 * headset and passes through no check. Without this, the one thing that cannot
 * be blocked is the one thing that takes you outside — off a stadium concourse
 * and into a two-hundred-metre drop.
 *
 * HOW. The last known-good head position is remembered each frame. The moment
 * the head is over nothing walkable, the XR origin is translated by exactly the
 * vector that puts it back — so the head lands where it last legally was. Only
 * X and Z: height is the headset's to decide, and correcting it would be a
 * floor moving under a stationary person.
 *
 * IT STANDS DOWN DURING A TELEPORT, and that is not a nicety.
 *
 * A glide flies the head straight from one stand-point to another, which in any
 * real venue means straight through walls, seating and whatever else the
 * navmesh does not cover. Every frame it spends over that ground looks exactly
 * like walking out of bounds, so without the guard this pulls the origin back
 * to the last legal XZ — and `TeleportDriver` mounts first, so it has already
 * written the frame's position by the time this undoes it. The two then trade
 * the origin back and forth for the length of the trip: a visible judder all
 * the way across, and a landing dragged back towards where the player set off.
 *
 * `NavmeshLocomotion` yields the origin the same way and for the same reason.
 * The rule is that a travelling player has exactly one author.
 */

/**
 * How long the head may be over nothing before it is pulled back, in seconds.
 *
 * A NAVMESH IS NOT WATERTIGHT. These are Recast output over real venue
 * geometry: triangle seams, and holes punched around every barrier and pillar.
 * Without a grace period each one is a frame where this decides the head is out
 * of bounds and translates the origin to put it back, so walking across a
 * concourse yanks repeatedly — the judder, and the repeated snapping is what
 * reads as the scene flashing.
 *
 * Widening `isWalkable` instead is the wrong axis (see the note there — it
 * grows the walkable region outward and creates more holes than it closes).
 * TIME separates the two cases: crossing a seam is over in a few frames, and
 * walking out of the building is not.
 *
 * A quarter second is long enough to swallow a seam and short enough that the
 * correction, when it comes, is still the small step back this promises.
 */
const GRACE_SECONDS = 0.25;

const _head = new THREE.Vector3();

export function NavmeshClamp({ navmesh }: { navmesh: THREE.Mesh | null }) {
  /** Last head position known to be over the navmesh, in world XZ. */
  const anchor = useRef<THREE.Vector2 | null>(null);
  /** How long the head has been continuously off the mesh. */
  const offFor = useRef(0);

  const { originRef, isTravelling } = useVRState();

  useFrame((state, delta) => {
    const origin = originRef.current;
    if (!origin || navmesh == null) return;

    /**
     * Yield to the glide, and DROP THE ANCHOR on the way past.
     *
     * Keeping it would leave a stale point on the far side of the venue: the
     * first frame after landing that the head is off the mesh — a doorway, a
     * seam, one step over an edge — would teleport the player back to where
     * they departed from. Nulling it means the frame after arrival re-anchors
     * wherever they now stand.
     */
    if (isTravelling) {
      anchor.current = null;
      offFor.current = 0;
      return;
    }

    // The HEAD, not the origin. Under room-scale the origin is the guardian's
    // centre and can be metres from the person — the same reason locomotion
    // tests the head.
    state.camera.getWorldPosition(_head);

    if (isWalkable(navmesh, _head.x, _head.z)) {
      offFor.current = 0;
      if (anchor.current == null) {
        anchor.current = new THREE.Vector2(_head.x, _head.z);
      } else {
        anchor.current.set(_head.x, _head.z);
      }
      return;
    }

    // A seam or a hole, not a wall. Ride it out: the anchor is kept, so if the
    // mesh comes back under the head nothing moved at all.
    offFor.current += delta;
    if (offFor.current < GRACE_SECONDS) return;

    // Outside before we ever had a valid position — the spawn itself is off the
    // mesh. Correcting towards nothing would fling the player, so leave it;
    // locomotion's own relocation is what should fix that case.
    if (anchor.current == null) return;

    origin.position.x += anchor.current.x - _head.x;
    origin.position.z += anchor.current.y - _head.z;
  });

  return null;
}
