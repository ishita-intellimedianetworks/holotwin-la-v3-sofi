"use client";

import {
  Fragment,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { XR, XROrigin } from "@react-three/xr";
import {
  VRVenueProvider,
  useVenueContext,
} from "@/components/vr/data/venue-provider";
import { VenueLoadProvider, useVenueLoad } from "./load-progress";
import { EnterVROverlay } from "./enter-vr-overlay";
import { VREnvironment } from "./environment";
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

/**
 * Born-with values for the one camera. MODULE SCOPE so the object identity is
 * stable across every render — R3F rebuilds the camera when this changes.
 */
/**
 * A QUARTER of a metre, and the exact value is doing real work.
 *
 * Depth precision is governed by the near:far ratio and `near` dominates it —
 * halving the near plane costs as much precision as doubling the far one. At
 * 0.1 m against the memorial's 1500 m that ratio is 15,000:1, and what runs out
 * of precision first is two surfaces that are nearly coplanar: a wall and its
 * trim, a floor and its inlay. They fight for the same depth, one wins, and the
 * other is simply not drawn — which reads as a hole in the wall rather than as
 * a rendering artefact. It is a VR problem specifically because an XR
 * framebuffer's depth buffer is commonly shallower than a desktop canvas's, so
 * the same model that is solid on the flat site comes apart in a headset.
 *
 * 0.25 m is two and a half times the precision at no cost anywhere else:
 * nothing in this experience is meant to be looked at closer than that. The
 * panels sit at 2 m, the dock at 2 m, and a controller held against your own
 * face is not a view anyone needs. Pushing it further — 0.5 m, 1 m — would buy
 * more and start clipping a hand held out in front of you.
 */
const NEAR_PLANE = 0.25;

const CAMERA_DEFAULTS = { fov: 70, near: NEAR_PLANE, far: 2000 };

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

/**
 * Applies the venue's projection to the ONE camera, imperatively.
 *
 * NOT `<Canvas camera={{ ... }}>` with per-venue values in it. R3F compares
 * that object shallowly and BUILDS A NEW CAMERA when it differs, so a venue
 * switch — which deliberately never remounts the Canvas or the XR session,
 * because remounting either drops the WebGL context the headset is bound to —
 * would quietly swap the camera out from under a live session. Writing the two
 * fields is the same result with none of that.
 *
 * IT REACHES THE HEADSET. three's `WebXRManager.updateCamera` reads
 * `camera.near`/`camera.far` every frame and calls `session.updateRenderState`
 * whenever they change, so this is the clip distance in the headset and not
 * just in the flat preview behind the gate.
 */
function VenueCamera() {
  const { venue } = useVenueContext();

  /**
   * In the frame loop rather than an effect, and the reason is the lint rule
   * that made the effect illegal: `useThree`'s camera is a hook return value
   * and the React Compiler forbids writing to one. `useFrame`'s state is handed
   * to the callback fresh each frame and carries no such promise — which is the
   * same reason everything else that moves the player writes from here.
   *
   * Three comparisons a frame, and they are equal every frame but the first
   * after a venue change.
   */
  useFrame((state) => {
    const camera = state.camera as THREE.PerspectiveCamera;
    if (!camera.isPerspectiveCamera) return;

    if (
      camera.fov === venue.fov &&
      camera.near === NEAR_PLANE &&
      camera.far === venue.far
    ) {
      return;
    }

    camera.fov = venue.fov;
    camera.near = NEAR_PLANE;
    camera.far = venue.far;
    camera.updateProjectionMatrix();
  });

  return null;
}

/**
 * Reports a lost WebGL context, so a blackout says what it is.
 *
 * THE FAILURE IS OTHERWISE INDISTINGUISHABLE FROM THE SCENE. When the driver
 * takes the context away — which on a standalone headset means it ran out of
 * GPU memory, and these venues carry 33 to 187 textures each — three keeps
 * being asked to render and quietly draws nothing. The headset shows black.
 * So does a session that is merely missing its frame deadline, and so does a
 * model that failed to load, and the three want completely different answers.
 *
 * `preventDefault` on the lost event is what allows a restore to be attempted
 * at all; without it the browser will not fire `webglcontextrestored`. The
 * restore is not handled here beyond clearing the message, because every
 * texture and buffer has to be re-uploaded to be usable and drei's cache still
 * holds the old handles — the honest recovery is the reload the gate offers.
 */
function ContextWatch({ onLost }: { onLost: (lost: boolean) => void }) {
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    const canvas = gl.domElement;

    const lost = (event: Event) => {
      event.preventDefault();
      console.error("[VR] WebGL context lost — the GPU dropped the scene.");
      onLost(true);
    };
    const restored = () => {
      console.warn("[VR] WebGL context restored.");
      onLost(false);
    };

    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    return () => {
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
    };
  }, [gl, onLost]);

  return null;
}

