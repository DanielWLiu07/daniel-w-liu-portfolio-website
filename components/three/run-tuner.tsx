'use client';

/**
 * Live sliders for the running gait.
 *
 * The run is the hardest pose to get right by reasoning, because rotations
 * compound down the neck: the same number on neck1 and neck4 do very different
 * things, and the head inherits the sum of everything below it. Tuning it by
 * editing constants and reloading is slow enough that it discourages trying.
 *
 * The readouts are the point as much as the sliders. A coefficient means
 * nothing on its own, so the panel shows what actually resulted — the beak's
 * angle and how far the head sits ahead of and above the hips — and prints the
 * values back as source, so a setting that looks right can be pasted into
 * RUN_DEFAULTS rather than written down.
 */
import { useState } from 'react';

import type { RunTuning } from './goose/goose-actor';

export interface RunTunerProps {
  value: RunTuning;
  onChange: (next: RunTuning) => void;
  /** Live feedback, measured off the rig. */
  beakAngle: number;
  headAhead: number;
  headAbove: number;
  /** Bones currently pinned against a joint limit. */
  clamped: string[];
  showBones: boolean;
  onShowBones: (v: boolean) => void;
  onReset: () => void;
}

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

export default function RunTuner({
  value,
  onChange,
  beakAngle,
  headAhead,
  headAbove,
  clamped,
  showBones,
  onShowBones,
  onReset,
}: RunTunerProps) {
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<RunTuning>) => onChange({ ...value, ...patch });
  const setNeck = (i: number, v: number) => {
    const neck = value.neck.slice();
    neck[i] = v;
    set({ neck });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 block underline underline-offset-2 hover:text-neutral-900"
      >
        tune the run
      </button>
    );
  }

  const snippet = `speed: ${value.speed.toFixed(2)}, headTilt: ${value.headTilt.toFixed(
    2,
  )}, bodyPitch: ${value.bodyPitch.toFixed(2)},
neck: [${value.neck.map((n) => n.toFixed(2)).join(', ')}]`;

  return (
    <div className="mt-2 w-[19rem] rounded bg-white/80 p-2">
      <div className="mb-1 flex items-center justify-between">
        <b>run gait</b>
        <span className="space-x-2">
          <button type="button" onClick={onReset} className="underline underline-offset-2">
            reset
          </button>
          <button type="button" onClick={() => setOpen(false)} className="underline underline-offset-2">
            hide
          </button>
        </span>
      </div>

      <label className="mb-1 flex items-center gap-2">
        <input
          type="checkbox"
          checked={value.hold}
          onChange={(e) => set({ hold: e.target.checked })}
          className="accent-neutral-700"
        />
        <span className="text-neutral-600">hold the run pose while standing</span>
      </label>
      <label className="mb-1 flex items-center gap-2">
        <input
          type="checkbox"
          checked={showBones}
          onChange={(e) => onShowBones(e.target.checked)}
          className="accent-neutral-700"
        />
        <span className="text-neutral-600">show the skeleton</span>
      </label>
      <Row label="speed" value={value.speed} min={0.2} max={6} onChange={(v) => set({ speed: v })} />
      <Row
        label="body"
        value={value.bodyPitch}
        min={-1.2}
        max={2.5}
        onChange={(v) => set({ bodyPitch: v })}
      />
      <Row
        label="head"
        value={value.headTilt}
        min={-3}
        max={6}
        onChange={(v) => set({ headTilt: v })}
      />
      {value.neck.map((n, i) => (
        <Row
          key={i}
          label={`neck${i + 1}`}
          value={n}
          min={-1.6}
          max={1.9}
          onChange={(v) => setNeck(i, v)}
        />
      ))}

      <div className="mt-1 border-t border-neutral-300 pt-1 text-neutral-600">
        beak {beakAngle >= 0 ? '+' : ''}
        {beakAngle.toFixed(0)}&deg; &middot; head {headAhead.toFixed(2)} ahead,{' '}
        {headAbove.toFixed(2)} above hips
        {clamped.length > 0 && (
          <div className="text-amber-700">
            at joint limit: {clamped.join(', ')} — further slider movement on
            these does nothing
          </div>
        )}
      </div>
      <pre className="mt-1 overflow-x-auto text-[10px] leading-snug text-neutral-500">{snippet}</pre>
    </div>
  );
}
