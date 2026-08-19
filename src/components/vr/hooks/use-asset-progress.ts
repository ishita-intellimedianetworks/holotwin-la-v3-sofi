"use client";

import { useEffect, useRef, useState } from "react";
import { Cache } from "three";

/**
 * Real download progress for a venue's assets, in BYTES.
 *
 * WHY THIS EXISTS RATHER THAN drei's `useProgress`. That hook reads
 * `THREE.DefaultLoadingManager`, which counts FILES. A venue here loads two —
 * the model and the navmesh — so the only values it can ever report are 0, 50
 * and 100, and it spends the entire download sitting on one of them. The
 * stadium's model and its 3.6 MB navmesh are not remotely the same size, so
 * even the halfway mark is a lie. A bar that jumps twice is worse than no bar:
 * it reads as frozen for the whole time it actually matters.
 *
 * HOW IT AVOIDS DOWNLOADING TWICE. `useGLTF` takes no `onProgress`, so the
 * bytes have to be counted before it runs. Fetching them and throwing them away
 * would mean paying for the model twice over — so instead the buffer is put
 * into `THREE.Cache` under the same url. `FileLoader.load` checks that cache
 * first and returns the hit without touching the network, so the loader gets
 * the bytes this already has.
 *
 * That is also why `Cache.enabled` is set here. It is a three-wide global, but
 * this module only loads on the VR route, and the entries are removed on the
 * way out.
 */

export interface AssetProgress {
  /** Bytes fetched so far, across every url. */
  loaded: number;
  /** Total bytes, or 0 while no `Content-Length` has been seen yet. */
  total: number;
  /** 0–1. Falls back to 0 while `total` is unknown, never exceeds 1. */
  fraction: number;
  /**
   * TRUE WHEN THERE IS NO HONEST PERCENTAGE TO SHOW — no `Content-Length` on at
   * least one url, so the size of the download is unknown while it is happening.
   *
   * This is the normal case behind a tunnel. ngrok and friends re-frame the
   * response with `Transfer-Encoding: chunked`, which has no length header by
   * definition — so testing a headset through one is exactly when it happens,
   * and exactly when a working progress bar matters most.
   *
   * The tempting fallback is to treat "bytes so far" as the total. It is worse
   * than useless: it makes `loaded / total` equal 1 on the first chunk, so the
   * bar snaps to full a few milliseconds in and then sits there for the entire
   * download. That reads as a broken bar, or as no bar at all.
   *
   * So the unknown is reported instead, and both surfaces draw an indeterminate
   * bar — one that says "working" without claiming to know how much is left.
   */
  indeterminate: boolean;
  /** True once every url has been fetched, or has failed. */
  ready: boolean;
  /**
   * Set when a fetch failed. NOT fatal and deliberately not shown as a blocker:
   * the loader will simply fetch that url itself in the normal way, so a failed
   * prefetch costs the progress bar its accuracy and nothing else.
   */
  error: string | null;
}

const IDLE: AssetProgress = {
  loaded: 0,
  total: 0,
  fraction: 0,
  indeterminate: false,
  ready: true,
  error: null,
};

Cache.enabled = true;

/**
 * Stream one url, reporting bytes as they arrive, and hand back the buffer.
 *
 * THE DOWNLOAD USUALLY HAS NO `Content-Length`, and that is not an edge case
 * here — it is what `next start` does to these files. Next gzips responses by
 * default, and a gzipped body is sent as `Transfer-Encoding: chunked`, which
 * carries no length by definition. Measured on this app:
 *
 *   GET, Accept-Encoding: gzip   →  Content-Encoding: gzip, chunked, NO length
 *   GET, no encoding offered     →  Content-Length: 9299044
 *   HEAD                         →  Content-Length: 9299044
 *
 * A browser always advertises gzip, so the first row is the only one a browser
 * ever sees — which left the bar with no denominator and no percentage to show,
 * on every venue, on every load. (Compressing an already-Draco-compressed GLB
 * also buys nothing but CPU at both ends; the header is the part that hurts.)
 *
 * `Accept-Encoding: identity` would fix it at the source and cannot be sent:
 * fetch treats it as a forbidden header and drops it. So the size is asked for
 * separately, with HEAD, which is not subject to the transfer encoding of the
 * body and reports the true figure.
 *
 * FIRED ALONGSIDE THE STREAM, NOT BEFORE IT. Awaiting the HEAD would put a
 * round trip in front of every download to improve a progress bar. Instead the
 * bytes start immediately and the denominator arrives a moment later, so the
 * bar spends its first fraction of a second indeterminate and is exact
 * thereafter.
 *
 * The decompressed bytes the reader yields match HEAD's figure exactly — the
 * browser decodes transparently — so the two are the same scale.
 */
async function streamInto(
  url: string,
  signal: AbortSignal,
  onBytes: (delta: number, total: number) => void,
): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const total = Number(response.headers.get("content-length")) || 0;

  if (total === 0) {
    // Not awaited: see the note above. A failure leaves the bar indeterminate,
    // which is exactly what it would have been anyway.
    void fetch(url, { method: "HEAD", signal })
      .then((head) => Number(head.headers.get("content-length")) || 0)
      .then((size) => {
        if (size > 0) onBytes(0, size);
      })
      .catch(() => {});
  }

  // No stream to read (an old browser, or a cached response with no body
  // reader) — fall back to the whole thing at once. The bar jumps; it works.
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    // The whole body arrived at once, so its length IS the total — this is the
    // one case where the two are genuinely the same number.
    onBytes(buffer.byteLength, buffer.byteLength);
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    // The REAL header, or 0 for "unknown" — never `received` standing in for
    // it. See `indeterminate`.
    onBytes(value.byteLength, total);
  }

  // One copy, rather than `Blob.arrayBuffer()`, so the result is a plain
  // ArrayBuffer of exactly the right length — what `FileLoader` hands a
  // GLTFLoader for an "arraybuffer" response type.
  const out = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}

