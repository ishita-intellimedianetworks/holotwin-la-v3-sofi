"use client";

import { Suspense } from "react";
import type { XRStore } from "@react-three/xr";
import { VenueModel } from "@/components/vr/model";
import {
  floorAt,
  useNavmeshCollider,
} from "@/components/vr/hooks/use-navmesh-collider";
import { useVenue } from "@/components/vr/data/venue-provider";
import { useVRState } from "../state";
import { NavmeshClamp } from "../clamp";
import { LoadingPanel } from "../loading-panel";
import { DollHouse } from "../doll-house";
import { Hotspots } from "../hotspots";
import { NavmeshLocomotion } from "../locomotion";
import { VRMenus } from "../menus";
import { TeleportDriver } from "../teleport-driver";
import { VRToolbar } from "../toolbar";

/**
 * The 3D tree for whichever view is active. Everything reads the session store
 * rather than taking props.
 *
 * Each branch keeps its OWN Suspense boundary, and that is load-bearing: R3F's
 * `Canvas` wraps children in a fallback that throws a promise which never
 * resolves, so an unboundaried suspension blanks the WHOLE canvas.
 */
function Walkable({ debug }: { debug: boolean }) {
  const { originRef, landToken, isTravelling } = useVRState();
  const { collider, centroids } = useNavmeshCollider();
  const venue = useVenue();

  const [sx, sy, sz] = venue.spawn.position;

  /**
   * The floor under the spawn, measured from the navmesh surface itself.
   *
   * `scenes.json`'s `startPosition` carries a Y and it cannot be trusted as a
   * floor height: the flat player computes its camera as that Y plus
   * `eyeHeight`, so the pair is eye-height bookkeeping rather than a ground
   * measurement.
   *
   * This used to take the navmesh BOUNDING BOX minimum, guarded by a "within a
   * storey of the authored value" test. That was a workaround for not being
   * able to ask the real question, and it was fragile in exactly the venues it
   * mattered for: the stadium navmesh bottoms out on the pitch, forty metres
   * below the concourse the player starts on, so the guard was the only thing
   * standing between the spawn and a drop through the building.
   *
   * `floorAt` asks the real question — what is the height of the walkable
   * surface at this (x, z)? — and the authored Y disambiguates which storey
   * when several stack over the same point. No threshold, no guard, and the
   * same function locomotion uses every frame, so the spawn cannot disagree
   * with the first step taken from it.
   *
   * A spawn that is off the mesh has no floor to read; the authored value
   * stands, and locomotion relocates the player to the nearest walkable
   * triangle on its first frame.
   */
  const floorY = collider ? (floorAt(collider, sx, sz, sy) ?? sy) : sy;

  const spawn = {
    // A floor position, NOT an eye position — the headset adds standing height
    // on top of the XR origin, so adding `eyeHeight` here would stack the two.
    position: [sx, floorY, sz] as [number, number, number],
    rotationY: venue.spawn.rotationY,
  };

  return (
    <>
      <NavmeshLocomotion
        originRef={originRef}
        navmesh={collider}
        centroids={centroids}
        spawn={spawn}
        landToken={landToken}
        moveSpeed={venue.locomotion.moveSpeed}
        turnSpeed={venue.locomotion.turnSpeed}
        isTravelling={() => isTravelling}
      />

      {/* Blocks the walk at the navmesh edge — the half of the boundary that
          the thumbstick check cannot cover. See `../clamp`. */}
      <NavmeshClamp navmesh={collider} />

      {/* Raycasting works whether or not it is in the graph; this is purely to
          see the walkable area. ?debug=true */}
      {debug && collider && <primitive object={collider} />}
    </>
  );
}

export function Session({ store, debug }: { store: XRStore; debug: boolean }) {
  const { view, goToFirstPerson, panelIsOpen } = useVRState();
  const venue = useVenue();

  return (
    <>
      {/* Its own boundary: `TeleportDriver` loads the navmesh to snap its
          landing, and an unboundaried suspension inside Canvas blanks the
          whole tree. */}
      <Suspense fallback={null}>
        <TeleportDriver />
      </Suspense>

      {view === "doll-house" ? (
        /*
          THE VENUE-SWAP WAIT LIVES HERE.

          Changing venue always lands back in the doll house (the state provider
          remounts, and `doll-house` is its initial view), and `DollHouse`
          suspends on the model while it measures it. So this boundary is the
          one a swap actually hits, and its fallback is the only thing standing
          between the player and several seconds of empty black room with a dock
          floating in it — which reads as a crash rather than as loading.

          The first load does not need it: the DOM gate is covering the view and
          counting real bytes. This is for the second venue onwards, in-session,
          where there is no gate to fall back to.
        */
        <Suspense fallback={<LoadingPanel title={venue.title} />}>
          {/* Keyed by venue: the doll house measures the model to fit it to the
              table, and reconciling one building's bounds into another's would
              show a frame at the wrong scale. */}
          <DollHouse
            key={venue.id}
            interactive={!panelIsOpen}
            onEnter={goToFirstPerson}
          />
        </Suspense>
      ) : (
        <>
          {/* Never a ray target here: the hotspots mounted on its surfaces
              would lose the ray to the wall behind them. */}
          <VenueModel pointerEvents="none" />
          <Suspense fallback={null}>
            <Walkable debug={debug} />
          </Suspense>
          <Suspense fallback={null}>
            <Hotspots />
          </Suspense>
        </>
      )}

      {/* Its own boundary, and separate from the menus': the dock is how you
          OPEN a menu, so it must not be suspended by one. */}
      <Suspense fallback={null}>
        <VRToolbar store={store} />
      </Suspense>

      <Suspense fallback={null}>
        <VRMenus />
      </Suspense>
    </>
  );
}
