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
  /** Worst reach-guard drag, world units. Non-zero means over-striding. */
  drag: number;
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
  drag,
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
bounce: ${value.bounce.toFixed(3)}, rock: ${value.rock.toFixed(3)},
stride: ${value.stride.toFixed(2)}, crouch: ${value.crouch.toFixed(3)}, duty: ${value.duty.toFixed(2)}, roll: ${value.roll.toFixed(2)}, lift: ${value.lift.toFixed(1)},
headSteady: ${value.headSteady.toFixed(2)},
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
      {/* Drag this one at a WALK, not held — it cancels the waddle on its way
          up to the head, and the waddle is a walking thing. At 0 the head rolls
          with the hips and the goose reads as a chicken. */}
      {/* The walk vaults OVER a planted foot and the run sinks INTO it — these
          two are that inversion, and they are what separate a run from a brisk
          walk. See the note on `footfall` in goose-walk. */}
      {/* Stride is the number that decides whether a run is a run: speed is
          stride times cadence, and a run that gets its speed from cadence alone
          is a walk played fast. Watch `drag` below while raising it. */}
      <Row
        label="stride"
        value={value.stride}
        min={0}
        max={1.6}
        step={0.02}
        onChange={(v) => set({ stride: v })}
      />
      <Row
        label="lift"
        value={value.lift}
        min={0}
        max={5}
        step={0.1}
        onChange={(v) => set({ lift: v })}
      />
      {/* How high the feet pick up. A trot is legs, not body bounce. */}
      <Row
        label="weight"
        value={value.roll}
        min={0}
        max={1}
        onChange={(v) => set({ roll: v })}
      />
      {/* The waddle is the weight transfer. At 0 the run has none and reads as
          vibration; raising it costs head steadiness. */}
      <Row
        label="duty"
        value={value.duty}
        min={0}
        max={0.32}
        step={0.01}
        onChange={(v) => set({ duty: v })}
      />
      {/* Under 0.5 the stances stop overlapping and a flight phase opens — the
          line between a fast walk and a trot. Readout below. */}
      <Row
        label="crouch"
        value={value.crouch}
        min={0}
        max={0.18}
        step={0.005}
        onChange={(v) => set({ crouch: v })}
      />
      <Row
        label="bounce"
        value={value.bounce}
        min={0}
        max={0.2}
        step={0.005}
        onChange={(v) => set({ bounce: v })}
      />
      <Row
        label="rock"
        value={value.rock}
        min={0}
        max={0.3}
        step={0.005}
        onChange={(v) => set({ rock: v })}
      />
      <Row
        label="steady"
        value={value.headSteady}
        min={0}
        max={1}
        onChange={(v) => set({ headSteady: v })}
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
        <div>
          duty {(0.6 - value.duty).toFixed(2)}{' '}
          {0.6 - value.duty < 0.5
            ? `· flight ${((1 - 2 * (0.6 - value.duty)) * 100).toFixed(0)}% of cycle`
            : '· grounded, stances overlap'}
        </div>
        <div>
          stride {(0.5 * (1 + value.stride)).toFixed(2)} &middot; relative{' '}
          {((0.5 * (1 + value.stride)) / 0.45).toFixed(2)} &middot; cadence{' '}
          {(value.speed / (0.5 * (1 + value.stride))).toFixed(2)} Hz
        </div>
        {value.bounce > value.crouch * 2 + 1e-6 && (
          <div className="text-amber-700">
            bounce rises {(((value.bounce / 2 - value.crouch) * 100)).toFixed(1)} cm
            above standing height — the legs are straight there, so raise `crouch`
            to at least {(value.bounce / 2).toFixed(3)}
          </div>
        )}
        {drag > 0.002 && (
          <div className="text-amber-700">
            feet dragging {(drag * 100).toFixed(1)} cm — the stride is longer
            than the legs can reach, so the reach guard is pulling them back in.
            That is skating. Lower `stride` or raise `crouch`.
          </div>
        )}
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
