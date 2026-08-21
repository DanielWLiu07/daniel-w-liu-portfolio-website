'use client';

/**
 * Live sliders for the honk marks.
 *
 * These numbers were argued into place one reload at a time — how far off the
 * bill the marks stand, how wide the fan opens, how long a stroke is before it
 * starts being eaten from the back. Several of them were wrong for a while in
 * ways that were obvious on screen and invisible in the source, because a
 * distance in world units means nothing until you see it next to a goose.
 *
 * As with the run tuner, the panel prints the settings back as source, so a
 * fan that looks right can be pasted into HONK_DEFAULTS rather than copied out
 * by hand.
 */
import { useState } from 'react';

import { HONK_DEFAULTS, type HonkTuning } from './honk-lines';

function Row({
  label,
  value,
  min,
  max,
  step = 0.01,
  digits = 2,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  digits?: number;
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
      <b className="w-12 shrink-0 tabular-nums">{value.toFixed(digits)}</b>
    </label>
  );
}

export default function HonkTuner({
  value,
  onChange,
  onReset,
}: {
  value: HonkTuning;
  onChange: (next: HonkTuning) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const set = (patch: Partial<HonkTuning>) => onChange({ ...value, ...patch });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 block underline underline-offset-2 hover:text-neutral-900"
      >
        tune the honk
      </button>
    );
  }

  /**
   * Exactly the body of HONK_DEFAULTS, one field per line.
   *
   * Not a summary — a paste. Field names match HonkTuning, trailing commas are
   * there, and `trim` drops the numbers back to their shortest exact form so a
   * slider that landed on 0.6 does not arrive in the source as 0.60.
   */
  const trim = (n: number) => String(Number(n.toFixed(4)));
  const snippet = [
    `strokes: ${Math.round(value.strokes)},`,
    `life: ${trim(value.life)},`,
    `spread: ${trim(value.spread)},`,
    `near: ${trim(value.near)},`,
    `len: ${trim(value.len)},`,
    `width: ${trim(value.width)},`,
    `bow: ${trim(value.bow)},`,
    `wiggle: ${trim(value.wiggle)},`,
    `headDone: ${trim(value.headDone)},`,
    `tailStart: ${trim(value.tailStart)},`,
    `spacing: ${trim(value.spacing)},`,
  ].join('\n');

  const deg = (r: number) => `${((r * 180) / Math.PI).toFixed(0)}°`;

  return (
    <div className="mt-2 w-[19rem] rounded bg-white/80 p-2">
      <div className="mb-1 flex items-center justify-between">
        <b>honk marks</b>
        <span className="space-x-2">
          <button
            type="button"
            onClick={() => {
              // Clipboard access is refused on insecure origins and in some
              // embeds, and a copy button that silently does nothing is worse
              // than none — say so rather than flashing "copied".
              navigator.clipboard?.writeText(snippet).then(
                () => setCopied(true),
                () => setCopied(false),
              );
              window.setTimeout(() => setCopied(false), 1200);
            }}
            className="underline underline-offset-2"
          >
            {copied ? 'copied' : 'copy'}
          </button>
          <button type="button" onClick={onReset} className="underline underline-offset-2">
            reset
          </button>
          <button type="button" onClick={() => setOpen(false)} className="underline underline-offset-2">
            hide
          </button>
        </span>
      </div>

      {/* Shape and placement. */}
      <Row
        label="count"
        value={value.strokes}
        min={1}
        max={6}
        step={1}
        digits={0}
        onChange={(v) => set({ strokes: v })}
      />
      <Row label="spread" value={value.spread} min={0} max={1.5} onChange={(v) => set({ spread: v })} />
      {/* Angular fan versus parallel offset — at a tight spread the second is
          the only thing keeping the marks off each other. */}
      <Row
        label="space"
        value={value.spacing}
        min={0}
        max={0.3}
        step={0.005}
        digits={3}
        onChange={(v) => set({ spacing: v })}
      />
      <Row label="gap" value={value.near} min={0} max={0.6} onChange={(v) => set({ near: v })} />
      <Row label="length" value={value.len} min={0.05} max={0.7} onChange={(v) => set({ len: v })} />
      <Row
        label="width"
        value={value.width}
        min={0.005}
        max={0.15}
        step={0.005}
        digits={3}
        onChange={(v) => set({ width: v })}
      />
      <Row
        label="bow"
        value={value.bow}
        min={0}
        max={0.12}
        step={0.002}
        digits={3}
        onChange={(v) => set({ bow: v })}
      />

      {/* Timing. The two below are fractions of `life`, not seconds. */}
      <Row label="life" value={value.life} min={0.06} max={1} onChange={(v) => set({ life: v })} />
      <Row
        label="draw"
        value={value.headDone}
        min={0.05}
        max={1}
        onChange={(v) => set({ headDone: v })}
      />
      <Row
        label="erase"
        value={value.tailStart}
        min={0.05}
        max={0.98}
        onChange={(v) => set({ tailStart: v })}
      />
      <Row
        label="wiggle"
        value={value.wiggle}
        min={0}
        max={14}
        step={0.1}
        digits={1}
        onChange={(v) => set({ wiggle: v })}
      />

      <div className="mt-1 border-t border-neutral-300 pt-1 text-neutral-600">
        fan {deg(value.spread * 2)} across &middot; marks live{' '}
        {(value.life * 1000).toFixed(0)}ms
        <div>
          drawn by {(value.headDone * value.life * 1000).toFixed(0)}ms, erase starts{' '}
          {(value.tailStart * value.life * 1000).toFixed(0)}ms
        </div>
        {value.tailStart <= value.headDone && (
          <div className="text-neutral-500">
            erase overlaps the draw, so a mark never reaches full length — a
            travelling dash rather than a struck line. Deliberate is fine; it is
            only worth knowing that `length` is now a speed rather than a size.
          </div>
        )}
      </div>
      <div className="mt-1 text-[10px] text-neutral-400">
        paste over the body of HONK_DEFAULTS in honk-lines.tsx
      </div>
      <pre
        className="overflow-x-auto text-[10px] leading-snug text-neutral-500 select-all"
        onClick={(e) => {
          // Select-all on click as well as the button, for when the clipboard
          // API is unavailable and you just want to hit cmd-C.
          const r = document.createRange();
          r.selectNodeContents(e.currentTarget);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(r);
        }}
      >
        {snippet}
      </pre>
    </div>
  );
}
