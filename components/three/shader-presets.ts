/**
 * Graphs to test the node system against.
 *
 * Two kinds live here and they serve different purposes:
 *
 *   "probe" presets are chosen so a WRONG emitter produces an obviously wrong
 *   picture — divide-by-zero, an order-aware clamp, a ramp's quantisation.
 *   They are diagnostics, not designs.
 *
 *   "blender" presets are node setups mirrored from Blender. They exist to
 *   answer the only question that matters for this project: if you build the
 *   same graph here that you built there, do you get the same image?
 */
import {
  graph,
  type Graph,
  type GraphNode,
  type NodeInput,
} from "blender-to-threejs";

export interface Preset {
  label: string;
  kind: "probe" | "blender";
  /** What you should see if the emitters are right. */
  expect: string;
  build: () => GraphNode;
}

/**
 * Dot product, spelled out.
 *
 * There is no vector-math node yet, so a dot takes three multiplies and two
 * adds through SeparateXYZ. It works and it is exact, but it is the clearest
 * signal so far that ShaderNodeVectorMath is the next node worth transcribing —
 * every lighting-flavoured Blender setup opens with one of these.
 */
function dot(
  g: ReturnType<typeof graph>,
  v: GraphNode,
  k: readonly [number, number, number],
): NodeInput {
  return g.add(
    g.add(
      g.multiply(g.separate(v, "x"), k[0]),
      g.multiply(g.separate(v, "y"), k[1]),
    ),
    g.multiply(g.separate(v, "z"), k[2]),
  );
}

/** Normalised key-light direction, matching a default Blender sun. */
const LIGHT = [0.5929, 0.6163, 0.5183] as const;

/**
 * The toon ramp, over whatever supplies the base colour.
 *
 * Taking the base as an argument is what lets one shader serve both a mesh with
 * vertex colours and a mesh with a texture. The ramp is MULTIPLIED into it, not
 * substituted for it — replacing the base is how a shader "works" and still
 * turns your model grey.
 */
export function toonShade(
  g: Graph,
  base: GraphNode,
  interpolation: "CONSTANT" | "EASE" = "CONSTANT",
): GraphNode {
  const ndotl = g.mapRange(dot(g, g.normal(), LIGHT), {
    from: [-1, 1],
    to: [0, 1],
    clamp: true,
  });
  const bands = g.colorRamp(
    ndotl,
    interpolation === "CONSTANT"
      ? [
          { position: 0.0, color: [0.3, 0.36, 0.55, 1] },
          { position: 0.42, color: [0.66, 0.69, 0.8, 1] },
          { position: 0.68, color: [1.0, 0.99, 0.96, 1] },
        ]
      : [
          { position: 0.1, color: [0.34, 0.4, 0.58, 1] },
          { position: 0.8, color: [1.0, 0.99, 0.96, 1] },
        ],
    interpolation,
  );
  return g.multiplyColor(1, base, bands);
}

