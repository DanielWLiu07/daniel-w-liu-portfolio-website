"use client";

/**
 * Live sliders for the water.
 *
 * The numbers here are unreadable on their own. "float 0.49" says nothing
 * about whether the goose looks right, and the honest question — does it sit
 * in the water the way a real one does — is answered by where the waterline
 * crosses the body. So the panel reports that: the percentage up the torso,
 * next to the reference band a real goose sits in.
 *
 * The torso's extent is skinned off the real mesh, but ONCE, and the body is
 * treated as rigid after that. Pose moves it a few points either way — this
 * reads 46% where an exact per-frame scan reads 40% — so trust it for tuning
 * and not as a measurement.
 *
 * Bed depth is here too because it is the same judgement seen from the other
 * side. It decides where wading ends and swimming begins, and a pond that
 * looks shallow at the rim while dropping the goose to full float there is the
 * tell that the shading and the buoyancy were tuned apart from each other.
 */
import { useState } from "react";

import type { WaterTuning } from "./goose/goose-actor";

export interface WaterTunerProps {
  value: WaterTuning;
  onChange: (next: WaterTuning) => void;
  /** Where the waterline crosses the torso, 0..1. Measured, not derived. */
  waterline: number;
  /** 0 on dry land, 1 at full float. */
  swim: number;
  onReset: () => void;
}

/** Roughly where a real goose sits. Used to mark the readout, not to clamp. */
const REAL_LOW = 0.35;
const REAL_HIGH = 0.5;

function Row({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-neutral-500">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-28 accent-neutral-700"
      />
      <b className="w-12 shrink-0 tabular-nums">{value.toFixed(2)}</b>
    </label>
  );
}

export default function WaterTuner({
  value,
  onChange,
  waterline,
  swim,
  onReset,
}: WaterTunerProps) {
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<WaterTuning>) => onChange({ ...value, ...patch });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 block underline underline-offset-2 hover:text-neutral-900"
      >
        tune the water
      </button>
    );
  }

  const pct = Math.round(waterline * 100);
  const inRange = waterline >= REAL_LOW && waterline <= REAL_HIGH;

  const snippet = `FLOAT_DEPTH = ${value.float.toFixed(2)}
POND.depth  = ${value.bed.toFixed(2)}
SWIM_SPEED  = ${value.speed.toFixed(2)}
STROKE_RATE = ${value.stroke.toFixed(2)}`;

  return (
    <div className="mt-2 w-[19rem] rounded bg-white/80 p-2">
      <div className="mb-1 flex items-center justify-between">
        <b>water</b>
        <span className="space-x-2">
          <button
            type="button"
            onClick={onReset}
            className="underline underline-offset-2"
          >
            reset
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="underline underline-offset-2"
          >
            hide
          </button>
        </span>
      </div>

      <Row
        label="float"
        value={value.float}
        min={0}
        max={1.2}
        onChange={(v) => set({ float: v })}
      />
      <Row
        label="bed"
        value={value.bed}
        min={0.1}
        max={2}
        onChange={(v) => set({ bed: v })}
      />
      <Row
        label="speed"
        value={value.speed}
        min={0.1}
        max={3}
        onChange={(v) => set({ speed: v })}
      />
      <Row
        label="stroke"
        value={value.stroke}
        min={0.5}
        max={14}
        step={0.1}
        onChange={(v) => set({ stroke: v })}
      />

      <div className="mt-1 border-t border-neutral-300 pt-1 text-neutral-600">
        {swim < 0.02 ? (
          <span>on dry land — walk into the pond to read the waterline</span>
        ) : (
          <span>
            waterline{" "}
            <b className={inRange ? "text-emerald-700" : "text-amber-700"}>
              {pct}%
            </b>{" "}
            up the torso &middot; afloat {(swim * 100).toFixed(0)}%
            <div className="text-neutral-500">
              a real goose sits at {REAL_LOW * 100}&ndash;{REAL_HIGH * 100}%
            </div>
          </span>
        )}
      </div>
      <pre className="mt-1 overflow-x-auto text-[10px] leading-snug text-neutral-500">
        {snippet}
      </pre>
    </div>
  );
}
