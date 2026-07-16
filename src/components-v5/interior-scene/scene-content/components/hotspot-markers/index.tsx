"use client";

/**
 * HotspotMarkers — places a <Hotspot> (white circle + ring, hover tooltip) at
 * the hotspot positions of the destination the player is CURRENTLY AT, when
 * that destination opts in with `showHsIn3d` (scenes.json).
 *
 * Markers are an ARRIVAL layer, not a browsing layer: while picking a
 * destination the map pins carry the locations; only after teleporting /
 * walking there do the in-scene discs appear (the parking zones under the
 * aerial fly-over, the concession stand markers, …). Leaving the destination
 * (any other teleport or walk) hides them again.
 */

import { useEffect, useState } from "react";
import type { PlayerControllerHandle } from "../player-controller";
import type { DestinationsByCategory, Destination, DestinationCategory } from "@/components-v5/shared/types";
import { useNavUiStore } from "../../../store/nav-ui-store";
import { Hotspot } from "./hotspot";

/** How far (world units, XZ) the player may wander from the reached
 *  destination's camera before its 3D markers hide. The "currently at" latch
 *  itself is tight (~0.8u — it also drives teleport-only behaviour and the
 *  status pill), which made the markers vanish after a couple of steps even
 *  though the spots were still right there in view. The marker layer keeps
 *  its own, much looser leash. */
const MARKER_KEEP_UNITS = 15;

interface HotspotMarkersProps {
  ctrlRef: React.RefObject<PlayerControllerHandle | null>;
  dests?: DestinationsByCategory;
  /** Per-venue marker disc radius (FloorConfig.hsSize); default 0.2. */
  hsSize?: number;
}

export function HotspotMarkers({ ctrlRef, dests, hsSize }: HotspotMarkersProps) {
  const currentDest = useNavUiStore((s) => s.currentDest);
  // The marker whose info overlay is open hides — the card IS that marker,
  // so the disc pulsing behind it would just be noise. Back on close.
  const hotspotInfo = useNavUiStore((s) => s.hotspotInfo);

  // The destination the player is standing at — the primary source of 3D
  // markers, and only if it opts in via `showHsIn3d`.
  const atDest = currentDest
    ? dests?.[currentDest.category]?.find((x) => x.id === currentDest.id) ?? null
    : null;
  const liveDest = atDest?.showHsIn3d ? atDest : null;
  const liveCat = liveDest ? currentDest!.category : null;

  // Keep-alive: once a marker destination has been reached, its markers stay
  // up after the tight "currently at" latch drops — until the player is more
  // than MARKER_KEEP_UNITS from its camera (or a new marker dest takes over).
  const [kept, setKept] = useState<{ dest: Destination; cat: DestinationCategory } | null>(null);
  useEffect(() => {
    if (liveDest && liveCat) setKept({ dest: liveDest, cat: liveCat });
  }, [liveDest, liveCat]);
  useEffect(() => {
    if (liveDest || !kept) return; // live latch active, or nothing to keep
    const id = setInterval(() => {
      const ctrl = ctrlRef.current;
      const cam = kept.dest.camera;
      if (!ctrl || !cam) { setKept(null); return; }
      const p = ctrl.getPosition();
      if (Math.hypot(p.x - cam.position[0], p.z - cam.position[2]) > MARKER_KEEP_UNITS) {
        setKept(null);
      }
    }, 400);
    return () => clearInterval(id);
  }, [liveDest, kept, ctrlRef]);

  const dest = liveDest ?? kept?.dest ?? null;
  const destCat = liveCat ?? kept?.cat ?? null;
  const points: { position: [number, number, number]; rotation?: [number, number, number]; label?: string }[] =
    dest
      ? dest.hotspots?.length
        ? dest.hotspots
        : dest.hotspot?.position
          ? [dest.hotspot]
          : []
      : [];
  const pins = points.map((h, i) => ({ pos: h.position, rot: h.rotation, label: h.label, key: `${dest!.id}#${i}` }));

  if (!dest || !destCat || pins.length === 0) return null;

  const cat = destCat;
  return (
    <>
      {pins.map(({ pos, rot, label, key }, i) =>
        hotspotInfo && hotspotInfo.destId === dest.id && hotspotInfo.index === i + 1 ? null : (
        <Hotspot
          key={key}
          position={pos}
          rotation={rot}
          title={label ?? dest.label}
          size={hsSize ?? 0.2}
          pulse
          onHotspotClick={() =>
            useNavUiStore.getState().setHotspotInfo({
              destId: dest.id,
              destLabel: dest.label,
              category: cat,
              option: dest.option,
              hotspotLabel: label,
              index: i + 1,
              total: pins.length,
              position: pos,
            })
          }
        />
      ))}
    </>
  );
}