export const PRESETS: Record<string, Preset> = {
  "toon-ramp": {
    label: "Blender toon shader",
    kind: "blender",
    expect:
      "three flat bands of light with hard edges — and the beak still orange",
    // The canonical Blender cel-shading setup: Geometry.Normal -> dot with the
    // light -> Color Ramp with CONSTANT interpolation. The hard edges come from
    // the interpolation mode, not from any thresholding maths, which is exactly
    // the sort of thing that gets "helpfully" reimplemented as a step() and then
    // lands the boundary one texel off.
    build: () => {
      const g = graph();
      const ndotl = g.mapRange(dot(g, g.normal(), LIGHT), {
        from: [-1, 1],
        to: [0, 1],
        clamp: true,
      });
      const bands = g.colorRamp(
        ndotl,
        [
          { position: 0.0, color: [0.42, 0.46, 0.62, 1] },
          { position: 0.45, color: [0.78, 0.79, 0.86, 1] },
          { position: 0.72, color: [1.0, 0.99, 0.96, 1] },
        ],
        "CONSTANT",
      );
      // Tint by the mesh's own colour rather than replacing it, so the beak
      // stays orange and the eyes stay dark. On a mesh with no colour attribute
      // vertexColor reads opaque white, so this is a no-op there — the same way
      // Blender treats an absent Color Attribute layer.
      return g.multiplyColor(1, g.vertexColor(), bands);
    },
  },

  "toon-ramp-ease": {
    label: "Toon ramp, EASE interpolation",
    kind: "blender",
    expect: "smoothstepped bands instead of hard ones, colour still preserved",
    build: () => {
      const g = graph();
      const ndotl = g.mapRange(dot(g, g.normal(), LIGHT), {
        from: [-1, 1],
        to: [0, 1],
        clamp: true,
      });
      const bands = g.colorRamp(
        ndotl,
        [
          { position: 0.1, color: [0.34, 0.4, 0.58, 1] },
          { position: 0.8, color: [1.0, 0.99, 0.96, 1] },
        ],
        "EASE",
      );
      return g.multiplyColor(1, g.vertexColor(), bands);
    },
  },

  "ramp-quantised": {
    label: "Color Ramp — 4 stops (baked LUT)",
    kind: "blender",
    expect:
      "a smooth 4-colour sweep along U. Banding here is CORRECT — Blender bakes 257 steps",
    build: () => {
      const g = graph();
      return g.colorRamp(g.separate(g.uv(), "x"), [
        { position: 0.0, color: [0.05, 0.1, 0.25, 1] },
        { position: 0.35, color: [0.85, 0.25, 0.3, 1] },
        { position: 0.7, color: [0.98, 0.75, 0.25, 1] },
        { position: 1.0, color: [1.0, 1.0, 0.95, 1] },
      ]);
    },
  },

  "ramp-constant": {
    label: "Color Ramp — CONSTANT edge",
    kind: "probe",
    expect: "one hard edge at U = 0.5, no blend at all",
    build: () => {
      const g = graph();
      return g.colorRamp(
        g.separate(g.uv(), "x"),
        [
          { position: 0.0, color: [0.1, 0.1, 0.12, 1] },
          { position: 0.5, color: [0.95, 0.93, 0.88, 1] },
        ],
        "CONSTANT",
      );
    },
  },

  bands: {
    label: "MapRange — descending clamp",
    kind: "probe",
    expect: "mostly saturated cream, narrow dark ramp at one edge",
    build: () => {
      const g = graph();
      const band = g.mapRange(g.separate(g.uv(), "x"), {
        from: [0, 1],
        to: [-0.62, 4.56],
        clamp: true,
      });
      return g.blend(band, g.rgb(0.1, 0.1, 0.12), g.rgb(1, 0.95, 0.9));
    },
  },

  "safe-divide": {
    label: "safe_divide (÷ by zero)",
    kind: "probe",
    expect: "uniform black. Any white or speckle means divide-by-zero leaked",
    build: () => {
      const g = graph();
      return g.divide(g.separate(g.uv(), "x"), 0);
    },
  },

  overlay: {
    label: "Mix — OVERLAY, float mode",
    kind: "probe",
    expect: "a soft S-curve in grey, darker left, brighter right",
    build: () => {
      const g = graph();
      return g.overlay(1, g.separate(g.uv(), "x"), 0.3205);
    },
  },

  "normal-shade": {
    label: "Normal.y remapped",
    kind: "probe",
    expect: "smooth top-down shading, no facets, no flat colour",
    build: () => {
      const g = graph();
      return g.mapRange(g.separate(g.normal(), "y"), {
        from: [-1, 1],
        to: [0, 1],
      });
    },
  },
};

export const DEFAULT_PRESET = "toon-ramp";

/* ---------------------------------------------------------------------------
 * Flat-colour shading — the Untitled Goose Game look.
 *
 * That style is low-poly + FLAT COLOURS + untextured: no painted detail, no
 * gradients, just solid colour per region. Meshy hands back a painted texture,
 * which is the opposite kind of asset, so the texture is used here only as a
 * REGION MASK — its hue decides which flat colour a pixel gets, and its actual
 * painted values are thrown away.
 *
 * That is why this reads as flat rather than merely desaturated: nothing from
 * the texture survives into the output except the classification.
 * ------------------------------------------------------------------------- */

/** Solid colours, sampled from the target look rather than from the texture. */
const FLAT_WHITE: [number, number, number, number] = [0.95, 0.95, 0.93, 1];
const FLAT_ORANGE: [number, number, number, number] = [0.96, 0.6, 0.1, 1];
const FLAT_DARK: [number, number, number, number] = [0.09, 0.09, 0.1, 1];

export function flatColor(g: Graph, tex: GraphNode): GraphNode {
  const r = g.separate(tex, "x");
  const gr = g.separate(tex, "y");
  const b = g.separate(tex, "z");

  // SATURATION, not red-minus-blue. A warm off-white body still has a sizeable
  // r-b gap, so the naive test painted the whole goose orange. Saturation
  // separates a genuinely chromatic bill from cream that merely leans warm.
  const mx = g.max(g.max(r, gr), b);
  const mn = g.min(g.min(r, gr), b);
  const saturation = g.divide(g.subtract(mx, mn), mx);
  const isOrange = g.greaterThan(saturation, 0.42);
  // The eye and wing tips are the only near-black areas.
  const luma = g.divide(g.add(g.add(r, gr), b), 3);
  const isDark = g.lessThan(luma, 0.3);

  const body = g.blend(isOrange, g.rgb(...FLAT_WHITE), g.rgb(...FLAT_ORANGE));
  return g.blend(isDark, body, g.rgb(...FLAT_DARK));
}

/** Flat colours, then the cel ramp over them. */
export function flatToonShade(
  g: Graph,
  tex: GraphNode,
  interpolation: "CONSTANT" | "EASE" = "CONSTANT",
): GraphNode {
  return toonShade(g, flatColor(g, tex), interpolation);
}
