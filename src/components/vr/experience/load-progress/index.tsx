"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { useVenue } from "@/components/vr/data/venue-provider";
import { useAssetProgress } from "@/components/vr/hooks/use-asset-progress";

/**
 * How far along the active venue's load is — read by BOTH the DOM gate and the
 * in-world panel.
 *
 * It used to live inside the gate, which meant the number only existed on the
 * flat overlay. That was fine for the first load, where the gate is the only
 * thing on screen, and wrong for every load after it: switching venue from
 * inside a headset has no gate, so the wait was a spinner with no idea how long
 * it had left. Sharing it is the whole reason this file exists — one hook, one
 * set of bytes, two surfaces drawing it.
 *
 * Mounted OUTSIDE `<Canvas>` and consumed on both sides of it. R3F bridges
 * React context across its reconciler boundary, so the uikit panel and the DOM
 * card read the same value.
 */

interface VenueLoad {
  /**
   * 0–100, ALREADY ROUNDED, and that is a performance decision rather than a
   * formatting one.
   *
   * A multi-megabyte body arrives in thousands of chunks, and even coalesced to
   * one update per animation frame that is ~60 context changes a second. Every
   * one of them re-renders both consumers — and on the uikit side a re-render
   * is a layout pass over the panel, in a view locked to someone's head.
   *
   * Rounding here means the context value only changes identity when the
   * INTEGER moves, so the whole download costs at most about a hundred
   * re-renders instead of one per frame. Nothing displays more precision than
   * this anyway: both surfaces render "Loading 42%".
   */
  percent: number;
  /**
   * True when `percent` is meaningless — no `Content-Length`, which is the
   * normal case behind a tunnel like ngrok. Both surfaces draw a moving bar
   * with no number instead of a still one with a wrong number.
   */
  indeterminate: boolean;
  /** True once the bytes have arrived AND the model is decoded and on the GPU. */
  ready: boolean;
  /** Called by the decode probe once `useGLTF` has resolved for this venue. */
  markModelReady: () => void;
}

const LoadContext = createContext<VenueLoad | null>(null);

/**
 * DECODING IS A SECOND PHASE, and it is otherwise invisible.
 *
 * The bar reaches the last byte and then nothing happens for several seconds —
 * because downloading a GLB is not loading it. three still has to decode it
 * (all four venues are Draco-compressed, which is expensive), turn it into
 * geometry and upload that to the GPU. None of it reports progress, and it is
 * the slowest part on a headset.
 *
 * There is nothing to measure, so it is not measured: the bar holds just short
 * of full while the work happens, then completes. A bar that sits at 95% is
 * honestly saying "nearly"; one that sits at 100% is claiming to be finished
 * and lying.
 */
const DECODE_SHARE = 0.05;

export function VenueLoadProvider({ children }: PropsWithChildren) {
  const venue = useVenue();

  /** The two files a first-person view cannot start without. */
  const assets = useAssetProgress([venue.model, venue.navmesh]);

  /**
   * WHICH VENUE is decoded, not WHETHER one is.
   *
   * A boolean would need resetting on every venue change, and the only place to
   * do that is an effect — which renders one frame of "the new venue is already
   * loaded" before correcting itself. On the gate that showed as a finished bar
   * flashing up for a venue whose download had not started. Storing the id
   * makes staleness something the render can see, so the reset is derived.
   */
  const [decodedVenueId, setDecodedVenueId] = useState<string | null>(null);
  const modelReady = decodedVenueId === venue.id;

  const markModelReady = useCallback(
    () => setDecodedVenueId(venue.id),
    [venue.id],
  );

  const percent = modelReady
    ? 100
    : Math.round((1 - DECODE_SHARE) * assets.fraction * 100);

  const ready = assets.ready && modelReady;

  /**
   * The DECODE phase is always indeterminate, whatever the download was.
   *
   * Once the bytes are in there is genuinely nothing left to measure — three is
   * inside a Draco decode that reports no progress — so a bar that had a real
   * percentage during the download stops having one here. It holds at 95% and
   * starts moving instead, which is the honest way to say "still working, no
   * longer counting".
   */
  const indeterminate = (assets.indeterminate || assets.ready) && !ready;

  const value = useMemo<VenueLoad>(
    () => ({ percent, indeterminate, ready, markModelReady }),
    [percent, indeterminate, ready, markModelReady],
  );

  return <LoadContext.Provider value={value}>{children}</LoadContext.Provider>;
}

export function useVenueLoad(): VenueLoad {
  const ctx = useContext(LoadContext);
  if (!ctx) {
    throw new Error("useVenueLoad must be used inside <VenueLoadProvider>");
  }
  return ctx;
}
