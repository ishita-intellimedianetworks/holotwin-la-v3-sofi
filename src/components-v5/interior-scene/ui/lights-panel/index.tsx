"use client";

/**
 * LightsPanel — an on-screen authoring panel to tune the active venue's lighting
 * in real time. Mounted only when the venue's `lights.controls` flag is set.
 *
 * It edits the live `useLightsStore` values (which SceneLights renders from), so
 * every change is reflected immediately in the 3D scene. "Copy JSON" writes the
 * current values back as a `lights` block ready to paste into scenes.json.
 */

import { useState } from "react";
import { Copy, Check, SlidersHorizontal, X } from "lucide-react";
import { useLightsStore } from "@/components-v5/shared/store/lights-store";
import type { ResolvedLights } from "@/components-v5/shared/types";

const MAP_SIZES = [512, 1024, 2048, 4096] as const;

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-1">{children}</div>;
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  fmt = (v: number) => v.toString(),
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
}) {
  return (
    <Row>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-white/70">{label}</span>
        <span className="text-[11px] font-semibold tabular-nums text-white">{fmt(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-[#3b82f6]"
      />
    </Row>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Row>
      <span className="text-[11px] font-medium text-white/70">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-10 cursor-pointer rounded border border-white/20 bg-transparent p-0"
        />
        <span className="text-[11px] font-semibold uppercase tabular-nums text-white">{value}</span>
      </div>
    </Row>
  );
}

export function LightsPanel({ interior = false }: { interior?: boolean }) {
  const values = useLightsStore((s) => s.values);
  const enabled = useLightsStore((s) => s.enabled);
  const setField = useLightsStore((s) => s.setField);
  const shadows = useLightsStore((s) => s.shadows);
  const setShadows = useLightsStore((s) => s.setShadows);
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  if (!enabled || !values) return null;

  const set =
    <K extends keyof ResolvedLights>(k: K) =>
    (v: ResolvedLights[K]) =>
      setField(k, v);

  const setDir = (axis: 0 | 1 | 2) => (v: number) => {
    const next = [...values.sunDirection] as [number, number, number];
    next[axis] = v;
    setField("sunDirection", next);
  };

  const copyJson = () => {
    const block = {
      shadows,
      lights: {
        ambientIntensity: round(values.ambientIntensity),
        ambientColor: values.ambientColor,
        envIntensity: round(values.envIntensity),
        envFile: values.envFile,
        sunIntensity: round(values.sunIntensity),
        sunColor: values.sunColor,
        sunDirection: values.sunDirection.map((n) => round(n)),
        shadowMapSize: values.shadowMapSize,
        shadowRadius: round(values.shadowRadius),
        shadowBias: round(values.shadowBias, 4),
        shadowNormalBias: round(values.shadowNormalBias),
        spotIntensity: round(values.spotIntensity),
        spotColor: values.spotColor,
        spotHeight: round(values.spotHeight),
        spotAngle: round(values.spotAngle),
        spotPenumbra: round(values.spotPenumbra),
        spotDistance: round(values.spotDistance),
        spotDecay: round(values.spotDecay),
      },
    };
    navigator.clipboard?.writeText(JSON.stringify(block, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        title="Lighting controls"
        onClick={() => setOpen(true)}
        className="fixed right-4 top-4 z-[140] flex h-10 w-10 items-center justify-center rounded-[12px] border border-white/15 bg-black/60 text-white backdrop-blur-md hover:brightness-125"
      >
        <SlidersHorizontal size={18} />
      </button>
    );
  }

  return (
    <div className="fixed right-4 top-4 z-[140] flex max-h-[calc(100vh-32px)] w-[260px] flex-col rounded-[14px] border border-white/15 bg-black/70 text-white shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={15} className="text-white/80" />
          <span className="text-[12.5px] font-semibold">Lighting</span>
        </div>
        <button
          type="button"
          title="Hide"
          onClick={() => setOpen(false)}
          className="text-white/60 hover:text-white"
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex flex-col gap-3.5 overflow-y-auto px-3.5 py-3">
        <Slider label="Ambient" value={values.ambientIntensity} min={0} max={3} step={0.05} onChange={set("ambientIntensity")} fmt={(v) => v.toFixed(2)} />
        <ColorField label="Ambient color" value={values.ambientColor} onChange={set("ambientColor")} />
        <Slider label="Environment (HDR)" value={values.envIntensity} min={0} max={3} step={0.05} onChange={set("envIntensity")} fmt={(v) => v.toFixed(2)} />

        <div className="my-0.5 h-px bg-white/10" />

        <Slider label="Sun intensity" value={values.sunIntensity} min={0} max={20} step={0.1} onChange={set("sunIntensity")} fmt={(v) => v.toFixed(1)} />
        <ColorField label="Sun color" value={values.sunColor} onChange={set("sunColor")} />
        <Slider label="Sun dir X" value={values.sunDirection[0]} min={-10} max={10} step={0.1} onChange={setDir(0)} fmt={(v) => v.toFixed(1)} />
        <Slider label="Sun dir Y" value={values.sunDirection[1]} min={-10} max={10} step={0.1} onChange={setDir(1)} fmt={(v) => v.toFixed(1)} />
        <Slider label="Sun dir Z" value={values.sunDirection[2]} min={-10} max={10} step={0.1} onChange={setDir(2)} fmt={(v) => v.toFixed(1)} />

        <div className="my-0.5 h-px bg-white/10" />

        {/* Shadows master on/off — disables the whole shadow path live. */}
        <button
          type="button"
          onClick={() => setShadows(!shadows)}
          className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-2.5 py-2 hover:bg-white/10"
        >
          <span className="text-[11.5px] font-medium text-white/80">Shadows</span>
          <span
            className={`relative h-[18px] w-[32px] rounded-full transition-colors ${
              shadows ? "bg-[#3b82f6]" : "bg-white/20"
            }`}
          >
            <span
              className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-transform ${
                shadows ? "translate-x-[16px]" : "translate-x-[2px]"
              }`}
            />
          </span>
        </button>

        {/* Shadow detail controls — only meaningful while shadows are on. */}
        <div className={shadows ? "flex flex-col gap-3.5" : "pointer-events-none flex flex-col gap-3.5 opacity-40"}>
        <Row>
          <span className="text-[11px] font-medium text-white/70">Shadow map size</span>
          <div className="flex gap-1.5">
            {MAP_SIZES.map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => setField("shadowMapSize", sz)}
                className={`flex-1 rounded-md border px-1 py-1 text-[11px] font-semibold transition-colors ${
                  values.shadowMapSize === sz
                    ? "border-[#3b82f6] bg-[#3b82f6]/30 text-white"
                    : "border-white/15 bg-white/5 text-white/60 hover:bg-white/10"
                }`}
              >
                {sz}
              </button>
            ))}
          </div>
        </Row>
        <Slider label="Shadow radius (soft)" value={values.shadowRadius} min={0} max={10} step={0.1} onChange={set("shadowRadius")} fmt={(v) => v.toFixed(1)} />
        <Slider label="Shadow bias" value={values.shadowBias} min={-0.01} max={0.01} step={0.0001} onChange={set("shadowBias")} fmt={(v) => v.toFixed(4)} />
        <Slider label="Shadow normal bias" value={values.shadowNormalBias} min={0} max={2} step={0.05} onChange={set("shadowNormalBias")} fmt={(v) => v.toFixed(2)} />
        </div>

        {/* Interior spot light — the in-room ceiling spot that casts shadows.
            Only shown on interior venues (it's ignored on exteriors anyway). */}
        {interior && (
          <>
            <div className="my-0.5 h-px bg-white/10" />
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-white/40">Spot light · interior</div>
            <Slider label="Intensity" value={values.spotIntensity} min={0} max={50} step={0.5} onChange={set("spotIntensity")} fmt={(v) => v.toFixed(1)} />
            <ColorField label="Color" value={values.spotColor} onChange={set("spotColor")} />
            <Slider label="Height (above centre)" value={values.spotHeight} min={-3} max={5} step={0.05} onChange={set("spotHeight")} fmt={(v) => v.toFixed(2)} />
            <Slider label="Cone angle" value={values.spotAngle} min={0.1} max={1.57} step={0.01} onChange={set("spotAngle")} fmt={(v) => `${Math.round((v * 180) / Math.PI)}°`} />
            <Slider label="Penumbra (soft edge)" value={values.spotPenumbra} min={0} max={1} step={0.05} onChange={set("spotPenumbra")} fmt={(v) => v.toFixed(2)} />
            <Slider label="Range (0 = infinite)" value={values.spotDistance} min={0} max={50} step={0.5} onChange={set("spotDistance")} fmt={(v) => v.toFixed(1)} />
            <Slider label="Decay" value={values.spotDecay} min={0} max={3} step={0.1} onChange={set("spotDecay")} fmt={(v) => v.toFixed(1)} />
          </>
        )}
      </div>

      <div className="border-t border-white/10 p-2.5">
        <button
          type="button"
          onClick={copyJson}
          className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#3b82f6] py-2 text-[12px] font-semibold text-white transition-[filter] hover:brightness-110"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied!" : "Copy JSON"}
        </button>
      </div>
    </div>
  );
}

function round(n: number, dp = 3) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
