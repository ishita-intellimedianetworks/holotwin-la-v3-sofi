'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadFloorGlb, pixelDimsFor, renderFloorToPng,
  type FloorEntry, type RenderMode,
} from './render-floor';

/**
 * /admin/bounds — upload a model GLB, render a full top-down "photo", download it
 * as the scene's floorplanUrl PNG, and copy the model XZ bounds for scenes.json.
 */
const PPM_PRESETS = [25, 50, 75, 100];
const THUMB_MAX = 320;

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 text-gray-400">
      <div className="h-6 w-6 rounded-full border-2 border-gray-600 border-t-blue-500 animate-spin" />
      <span className="text-xs">{label}</span>
    </div>
  );
}

export default function BoundsTool() {
  const [entries, setEntries] = useState<FloorEntry[]>([]);
  const [ppm, setPpm] = useState(50);
  const [mode, setMode] = useState<RenderMode>('native');
  const [busy, setBusy] = useState(false);

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const loaded = await Promise.all(
        Array.from(files).map((f) => loadFloorGlb(f).catch((e) => { console.error(e); return null; })),
      );
      setEntries((prev) => [...prev, ...loaded.filter((x): x is FloorEntry => !!x)]);
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-4">
        <h1 className="text-lg font-semibold">Bounds Calibrate · Floor-plan generator</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Upload a model GLB → render the full top-down view → download as the scene&apos;s
          <code className="font-mono text-gray-400"> floorplanUrl </code> PNG (drop into
          <code className="font-mono text-gray-400"> public/ </code>), and copy its
          <code className="font-mono text-gray-400"> bounds </code> into
          <code className="font-mono text-gray-400"> src/components-v5/shared/data/scenes.json</code>.
        </p>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        <div className="rounded-lg border border-gray-800 p-4 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Upload model GLB(s)</label>
            <input
              type="file" accept=".glb,.gltf" multiple disabled={busy}
              onChange={(e) => { handleUpload(e.target.files); e.target.value = ''; }}
              className="text-xs text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-blue-600 file:text-white file:text-xs file:cursor-pointer hover:file:bg-blue-700 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Pixels per metre</label>
            <div className="flex gap-2 flex-wrap">
              {PPM_PRESETS.map((p) => (
                <button key={p} onClick={() => setPpm(p)}
                  className={`text-xs px-3 py-1.5 rounded ${ppm === p ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Render mode</label>
            <div className="flex gap-2">
              {(['native', 'silhouette'] as RenderMode[]).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`text-xs px-3 py-1.5 rounded flex-1 capitalize ${mode === m ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>

        {busy && (
          <div className="rounded-lg border border-dashed border-gray-800 py-10">
            <Spinner label="Loading model…" />
          </div>
        )}

        {!busy && entries.length === 0 ? (
          <div className="text-center text-gray-500 py-16 border border-dashed border-gray-800 rounded-lg">
            Upload a model GLB to begin.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {entries.map((e, i) => (
              <FloorCard key={`${e.fileName}-${i}`} entry={e} ppm={ppm} mode={mode}
                onRemove={() => setEntries((prev) => prev.filter((_, idx) => idx !== i))} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

function FloorCard({ entry, ppm, mode, onRemove }: { entry: FloorEntry; ppm: number; mode: RenderMode; onRemove: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [rendering, setRendering] = useState(true);
  const [result, setResult] = useState<
    | { ok: true; url: string; bounds: { minX: number; maxX: number; minZ: number; maxZ: number }; width: number; height: number }
    | { ok: false; error: string }
    | null
  >(null);

  const { w: pixelW, h: pixelH } = pixelDimsFor(entry.bbox, ppm);

  // Render off the click frame so the "Rendering…" spinner can paint first —
  // a large model's top-down render blocks the main thread for a moment.
  useEffect(() => {
    let cancelled = false;
    setRendering(true);
    setResult(null);
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      try {
        const r = renderFloorToPng(entry, pixelW, pixelH, mode);
        if (!cancelled) setResult({ ok: true, ...r });
      } catch (e) {
        if (!cancelled) setResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
      } finally {
        if (!cancelled) setRendering(false);
      }
    });
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [entry, pixelW, pixelH, mode]);

  // Draw the cropped (transparent, model-tight) image into the preview at its
  // own aspect ratio — no fill, so transparency shows through the checkerboard.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !result?.ok) return;
    const { width, height, url } = result;
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(THUMB_MAX / width, THUMB_MAX / height, 1);
      cv.width = Math.max(1, Math.round(width * scale));
      cv.height = Math.max(1, Math.round(height * scale));
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
    };
    img.src = url;
  }, [result]);

  const base = entry.fileName.replace(/\.(glb|gltf)$/i, '');
  const boundsJson = result?.ok
    ? JSON.stringify({
        minX: round(result.bounds.minX), maxX: round(result.bounds.maxX),
        minZ: round(result.bounds.minZ), maxZ: round(result.bounds.maxZ),
      })
    : null;

  // Transparent checkerboard so the model's transparent margin is obvious.
  const checker =
    'repeating-conic-gradient(#374151 0% 25%, #1f2937 0% 50%) 50% / 16px 16px';

  return (
    <div className="rounded-lg border border-gray-800 p-3 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate" title={entry.fileName}>{entry.fileName}</p>
          <p className="text-[11px] text-gray-500 font-mono">
            {round(entry.bbox.dx)} × {round(entry.bbox.dz)} m
            {result?.ok ? ` · cropped ${result.width}×${result.height}px` : ` · ${pixelW}×${pixelH}px`}
          </p>
        </div>
        <button onClick={onRemove} className="text-xs text-red-400 hover:underline">remove</button>
      </div>

      <div
        className="border border-gray-800 rounded flex items-center justify-center min-h-[180px] overflow-hidden"
        style={{ background: rendering || !result?.ok ? '#111827' : checker }}
      >
        {rendering
          ? <Spinner label="Rendering top-down…" />
          : result?.ok
            ? <canvas ref={canvasRef} className="block" />
            : <p className="text-xs text-red-400 p-3">render failed: {result?.error}</p>}
      </div>

      <div className="flex gap-2">
        <a
          href={result?.ok ? result.url : undefined}
          download={`${base}.png`}
          className={`text-xs px-3 py-1.5 rounded text-center flex-1 ${result?.ok ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-800 text-gray-500 pointer-events-none'}`}
        >
          Download PNG
        </a>
        <button
          disabled={!boundsJson}
          onClick={() => { if (!boundsJson) return; navigator.clipboard.writeText(`"bounds": ${boundsJson}`); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="text-xs px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-50"
        >
          {copied ? 'Copied!' : 'Copy bounds'}
        </button>
      </div>

      {boundsJson && (
        <pre className="text-[11px] text-gray-400 font-mono bg-gray-900 rounded p-2 overflow-x-auto">{`"bounds": ${boundsJson}`}</pre>
      )}
    </div>
  );
}
