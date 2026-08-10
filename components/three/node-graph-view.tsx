"use client";

/**
 * Draws the node graph that is actually shading the scene.
 */
import { useMemo } from "react";
import { isNode, type GraphNode, type NodeInput } from "blender-to-threejs";

const NODE_W = 172;
const HEADER_H = 24;
const ROW_H = 19;
const COL_GAP = 74;
const ROW_GAP = 18;
const PAD = 16;

/** Blender's own names, so the graph is readable by anyone who knows Blender. */
const LABELS: Record<string, string> = {
  ShaderNodeMath: "Math",
  ShaderNodeMixRGB: "Mix",
  ShaderNodeMix: "Mix",
  ShaderNodeMapRange: "Map Range",
  ShaderNodeValToRGB: "Color Ramp",
  ShaderNodeInvert: "Invert",
  ShaderNodeRGB: "RGB",
  ShaderNodeValue: "Value",
  ShaderNodeSeparateXYZ: "Separate XYZ",
  ShaderNodeCombineXYZ: "Combine XYZ",
  ShaderNodeTexImage: "Image Texture",
  // The builder's own node kinds, which are what a hand-authored graph
  // actually produces — the ShaderNode* names above come in from the Blender
  // exporter side. Both end up in the same graph, so both need labelling.
  GraphSeparate: "Separate XYZ",
  GraphCombine: "Combine XYZ",
  GraphTexture: "Image Texture",
  GraphUV: "Texture Coordinate",
  GraphPosition: "Geometry · Position",
  GraphNormal: "Geometry · Normal",
  GraphVertexColor: "Color Attribute",
  GraphTime: "Value · Time",
};

/** Header tint by category, following Blender's colour coding. */
function tint(type: string): string {
  if (type === "GraphSeparate" || type === "GraphCombine") return "#246283"; // converter
  if (
    type.startsWith("Graph") ||
    type === "ShaderNodeRGB" ||
    type === "ShaderNodeValue"
  ) {
    return "#83314a"; // input
  }
  if (
    type === "ShaderNodeValToRGB" ||
    type.includes("Mix") ||
    type === "ShaderNodeInvert"
  ) {
    return "#a1a11f"; // colour
  }
  return "#246283"; // converter
}

/** Socket names per node type, so inputs read as more than "input 0". */
const SOCKETS: Record<string, string[]> = {
  ShaderNodeMath: ["A", "B", "C"],
  ShaderNodeMixRGB: ["Fac", "A", "B"],
  ShaderNodeMix: ["Fac", "A", "B"],
  ShaderNodeMapRange: ["Value"],
  ShaderNodeValToRGB: ["Fac"],
  ShaderNodeInvert: ["Fac", "Color"],
  ShaderNodeSeparateXYZ: ["Vector"],
  ShaderNodeCombineXYZ: ["X", "Y", "Z"],
  GraphTexture: ["Vector"],
  GraphSeparate: ["Vector"],
  GraphCombine: ["X", "Y", "Z"],
};

interface Placed {
  node: GraphNode;
  col: number;
  x: number;
  y: number;
  h: number;
}

function fmt(v: unknown): string {
  if (typeof v === "number")
    return Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/0+$/, "");
  if (Array.isArray(v))
    return `[${v.map((n) => (typeof n === "number" ? n.toFixed(2) : String(n))).join(", ")}]`;
  if (typeof v === "string") return v;
  return "";
}

/** The one parameter worth showing in the header, per node type. */
function subtitle(n: GraphNode): string {
  const p = n.params as Record<string, unknown>;
  const first =
    p.operation ??
    p.blendType ??
    p.blend_type ??
    p.interpolation ??
    p.space ??
    p.channel;
  return first ? String(first).toLowerCase().replace(/_/g, " ") : "";
}

export interface NodeGraphViewProps {
  /** The output node of the graph to draw. */
  root: GraphNode;
  className?: string;
}

