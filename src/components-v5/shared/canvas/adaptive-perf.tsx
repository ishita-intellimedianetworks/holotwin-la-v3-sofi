"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { EffectComposer as EffectComposerImpl } from "postprocessing";

const dbsTmp = new THREE.Vector2();

/**
 * AdaptivePerf — drops the render resolution while the user is actively
 * dragging/zooming and restores it ~200ms after they stop (R3F's performance
 * regression). The dollhouse orbit forces full-scene re-renders every frame,
 * and at full DPR that lags on heavier GPUs — halving DPR during interaction
 * quarters the fragment work for an imperceptible momentary softness.
 *
 * Shared by both composers: the / route's ScenePostFX and the /lighting
 * LightingRig.
 */
export default function AdaptivePerf({
  composer,
}: {
  composer: React.RefObject<EffectComposerImpl | null>;
}) {
  const getThree = useThree((s) => s.get);
  const current = useThree((s) => s.performance.current);
  const setDpr = useThree((s) => s.setDpr);
  const baseDpr = useRef(0);

  // Flag a performance regression on every interaction movement — R3F then
  // holds performance.current at its min until the debounce elapses.
  useEffect(() => {
    const el = getThree().gl.domElement;
    const regress = () => getThree().performance.regress();
    const onPointerMove = (e: PointerEvent) => {
      if (e.buttons !== 0) regress();
    };
    el.addEventListener("pointermove", onPointerMove, { passive: true });
    el.addEventListener("wheel", regress, { passive: true });
    el.addEventListener("touchmove", regress, { passive: true });
    return () => {
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("wheel", regress);
      el.removeEventListener("touchmove", regress);
    };
  }, [getThree]);

  // Scale DPR with the performance factor (1 → base, 0.5 → half base).
  useEffect(() => {
    if (!baseDpr.current) baseDpr.current = getThree().viewport.dpr;
    setDpr(baseDpr.current * current);
  }, [getThree, setDpr, current]);
  useEffect(
    () => () => {
      if (baseDpr.current) setDpr(baseDpr.current);
    },
    [setDpr],
  );

  // The composer only resizes its buffers on CSS-size changes — a DPR change
  // would leave them stale (stuck soft after restore), so resync whenever the
  // drawing-buffer size and the composer's input buffer disagree.
  useFrame(() => {
    const c = composer.current;
    if (!c) return;
    const t = getThree();
    const dbs = t.gl.getDrawingBufferSize(dbsTmp);
    const ib = c.inputBuffer;
    if (ib && (ib.width !== dbs.width || ib.height !== dbs.height)) {
      c.setSize(t.size.width, t.size.height);
    }
  });

  return null;
}
