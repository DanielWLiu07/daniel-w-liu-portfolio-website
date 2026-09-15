"use client";

/**
 * Blender's Shader Editor and Compositor, over this library's own graphs.
 *
 * Not a port of Blender's node editor — a view of the node system that already
 * exists here. `viewer/layout.ts` has drawn Blender-shaped graphs since before
 * the panels did: category-coloured headers, Blender's own node names, input
 * sockets on the left with literal defaults inline, links as bezier wires. All
 * that was missing was somewhere to put it that is not a separate dev server.
 *
 * Material and compositor graphs share the `{id, type, params, inputs}` shape,
 * so ONE editor serves both domains — which is also true in Blender, where the
 * shader editor and the compositor are the same editor in different modes.
 *
 * Read-only for now. Editing a graph from here means round-tripping edits back
 * into a builder call, which is a real piece of work and not one to fake.
 */
import {
  getGraph,
  layoutGraph,
  listGraphs,
  renderSVG,
  type PanelSchema,
  type PanelValue,
} from "blender-to-threejs";

export const SHADER_PANEL: PanelSchema = {
  id: "shader",
  title: "shader editor",
  width: 900,
  height: 700,
  controls: [
    { kind: "select", key: "graph", label: "graph", options: [] },
    { kind: "readout", key: "nodes", label: "nodes", precision: 0 },
    { kind: "svg", key: "canvas", label: "" },
    { kind: "section", label: "" },
    { kind: "snippet", key: "about", label: "what this graph is" },
  ],
};

/**
 * The schema with the registry's graphs filled in.
 *
 * Built at registration rather than declared, because an application adds its
 * own graphs with `registerGraph` at import time and the list is only known
 * once those have run.
 */
export function shaderSchema(): PanelSchema {
  const names = listGraphs().sort();
  return {
    ...SHADER_PANEL,
    controls: SHADER_PANEL.controls.map((c) =>
      c.kind === "select" && c.key === "graph"
        ? {
            ...c,
            options: names.map((n) => ({ value: n, label: n })),
          }
        : c,
    ),
  };
}

/** Which graph is showing. Held here so the host stays a thin binding. */
let selected = "";

export function shaderValues(): Record<string, PanelValue> {
  if (!selected) selected = listGraphs().sort()[0] ?? "";
  return { graph: selected };
}

export function shaderSet(key: string, value: PanelValue): void {
  if (key === "graph") selected = String(value);
}

/**
 * Render the selected graph.
 *
 * Building and laying out is cheap and only happens when the selection changes
 * or a panel reconnects, so there is no cache to invalidate — and a stale
 * cached graph would be worse than a re-render, because the whole point is
 * seeing what the code currently produces.
 */
export function shaderSnippets(): Record<string, string> {
  const entry = selected ? getGraph(selected) : undefined;
  if (!entry) return { canvas: "", about: "no graph selected" };
  try {
    const root = entry.build();
    return {
      canvas: renderSVG(layoutGraph(root), selected),
      about: `${entry.domain} · ${entry.about}`,
    };
  } catch (err) {
    // A graph that throws while building is worth SEEING rather than blanking
    // the panel — it usually means a recipe's options changed under it.
    return {
      canvas: "",
      about: `failed to build: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function shaderReadouts(): Record<string, number> {
  const entry = selected ? getGraph(selected) : undefined;
  if (!entry) return { nodes: 0 };
  try {
    return { nodes: layoutGraph(entry.build()).nodes.length };
  } catch {
    return { nodes: 0 };
  }
}