function VRCanvas({
  debug,
  onContextLost,
}: {
  debug: boolean;
  onContextLost: (lost: boolean) => void;
}) {
  const { venue } = useVenueContext();

  return (
    <Canvas
      gl={{ localClippingEnabled: true }}
      /**
       * STABLE, and every venue-specific value is applied by `VenueCamera`
       * above instead — see the note there. These are only the defaults the
       * camera is born with.
       *
       * `far` matters even as a default, because R3F's own is 1000 m
       * (`PerspectiveCamera(75, 0, 0.1, 1000)`) and three hands it to the
       * session as `depthFar`. The memorial is 1274 m corner to corner, so
       * accepting that default is what cut the far stand off the venue: it
       * rendered up to 1000 m and no further.
       */
      camera={CAMERA_DEFAULTS}
    >
      <XR store={store}>
        <VenueCamera />
        <ContextWatch onLost={onContextLost} />

        {/*
          AMBIENT AND AN ENVIRONMENT, and still no sun.

          `scenes.json` carries a full lighting rig per venue — a
          shadow-casting directional sun, an ambient tint, an environment
          intensity — and the flat site builds all of it. None of it is used
          here, and that is a frame-budget decision rather than an oversight: a
          shadow-casting directional light renders a depth pass over a
          kilometre-wide stadium once per eye per frame, which is the single
          most expensive thing that could be added to this scene. The models
          carry baked lighting in their materials, so ambient plus a prefiltered
          environment reads correctly without any of that cost — and unlike a
          bare ambient, it gives reflective surfaces something to reflect.
        */}
        {/*
          The image-based lighting, and ONLY that — see `./environment`. Mounted
          here rather than inside `Visit` so a venue change does not tear the
          IBL down and re-attach it. What is drawn BEHIND the venue is
          `VRBackdrop`, which lives in `./session` because it depends on which
          view is up.

          Its own boundary: this fetches a 1.4 MB HDR, and a slow or failed
          fetch must not take the scene down with it.
        */}
        <Suspense fallback={null}>
          <VREnvironment />
        </Suspense>

        {/*
          2.2, AND THE NUMBER IS A BALANCE RATHER THAN A COPY.

          The flat site lights a venue with three things — ambient 0.8, a sun at
          7.9, and the HDR at 0.65. VR takes the HDR at the same 0.65 so the two
          views share a sky, and cannot take the sun at any price: a
          shadow-casting directional over a kilometre-wide venue is a depth pass
          per eye per frame. So the ambient here is not the flat site's 0.8, it
          is the flat site's 0.8 plus whatever of the sun can be replaced by
          light that costs nothing.

          It was 3 when ambient was the only light in the scene, and 3 with the
          HDR on top blows the baked textures out. This is the one number to
          nudge if the venues read too dark or too washed.
        */}
        <ambientLight intensity={2.2} />

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
  const [contextLost, setContextLost] = useState(false);

  /**
   * Read by the exit handler, which runs from an event listener registered
   * once and would otherwise close over the first value forever.
   */
  const contextLostRef = useRef(false);

  /**
   * Folded into the gate's error slot rather than given a screen of its own.
   * Losing the context leaves the canvas black whatever is drawn over it, so
   * the only surface that can still say anything is the DOM in front of it —
   * and that is the gate, which already knows how to show a failure.
   *
   * The gate is hidden during a session, so this puts the session down too. It
   * is not a demotion: the context IS gone, the headset is showing black, and
   * pretending otherwise leaves the person in there with nothing to read.
   */
  const handleContextLost = useCallback((lost: boolean) => {
    contextLostRef.current = lost;
    setContextLost(lost);
    if (lost) setIsInVrSession(false);
  }, []);

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
    /**
     * EXCEPT AFTER A LOST CONTEXT, where the reload is the one thing that must
     * not happen. Losing the context ends the session, so this fires — and a
     * reload would replace the explanation with a fresh gate that looks exactly
     * like a normal start, which is how a GPU running out of memory came to
     * look like nothing at all. The gate is already back, carrying the reason,
     * and reloading is a button away.
     */
    if (contextLostRef.current) return;
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
              error={
                contextLost
                  ? "The headset ran out of graphics memory and dropped the scene. Reload to try again."
                  : enterError
              }
            />
            <VRCanvas debug={debug} onContextLost={handleContextLost} />
          </VenueLoadProvider>
        </VRVenueProvider>
      </div>
    </Fragment>
  );
}
