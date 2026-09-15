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
  type TreeNode,
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
  const dragging = useRef(false);
  const lastSent = useRef<number | null>(null);
  const [dragValue, setDragValue] = useState<number | null>(null);
  const shown = dragValue ?? value;
  const moveTo = (input: HTMLInputElement, clientX: number) => {
    const rect = input.getBoundingClientRect();
    // Match the native thumb's travel, including its half-width at each end.
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left - 8) / Math.max(1, rect.width - 16)));
    const step = control.step ?? 0.01;
    const raw = control.min + fraction * (control.max - control.min);
    const next = Number(Math.min(control.max, Math.max(control.min,
      control.min + Math.round((raw - control.min) / step) * step)).toFixed(dp));
    setDragValue(next);
    if (lastSent.current !== next) {
      lastSent.current = next;
      onChange(next);
    }
  };
  return (
    <label className="flex items-center gap-2 py-0.5">
      <span className="w-20 shrink-0 truncate text-neutral-500">
        {control.label}
      </span>
      <input
        type="range"
        className="min-w-0 flex-1 touch-none accent-neutral-700"
        min={control.min}
        max={control.max}
        step={control.step ?? 0.01}
        value={shown}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.focus();
          e.currentTarget.setPointerCapture(e.pointerId);
          dragging.current = true;
          lastSent.current = null;
          moveTo(e.currentTarget, e.clientX);
        }}
        onPointerMove={(e) => {
          if (dragging.current) moveTo(e.currentTarget, e.clientX);
        }}
        onPointerUp={(e) => {
          if (!dragging.current) return;
          moveTo(e.currentTarget, e.clientX);
          dragging.current = false;
          setDragValue(null);
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onLostPointerCapture={() => { dragging.current = false; setDragValue(null); }}
        onChange={(e) => {
          // Keyboard and assistive input retain the native range semantics.
          if (!dragging.current) onChange(Number(e.target.value));
        }}
      />
      <span className="w-12 shrink-0 text-right tabular-nums text-neutral-400">
        {shown.toFixed(dp)}
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

/**
 * A node graph, drawn as a pannable, zoomable picture.
 *
 * Rendered as an IMAGE rather than injected markup. An `<img>` cannot execute
 * script whatever ends up in a node's parameters, and it gives pan and zoom for
 * nothing — which a node graph needs, because the interesting ones are wider
 * than any window you would park on a second monitor.
 */
function GraphView({ label, svg }: { label: string; svg: string }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  const src = svg
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    : "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between pb-1">
        <span className="text-neutral-500">{label}</span>
        <span className="space-x-2 text-neutral-400">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(4, z * 1.25))}
            className="px-1 hover:text-neutral-800"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.15, z / 1.25))}
            className="px-1 hover:text-neutral-800"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="px-1 hover:text-neutral-800"
          >
            fit
          </button>
        </span>
      </div>
      <div
        className="min-h-0 flex-1 cursor-grab overflow-hidden bg-[#1d1d1d] active:cursor-grabbing"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onWheel={(e) => {
          // Blender zooms the node editor on the wheel, so this does too.
          setZoom((z) =>
            Math.min(4, Math.max(0.15, z * (e.deltaY < 0 ? 1.1 : 1 / 1.1))),
          );
        }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={label}
            src={src}
            draggable={false}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
              maxWidth: "none",
            }}
          />
        ) : (
          <div className="p-2 text-neutral-500">no graph selected</div>
        )}
      </div>
    </div>
  );
}

/**
 * One hierarchy row, and its children.
 *
 * Collapsed by default below the top level, which is Blender's behaviour and
 * the only way a rigged character does not bury the rest of the scene: one
 * goose is five meshes against twenty bones.
 */
function Row({
  node,
  depth,
  onSelect,
  onVisible,
}: {
  node: TreeNode;
  depth: number;
  onSelect: (id: string) => void;
  onVisible?: (id: string, visible: boolean) => void;
}) {
  const [open, setOpen] = useState(depth < 1);
  const kids = node.children ?? [];
  return (
    <>
      <div
        className={`flex items-center gap-1 py-px hover:bg-neutral-100 ${node.selected ? 'bg-blue-100 outline outline-1 outline-blue-400' : ''}`}
        style={{ paddingLeft: depth * 12 }}
      >
        {kids.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="w-3 shrink-0 text-neutral-400 hover:text-neutral-700"
            aria-label={open ? "collapse" : "expand"}
          >
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <button
          type="button"
          onClick={() => onSelect(node.id)}
          aria-pressed={node.selected ?? false}
          className={`min-w-0 flex-1 truncate text-left ${
            node.visible ? "text-neutral-700" : "text-neutral-400 line-through"
          }`}
          title={`${node.name} · ${node.type}`}
        >
          {node.name}
          <span className="pl-1.5 text-neutral-400">{node.type}</span>
        </button>
        {node.tris ? (
          <span className="shrink-0 tabular-nums text-neutral-400">
            {node.tris >= 1000
              ? `${(node.tris / 1000).toFixed(1)}k`
              : node.tris}
          </span>
        ) : null}
        {onVisible && <button
          type="button"
          onClick={() => onVisible(node.id, !node.visible)}
          className="w-4 shrink-0 text-neutral-400 hover:text-neutral-800"
          aria-label={node.visible ? "hide" : "show"}
          title={node.visible ? "hide" : "show"}
        >
          {node.visible ? "◉" : "○"}
        </button>}
      </div>
      {open
        ? kids.map((k) => (
            <Row
              key={k.id}
              node={k}
              depth={depth + 1}
              onSelect={onSelect}
              onVisible={onVisible}
            />
          ))
        : null}
    </>
  );
}

export default function PanelView({
  snapshot,
  onSet,
  onPress,
  onSelect,
}: {
  snapshot: PanelSnapshot;
  onSet: (key: string, value: PanelValue) => void;
  onPress: (key: string) => void;
  onSelect: (key: string, node: string, visible?: boolean) => void;
}) {
  const { schema, values, readouts, snippets, trees, connected } = snapshot;

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
            case "svg":
              return (
                <div key={c.key} className="h-[70vh] min-h-0 py-1">
                  <GraphView label={c.label} svg={snippets[c.key] ?? ""} />
                </div>
              );
            case "tree": {
              const roots = trees[c.key] ?? [];
              return (
                <div key={c.key} className="py-1">
                  {roots.length === 0 ? (
                    <div className="text-neutral-400">nothing in the scene</div>
                  ) : (
                    roots.map((n) => (
                      <Row
                        key={n.id}
                        node={n}
                        depth={0}
                        onSelect={(id) => onSelect(c.key, id)}
                        onVisible={c.visibility === false ? undefined : (id, v) => onSelect(c.key, id, v)}
                      />
                    ))
                  )}
                </div>
              );
            }
          }
        })}
      </div>
    </div>
  );
}
