"use client";

/**
 * Renders whatever schema the scene window sent.
 *
 * Knows nothing about geese, water or gaits. Every panel in the app is this
 * component with different data, which is the point: a new panel is a
 * registration on the host, not a new page and not a new component.
 *
 * Lives in the app rather than the library because the library is deliberately
 * framework-agnostic — its panel code is plain TypeScript so a non-React page
 * can drive it too. React is this file's business alone.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  precisionOf,
  type Control,
  type PanelSnapshot,
  type PanelValue,
} from "blender-to-threejs";

function num(v: PanelValue | undefined, fallback = 0): number {
  return typeof v === "number" ? v : fallback;
}

function Slider({
  control,
  value,
  onChange,
}: {
  control: Extract<Control, { kind: "slider" }>;
  value: number;
  onChange: (v: number) => void;
}) {
  const dp = precisionOf(control);
  return (
    <label className="flex items-center gap-2 py-0.5">
      <span className="w-20 shrink-0 truncate text-neutral-500">
        {control.label}
      </span>
      <input
        type="range"
        className="min-w-0 flex-1 accent-neutral-700"
        min={control.min}
        max={control.max}
        step={control.step ?? 0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="w-12 shrink-0 text-right tabular-nums text-neutral-400">
        {value.toFixed(dp)}
      </span>
    </label>
  );
}

function Readout({
  control,
  value,
}: {
  control: Extract<Control, { kind: "readout" }>;
  value: number;
}) {
  // The warning colour is the whole reason a readout differs from a slider
  // label: it is how a number says "this setting is out of range" without
  // anyone having to remember what the ceiling was.
  const warn =
    control.warnAbove !== undefined && Math.abs(value) > control.warnAbove;
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="w-20 shrink-0 truncate text-neutral-500">
        {control.label}
      </span>
      <span
        className={`flex-1 text-right tabular-nums ${
          warn ? "text-amber-600" : "text-neutral-400"
        }`}
      >
        {value.toFixed(precisionOf(control))}
        {control.unit ? (
          <span className="ml-0.5 text-neutral-500">{control.unit}</span>
        ) : null}
      </span>
    </div>
  );
}

function Snippet({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard permission can be refused in a popup. Selecting the text is
      // a working fallback and needs no permission.
      area.current?.select();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }, [text]);
  return (
    <div className="py-1">
      <div className="flex items-center justify-between pb-1">
        <span className="text-neutral-500">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="border border-neutral-300 px-1.5 py-0.5 text-neutral-600 hover:bg-neutral-100"
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <textarea
        ref={area}
        readOnly
        value={text}
        onFocus={(e) => e.target.select()}
        className="h-24 w-full resize-none border border-neutral-200 bg-neutral-50 p-1 font-mono text-[11px] leading-snug text-neutral-700"
      />
    </div>
  );
}

export default function PanelView({
  snapshot,
  onSet,
  onPress,
}: {
  snapshot: PanelSnapshot;
  onSet: (key: string, value: PanelValue) => void;
  onPress: (key: string) => void;
}) {
  const { schema, values, readouts, snippets, connected } = snapshot;

  // Keep the OS window's title bar useful when several are parked side by side.
  useEffect(() => {
    if (schema) document.title = schema.title;
  }, [schema]);

  if (!schema) {
    return (
      <div className="p-3 text-neutral-500">
        waiting for the scene…
        <div className="pt-1 text-neutral-400">
          Open the page this panel belongs to. It reconnects on its own.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {!connected ? (
        // Stale values render perfectly happily, which makes a dead panel look
        // live and its controls look broken. Say so instead.
        <div className="bg-amber-100 px-3 py-1 text-amber-800">
          scene disconnected — values are the last seen
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {schema.controls.map((c, i) => {
          switch (c.kind) {
            case "section":
              return (
                <div
                  key={`s${i}`}
                  className="mt-3 border-b border-neutral-200 pb-1 pt-1 text-neutral-400 first:mt-0"
                >
                  {c.label}
                </div>
              );
            case "slider":
              return (
                <Slider
                  key={c.key}
                  control={c}
                  value={num(values[c.key], c.min)}
                  onChange={(v) => onSet(c.key, v)}
                />
              );
            case "toggle":
              return (
                <label key={c.key} className="flex items-center gap-2 py-0.5">
                  <input
                    type="checkbox"
                    checked={Boolean(values[c.key])}
                    onChange={(e) => onSet(c.key, e.target.checked)}
                  />
                  <span className="text-neutral-600">{c.label}</span>
                </label>
              );
            case "select":
              return (
                <label key={c.key} className="flex items-center gap-2 py-0.5">
                  <span className="w-20 shrink-0 truncate text-neutral-500">
                    {c.label}
                  </span>
                  <select
                    className="flex-1 border border-neutral-300 bg-white px-1 py-0.5"
                    value={String(values[c.key] ?? "")}
                    onChange={(e) => onSet(c.key, e.target.value)}
                  >
                    {c.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              );
            case "readout":
              return (
                <Readout key={c.key} control={c} value={num(readouts[c.key])} />
              );
            case "button":
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => onPress(c.key)}
                  className="my-1 border border-neutral-300 px-2 py-1 text-neutral-600 hover:bg-neutral-100"
                >
                  {c.label}
                </button>
              );
            case "snippet":
              return (
                <Snippet
                  key={c.key}
                  label={c.label}
                  text={snippets[c.key] ?? ""}
                />
              );
          }
        })}
      </div>
    </div>
  );
}
