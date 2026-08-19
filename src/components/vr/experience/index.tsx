"use client";

import { Fragment, Suspense, useCallback, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { XR, XROrigin } from "@react-three/xr";
import {
  VRVenueProvider,
  useVenueContext,
} from "@/components/vr/data/venue-provider";
import { VenueLoadProvider, useVenueLoad } from "./load-progress";
import { EnterVROverlay } from "./enter-vr-overlay";
import { Session } from "./session";
import { VRStateProvider, useVRState } from "./state";
import { store } from "./xr-store";
// Side effect: warms uikit's font chunk so the first panel does not pop.
import "./ui/preload-font";

/**
 * `/vr` — the whole site, in a headset.
 *
 * Three jobs here and no more: own the XR session, mount the providers, set up
 * the Canvas. What is IN the scene lives in `./session`, per-visit state in
 * `./state`, and which venue you are in in `../data/venue-provider`.
 */

/**
 * Inside the state provider, so the origin ref it owns is the one the scene
 * moves. The spawn is applied imperatively by locomotion — a prop would be
 * re-applied on every re-render and snap the player back mid-walk.
 */
function Player() {
  const { originRef } = useVRState();
  return <XROrigin ref={originRef} />;
}

/**
 * Suspends until the model is decoded, then says so — the only signal there is.
 *
 * `useGLTF` gives no progress and no callback; what it does give is a promise
 * that suspends. Mounting it inside the Canvas and reporting from an effect
 * turns "this component rendered" into "the GLB is parsed and uploaded",
 * because React cannot run the effect until the suspension resolves.
 *
 * It is free: the path is the one the scene is loading anyway, and drei caches
 * by path, so this waits on that same work rather than repeating it.
 */
function ModelReadyProbe({ path }: { path: string }) {
  const { markModelReady } = useVenueLoad();
  useGLTF(path);
  useEffect(markModelReady, [markModelReady]);
  return null;
}

function VRGate({
  onEnter,
  isInVrSession,
  error,
}: {
  onEnter: () => void;
  isInVrSession: boolean;
  error: string | null;
}) {
  // The venue is NAMED here, not chosen — see `enter-vr-overlay`.
  const { venue } = useVenueContext();
  // The same numbers the in-world panel draws — one hook, one set of bytes,
  // two surfaces. See `./load-progress`.
  const { percent, indeterminate, ready } = useVenueLoad();

  return (
    <EnterVROverlay
      onEnter={onEnter}
      isInVrSession={isInVrSession}
      venueTitle={venue.title}
      error={error}
      progress={{ percent, indeterminate, ready }}
    />
  );
}

/**
 * Everything about one visit, thrown away and rebuilt when the venue changes.
 *
 * THE KEY IS HERE AND NOT AROUND THE CANVAS, and that placement is the whole
 * reason venue switching works from inside a headset.
 *
 * Re-keying is the right way to change venue: every scrap of per-visit state —
 * where you stand, which marker is revealed, a glide in flight — is about the
 * venue you were in, and carrying any of it across is a bug waiting to be
 * found. A half-finished travel to a stadium gate does not mean anything in a
 * four-metre hotel room. Remounting throws all of it away at once rather than
 * relying on every field being individually reset.
 *
 * But the key must not reach the `Canvas` or the `XR` above it. Remounting a
 * Canvas builds a new WebGLRenderer and drops the old one's context — and the
 * immersive session is bound to that context, so the headset would fall out of
 * VR every time someone picked a different venue from the in-world menu. The
 * renderer and the session stay mounted for the life of the page; only what is
 * drawn inside them is replaced.
 *
 * This lives inside the Canvas rather than outside it (R3F would bridge the
 * context either way) because that is what puts the key below `XR`.
 */
function Visit({ debug }: { debug: boolean }) {
  const { venue } = useVenueContext();

  return (
    /*
      NO SUSPENSE BOUNDARY HERE, and it is worth saying why not.

      One around `Session` would never fire: every child that can suspend —
      the model, the navmesh, the doll house — carries its own boundary, so
      nothing ever propagates this far. Wrapping it would look like it handled
      the venue-swap wait while doing nothing at all. The wait is handled where
      it actually happens, in `./session`.
    */
    <VRStateProvider key={venue.id}>
      <Player />
      <Session store={store} debug={debug} />
    </VRStateProvider>
  );
}

function VRCanvas({ debug }: { debug: boolean }) {
  const { venue } = useVenueContext();

  return (
    <Canvas
      gl={{ localClippingEnabled: true }}
      // Preview only — in session the headset supplies its own projection.
      // Per venue, from `vr-scenes.json`.
      camera={{ fov: venue.fov }}
    >
      <XR store={store}>
        {/*
          FLAT AMBIENT LIGHT, and no sun.

          `scenes.json` carries a full lighting rig per venue — a
          shadow-casting directional sun, an ambient tint, an environment
          intensity — and the flat site builds all of it. None of it is used
          here, and that is a frame-budget decision rather than an oversight: a
          shadow-casting directional light renders a depth pass over a
          kilometre-wide stadium once per eye per frame, which is the single
          most expensive thing that could be added to this scene. The models
          carry baked lighting in their materials, so a flat ambient reads
          correctly without any of that cost.
        */}
        <ambientLight intensity={3} />

        {/* Its own boundary: this suspends for the whole decode, and an
            unboundaried suspension inside Canvas blanks the entire tree. */}
        <Suspense fallback={null}>
          <ModelReadyProbe key={venue.model} path={venue.model} />
        </Suspense>

        <Visit debug={debug} />
      </XR>
    </Canvas>
  );
}

export default function VRExperience({ venueId }: { venueId?: string }) {
  const [isInVrSession, setIsInVrSession] = useState(false);
  const [enterError, setEnterError] = useState<string | null>(null);

  // `?debug=true` draws the navmesh as a wireframe. A lazy initialiser, not an
  // effect: this only mounts in the browser (`ssr: false`), and a
  // setState-in-effect would cascade a render.
  const [debug] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("debug") === "true",
  );

  /**
   * Leaving the session reloads the page.
   *
   * Blunt, and deliberately so. Coming out of VR leaves a Canvas sized for a
   * headset, an XR origin somewhere in the middle of a stadium and a uikit tree
   * built for a stereo view; unwinding all of that correctly is a great deal of
   * code whose only user is a person who has just said they are done. A reload
   * puts them back at the gate, which is where the flow starts.
   */
  const handleVRExit = useCallback(() => {
    window.location.reload();
  }, []);

  const onEnterVrClick = useCallback(() => {
    setEnterError(null);
    store
      .enterVR()
      .then(() => {
        setIsInVrSession(true);
        store.subscribe((state) => {
          if (state.session) {
            state.session.addEventListener("end", handleVRExit);
          }
        });
      })
      .catch((err: unknown) => {
        setIsInVrSession(false);
        // Swallowing this is what makes a failed enter look like a dead button.
        setEnterError(
          err instanceof Error
            ? `Could not start the VR session: ${err.message}`
            : "Could not start the VR session.",
        );
      });
  }, [handleVRExit]);

  return (
    <Fragment>
      {/* Fills the route's `fixed inset-0` wrapper exactly. Not `w-screen`,
          which is 100vw and so ignores a vertical scrollbar's width. */}
      <div className="absolute inset-0 bg-black">
        <VRVenueProvider initialVenueId={venueId}>
          {/*
            ABOVE BOTH the gate and the Canvas, so the DOM card and the uikit
            panel read the same download. R3F bridges React context across its
            reconciler boundary, so one hook serves both sides.
          */}
          <VenueLoadProvider>
            <VRGate
              onEnter={onEnterVrClick}
              isInVrSession={isInVrSession}
              error={enterError}
            />
            <VRCanvas debug={debug} />
          </VenueLoadProvider>
        </VRVenueProvider>
      </div>
    </Fragment>
  );
}