/**
 * Prefetch `urls`, reporting combined byte progress.
 *
 * Pass an empty array — or nothing — and it reports `ready` immediately, so a
 * caller does not have to branch on whether the venue has resolved yet.
 */
export function useAssetProgress(
  urls: (string | undefined | null)[],
): AssetProgress {
  // A stable key, so a caller re-rendering with a fresh array literal does not
  // restart the download on every render.
  const paths = urls.filter((u): u is string => !!u);
  const key = paths.join("|");

  /**
   * The progress, TAGGED WITH THE URLS IT DESCRIBES.
   *
   * The tag is what removes the reset. Without it the effect has to write
   * `{ ...IDLE, ready: false }` on every key change, which is a synchronous
   * setState in an effect body: a render at the OLD venue's progress, then a
   * second one to correct it. On the gate that shows as a finished bar flashing
   * up for the venue you just switched away from.
   *
   * Carrying the key instead makes staleness something the render can see, so
   * the reset is derived rather than dispatched — see the return below.
   */
  const [state, setState] = useState<AssetProgress & { key: string }>(() => ({
    ...(paths.length ? { ...IDLE, ready: false } : IDLE),
    key,
  }));

  // The totals live in refs: they are written once per chunk, which is far more
  // often than the component should render.
  const loaded = useRef(0);
  const totals = useRef<Record<string, number>>({});

  useEffect(() => {
    const list = key ? key.split("|") : [];
    // Nothing to fetch. The hook returns `IDLE` outright for this case (see the
    // return below) rather than pushing it through state — writing state here
    // would be a render cascade for a value that is already known.
    if (list.length === 0) return;

    const controller = new AbortController();
    let cancelled = false;
    loaded.current = 0;
    totals.current = {};

    /**
     * Coalesced to one update per animation frame. A 9 MB body arrives in
     * thousands of chunks and a `setState` per chunk would spend the whole
     * download re-rendering the very screen it is trying to draw.
     */
    let queued = false;
    const publish = () => {
      if (queued || cancelled) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        if (cancelled) return;
        const total = Object.values(totals.current).reduce((a, b) => a + b, 0);
        // EVERY url must have declared a length, not just one of them: a venue
        // whose model is measurable and whose navmesh is not has no meaningful
        // combined percentage, since the denominator is missing a term.
        const measurable = list.every((url) => (totals.current[url] ?? 0) > 0);
        setState((prev) => ({
          // `prev` only if it is about THIS key; otherwise start from a clean
          // slate, since the fields being spread describe a different venue.
          ...(prev.key === key ? prev : { ...IDLE, ready: false, key }),
          loaded: loaded.current,
          total,
          indeterminate: !measurable,
          fraction: measurable ? Math.min(1, loaded.current / total) : 0,
        }));
      });
    };

    Promise.all(
      list.map(async (url) => {
        // Already fetched — by a previous visit to this venue, or a remount.
        if (Cache.get(url) !== undefined) return;
        const buffer = await streamInto(
          url,
          controller.signal,
          (delta, total) => {
            loaded.current += delta;
            // NEVER DOWNGRADE a known size back to unknown. The HEAD reply and
            // the body's own chunks both report through here, and the chunks
            // carry 0 whenever the response had no length — so assigning
            // unconditionally would erase the figure HEAD just supplied on the
            // very next chunk.
            if (total > 0) totals.current[url] = total;
            publish();
          },
        );
        if (!cancelled) Cache.add(url, buffer);
      }),
    )
      .then(() => {
        if (!cancelled) {
          setState((prev) => ({
            ...(prev.key === key ? prev : { ...IDLE, key }),
            fraction: 1,
            // Finished is finished, however little was known on the way.
            indeterminate: false,
            ready: true,
          }));
        }
      })
      .catch((err: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        // Ready anyway — see `error` above. The loader will fetch it itself.
        setState((prev) => ({
          ...(prev.key === key ? prev : { ...IDLE, key }),
          ready: true,
          error: err instanceof Error ? err.message : "download failed",
        }));
      });

    return () => {
      cancelled = true;
      controller.abort();
      // Do NOT hold the raw buffers past this screen. `useGLTF` keeps the
      // parsed scene alive on its own; these are the undecoded bytes on top of
      // it, and on a headset that is megabytes worth keeping out of the way.
      for (const url of list) Cache.remove(url);
    };
  }, [key]);

  // Nothing to load — `ready` on the first render, so a caller with no assets
  // never shows a bar even for one frame.
  if (!key) return IDLE;

  // State left over from the PREVIOUS set of urls. The download for the current
  // one has not reported yet, so the honest answer is "starting", and reading it
  // here rather than writing it in the effect is what keeps that free.
  return state.key === key ? state : { ...IDLE, ready: false };
}
