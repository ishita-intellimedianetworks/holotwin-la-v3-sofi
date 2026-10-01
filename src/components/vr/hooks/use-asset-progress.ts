"use client";

import { useEffect, useState } from "react";
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
 * into `THREE.Cache` under the key `FileLoader` looks up, `file:<url>`.
 * `FileLoader.load` checks that cache first and returns the hit without
 * touching the network, so the loader gets the bytes this already has.
 *
 * THE KEY IS `file:<url>`, NOT `<url>`. three prefixes it, and storing under
 * the bare url meant the loader never found the prefetch: every venue
 * downloaded twice, and the bar measured the copy nothing used.
 *
 * AND THE LOADER HAS TO WAIT FOR IT. A `useGLTF` that starts while the
 * prefetch is still streaming misses the cache just the same, so the prefetch
 * lives in a module-level registry and `useVenueGLTF` (`model/loader`)
 * suspends on it before loading. One download, and it is the one the bar
 * measures.
 *
 * `Cache.enabled` is a three-wide global, so it is on only while the VR route
 * is mounted (`setAssetCacheEnabled`), and each entry is dropped as soon as
 * the parsed result exists — see `releaseAssetBytes`.
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

/** How often byte progress is published, at most. */
const PUBLISH_MS = 33;

/** The key `FileLoader` reads and writes. */
const cacheKey = (url: string) => `file:${url}`;

/**
 * One download per url, shared by every caller: the progress hook reads its
 * bytes, the loader waits on its promise.
 */
interface Prefetch {
  /** Settles when the bytes are in the cache, or the fetch failed. Never rejects. */
  promise: Promise<void>;
  loaded: number;
  /** 0 while unknown. */
  total: number;
  done: boolean;
  error: string | null;
  listeners: Set<() => void>;
}

const prefetches = new Map<string, Prefetch>();

/**
 * An already-settled promise React can read WITHOUT suspending. React's `use`
 * checks a thenable's `status` field first; a plain `Promise.resolve()` has
 * none, so every render handed a fresh one would suspend again, forever.
 */
const SETTLED = Object.assign(Promise.resolve(), {
  status: "fulfilled" as const,
  value: undefined,
});

/** Urls whose parsed result already exists — nothing to fetch for those. */
const parsed = new Set<string>();

/**
 * On while the VR route is mounted, off when it goes. `FileLoader` caches
 * EVERYTHING it loads while this is on — the HDR, the Draco decoder — so it is
 * not left on for the flat site after a client-side navigation away.
 */
export function setAssetCacheEnabled(enabled: boolean): void {
  Cache.enabled = enabled;
  // Only the settled bytes go. In-flight entries stay: StrictMode's
  // mount-cleanup-mount would otherwise start every venue's download twice.
  if (!enabled) Cache.clear();
}

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
 *
 * NOT ABORTABLE. The download is shared with the loader, which may be waiting
 * on it after the screen that started it has gone.
 */
async function streamInto(
  url: string,
  onBytes: (delta: number, total: number) => void,
): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const total = Number(response.headers.get("content-length")) || 0;

  if (total === 0) {
    // Not awaited: see the note above. A failure leaves the bar indeterminate,
    // which is exactly what it would have been anyway.
    void fetch(url, { method: "HEAD" })
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
 * Start (or join) the download of `url`.
 *
 * A url that has already been parsed settles at once: the loader has it, and
 * re-downloading it only to hold the gate up is what a revisit used to cost.
 */
export function prefetchAsset(url: string): Prefetch {
  const existing = prefetches.get(url);
  if (existing) return existing;

  Cache.enabled = true;

  const entry: Prefetch = {
    promise: SETTLED,
    loaded: 0,
    total: 0,
    done: false,
    error: null,
    listeners: new Set(),
  };
  const notify = () => {
    for (const listener of entry.listeners) listener();
  };

  if (parsed.has(url) || Cache.get(cacheKey(url)) !== undefined) {
    entry.done = true;
  } else {
    entry.promise = streamInto(url, (delta, total) => {
      entry.loaded += delta;
      // NEVER DOWNGRADE a known size back to unknown. The HEAD reply and the
      // body's own chunks both report through here, and the chunks carry 0
      // whenever the response had no length — so assigning unconditionally
      // would erase the figure HEAD just supplied on the very next chunk.
      if (total > 0) entry.total = total;
      notify();
    }).then(
      (buffer) => {
        Cache.add(cacheKey(url), buffer);
        entry.done = true;
        notify();
      },
      (err: unknown) => {
        // Not fatal — the loader will simply fetch the url itself. KEPT in the
        // registry: dropping it would have the waiting loader start a fresh
        // prefetch on its retry, and against a url that keeps failing that is
        // a loop. `forgetAsset` clears it when the venue is left.
        entry.done = true;
        entry.error = err instanceof Error ? err.message : "download failed";
        notify();
      },
    );
  }

  prefetches.set(url, entry);
  return entry;
}

/**
 * The loader has parsed `url`: drop the raw bytes. `useGLTF` keeps the parsed
 * scene on its own; these are the undecoded bytes on top of it, and on a
 * headset that is megabytes worth not holding.
 */
export function releaseAssetBytes(url: string): void {
  parsed.add(url);
  Cache.remove(cacheKey(url));
  prefetches.delete(url);
}

/** The parsed result of `url` has been thrown away; a revisit must fetch. */
export function forgetAsset(url: string): void {
  parsed.delete(url);
  Cache.remove(cacheKey(url));
  prefetches.delete(url);
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

  useEffect(() => {
    const list = key ? key.split("|") : [];
    // Nothing to fetch. The hook returns `IDLE` outright for this case (see the
    // return below) rather than pushing it through state — writing state here
    // would be a render cascade for a value that is already known.
    if (list.length === 0) return;

    let cancelled = false;
    const entries = list.map(prefetchAsset);

    /**
     * Coalesced to one update per ~30 ms. A 9 MB body arrives in thousands of
     * chunks and a `setState` per chunk would spend the whole download
     * re-rendering the very screen it is trying to draw.
     *
     * A TIMER, NEVER `requestAnimationFrame`. While an immersive session is
     * running the browser suspends the window's animation frames — only the
     * session's own loop runs — so a switch of venue from inside the headset
     * queued its "done" behind a frame that never came, and the bar sat at its
     * 95% cap until some unrelated input forced a render.
     */
    let queued = false;
    const publish = () => {
      if (queued || cancelled) return;
      queued = true;
      window.setTimeout(() => {
        queued = false;
        if (cancelled) return;
        const loaded = entries.reduce((sum, e) => sum + e.loaded, 0);
        const total = entries.reduce((sum, e) => sum + e.total, 0);
        const allDone = entries.every((e) => e.done);
        // EVERY url must have declared a length, not just one of them: a venue
        // whose model is measurable and whose navmesh is not has no meaningful
        // combined percentage, since the denominator is missing a term. A url
        // that needed no download at all is as good as measured.
        const measurable =
          total > 0 && entries.every((e) => e.total > 0 || e.done);
        setState({
          key,
          loaded,
          total,
          // Finished is finished, however little was known on the way.
          indeterminate: allDone ? false : !measurable,
          fraction: allDone ? 1 : measurable ? Math.min(1, loaded / total) : 0,
          ready: allDone,
          error: entries.find((e) => e.error)?.error ?? null,
        });
      }, PUBLISH_MS);
    };

    for (const e of entries) e.listeners.add(publish);
    publish();

    return () => {
      cancelled = true;
      for (const e of entries) e.listeners.delete(publish);
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
