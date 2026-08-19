"use client";

import { useEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { VenueModel } from "@/components/vr/model";
import { useVenue } from "@/components/vr/data/venue-provider";
import { useVRState } from "../state";
import { useDollHouseRotation } from "./hooks/use-doll-house-rotation";

/**
 * Doll-house view — the venue shrunk to a tabletop object you can spin and step
 * into. Pressing anywhere on it enters first person at the venue's authored
 * spawn; it does not travel to the point that was pressed.
 *
 * THE FIT IS MEASURED, NOT AUTHORED, and that is the whole reason this file is
 * not a copy of the flat site's dollhouse camera.
 *
 * The flat site frames each venue by parking a camera at a hand-tuned distance
 * (`dollHouseCamera` in `scenes.json`: 376 m back for the memorial, 486 for the
 * stadium). That works when the camera is free to move. Here it is not — it is
 * the player's head, and the player is standing in a room. So the model comes
 * to the viewer instead, scaled to a fixed tabletop size, and the numbers that
 * do the work are the model's own bounds rather than a camera pose that would
 * have to be re-authored for VR and kept in step with the flat one forever.
 *
 * It also has to cover a range no single authored scale could: the hotel room
 * is about four metres across and the stadium is nearly a kilometre. That is
 * two hundred and fifty to one.
 */

/**
 * How wide the model reads on its imaginary table, in metres.
 *
 * At the default 2.6 m table distance this subtends about 34° — big enough to pick out a
 * stand or a wing of the village, small enough to take in without turning your
 * head, and it leaves the dock below it clear.
 */
const TABLE_SPAN_FALLBACK = 1.6;

/**
 * The model's bounds, and the transform that puts it on the table.
 *
 * `useGLTF` is already caching this exact path for `VenueModel`, so this
 * suspends on work that is happening anyway rather than fetching a second copy.
 */
function useTableFit(path: string, tableSpan: number) {
  const { scene } = useGLTF(path);

  return useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    /**
     * The LARGEST of the three dimensions, not the footprint.
     *
     * Fitting the XZ footprint alone is the obvious move and it fails on the
     * tilt: at 60° a tall venue's height is most of what you see, so a stadium
     * bowl scaled to its plan size stands proud of the table and runs off the
     * top of the view. Taking the largest dimension means the model fits
     * whatever angle it is turned to, at the cost of a flat venue sitting a
     * little smaller than it could.
     */
    const span = Math.max(size.x, size.y, size.z, 1e-3);

    return { scale: tableSpan / span, center };
  }, [scene, tableSpan]);
}

export function DollHouse({
  onEnter,
  interactive = true,
}: {
  onEnter: () => void;
  /**
   * False while a panel is open, or pressing a button also enters first
   * person — the ray reaches the model too and both handlers fire.
   */
  interactive?: boolean;
}) {
  const venue = useVenue();
  const { originRef, landToken } = useVRState();
  const modelRef = useRef<THREE.Group>(null);
  // Per venue, from `vr-scenes.json` — the doll house is a headset-only view
  // and nothing in the flat config describes how it should be framed.
  const framing = venue.dollHouse;
  const { scale, center } = useTableFit(
    venue.model,
    framing.tableSpan || TABLE_SPAN_FALLBACK,
  );

  /**
   * Frame the doll house: on arrival, and again whenever Home is pressed.
   *
   * The PLAYER half is not optional. The table sits at a FIXED WORLD POSITION,
   * but first-person locomotion walks the XR origin anywhere in the venue — on
   * the stadium that is up to half a kilometre away. Coming back without this
   * leaves the table somewhere over the horizon, which looks like an empty
   * black room where nothing can be pressed.
   *
   * The MODEL half restores the opening tilt, undoing however far the
   * thumbstick has spun it. Together they mean the view is framed identically
   * every time — which is exactly what the dock's Home button promises, so it
   * shares this code path via `landToken` rather than having its own.
   *
   * Imperative, not props: `useDollHouseRotation` mutates this same group every
   * frame, and a prop would snap it back on every re-render.
   */
  useEffect(() => {
    const origin = originRef.current;
    if (origin) {
      origin.position.set(0, 0, 0);
      origin.rotation.set(0, 0, 0);
    }

    const model = modelRef.current;
    if (model) {
      model.rotation.set(
        THREE.MathUtils.degToRad(framing.tilt),
        THREE.MathUtils.degToRad(framing.spin),
        0,
      );
    }
  }, [originRef, landToken, venue.id, framing.tilt, framing.spin]);

  useDollHouseRotation(modelRef, interactive, framing.tiltRange);

  return (
    <group position={framing.position}>
      <group
        ref={modelRef}
        scale={scale}
        onPointerDown={interactive ? onEnter : undefined}
      >
        {/*
          Recentred INSIDE the rotating group, so the model spins about its own
          middle rather than about whatever corner of the world its origin
          happens to sit at. The stadium's is hundreds of metres off-centre;
          spinning about that would swing it out of the room entirely.
        */}
        <group position={[-center.x, -center.y, -center.z]}>
          <VenueModel pointerEvents={interactive ? "auto" : "none"} />
        </group>
      </group>
    </group>
  );
}