export default function NodeGraphView({ root, className }: NodeGraphViewProps) {
  const layout = useMemo(() => {
    // Depth = longest path back from this node, so a node always sits to the
    // LEFT of everything that consumes it even when the graph re-uses a value
    // at two different depths. Shortest path would let a link run backwards.
    const depth = new Map<number, number>();
    const seen = new Set<number>();
    const order: GraphNode[] = [];

    const visit = (n: GraphNode): number => {
      const known = depth.get(n.id);
      if (known !== undefined) return known;
      let d = 0;
      for (const i of n.inputs) if (isNode(i)) d = Math.max(d, visit(i) + 1);
      depth.set(n.id, d);
      if (!seen.has(n.id)) {
        seen.add(n.id);
        order.push(n);
      }
      return d;
    };
    visit(root);

    // Column IS the depth, so leaves land at column 0 and the output node
    // finishes on the right. Blender reads left to right and a graph drawn the
    // other way round is quietly unreadable to anyone who knows the tool —
    // every link appears to feed backwards.
    const maxDepth = Math.max(...depth.values());
    const columns: GraphNode[][] = Array.from(
      { length: maxDepth + 1 },
      () => [],
    );
    for (const n of order) columns[depth.get(n.id) ?? 0].push(n);

    const placed = new Map<number, Placed>();
    let width = PAD;
    let height = 0;
    columns.forEach((col, ci) => {
      let y = PAD;
      const x = PAD + ci * (NODE_W + COL_GAP);
      for (const n of col) {
        const rows = Math.max(1, n.inputs.length);
        const h = HEADER_H + ROW_H * (rows + 1) + 10;
        placed.set(n.id, { node: n, col: ci, x, y, h });
        y += h + ROW_GAP;
      }
      width = x + NODE_W + PAD;
      height = Math.max(height, y);
    });

    return { placed: [...placed.values()], byId: placed, width, height };
  }, [root]);

  const outY = (p: Placed) => p.y + HEADER_H + ROW_H / 2;
  const inY = (p: Placed, i: number) =>
    p.y + HEADER_H + ROW_H * (i + 1) + ROW_H / 2;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width="100%"
      role="img"
      aria-label="The shader node graph currently applied to the goose"
      style={{ display: "block", maxHeight: "100%" }}
    >
      <rect width={layout.width} height={layout.height} fill="#1d1d1d" rx={6} />

      {/* Links first, so nodes draw over them. */}
      {layout.placed.map((p) =>
        p.node.inputs.map((input: NodeInput, i: number) => {
          if (!isNode(input)) return null;
          const from = layout.byId.get(input.id);
          if (!from) return null;
          const x1 = from.x + NODE_W;
          const y1 = outY(from);
          const x2 = p.x;
          const y2 = inY(p, i);
          const c = Math.max(28, (x2 - x1) * 0.5);
          return (
            <path
              key={`${p.node.id}-${i}`}
              d={`M ${x1} ${y1} C ${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`}
              stroke="#9a9a9a"
              strokeWidth={1.6}
              fill="none"
            />
          );
        }),
      )}

      {layout.placed.map((p) => {
        const names = SOCKETS[p.node.type] ?? [];
        const sub = subtitle(p.node);
        return (
          <g key={p.node.id}>
            <rect
              x={p.x}
              y={p.y}
              width={NODE_W}
              height={p.h}
              rx={5}
              fill="#303030"
              stroke="#151515"
            />
            <path
              d={`M ${p.x} ${p.y + 5} a 5 5 0 0 1 5 -5 h ${NODE_W - 10} a 5 5 0 0 1 5 5 v ${HEADER_H - 5} h ${-NODE_W} z`}
              fill={tint(p.node.type)}
            />
            <text
              x={p.x + 9}
              y={p.y + 16}
              fill="#fff"
              fontSize={11.5}
              fontFamily="ui-sans-serif, system-ui"
            >
              {LABELS[p.node.type] ?? p.node.type.replace("ShaderNode", "")}
            </text>
            {sub && (
              <text
                x={p.x + NODE_W - 9}
                y={p.y + 16}
                fill="#ffffffcc"
                fontSize={9.5}
                textAnchor="end"
                fontFamily="ui-monospace, monospace"
              >
                {sub}
              </text>
            )}

            {/* Output socket. */}
            <circle
              cx={p.x + NODE_W}
              cy={outY(p)}
              r={4}
              fill="#c7c729"
              stroke="#1d1d1d"
            />
            <text
              x={p.x + NODE_W - 10}
              y={outY(p) + 3.5}
              fill="#d0d0d0"
              fontSize={10}
              textAnchor="end"
              fontFamily="ui-sans-serif, system-ui"
            >
              Result
            </text>

            {p.node.inputs.map((input: NodeInput, i: number) => (
              <g key={i}>
                <circle
                  cx={p.x}
                  cy={inY(p, i)}
                  r={4}
                  fill={isNode(input) ? "#c7c729" : "#6a6a6a"}
                  stroke="#1d1d1d"
                />
                <text
                  x={p.x + 10}
                  y={inY(p, i) + 3.5}
                  fill="#c9c9c9"
                  fontSize={10}
                  fontFamily="ui-sans-serif, system-ui"
                >
                  {names[i] ?? `In ${i}`}
                </text>
                {/* An unconnected socket carries its default — show the value,
                    exactly as Blender does. */}
                {!isNode(input) && (
                  <text
                    x={p.x + NODE_W - 10}
                    y={inY(p, i) + 3.5}
                    fill="#8f8f8f"
                    fontSize={9.5}
                    textAnchor="end"
                    fontFamily="ui-monospace, monospace"
                  >
                    {fmt(input)}
                  </text>
                )}
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
