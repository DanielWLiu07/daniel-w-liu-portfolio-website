/**
 * The goose's shading, authored as a node graph.
 */
import * as THREE from "three";
import { compileMaterial, graph, type Graph } from "blender-to-threejs";

/**
 * Ambient occlusion is the wrong instinct for this art style, and so is a
 * lambert term. The game's goose is flat colour with the faintest top-down
 * lift, so the range here is deliberately shallow: enough that the body reads
 * as round rather than as a sticker, not enough to look lit.
 */
const SHADE_FLOOR = 0.86;
const SHADE_CEIL = 1.05;

/** Multiply a colour source by a shallow, normal-driven shade. */
function shaded(g: Graph, base: ReturnType<Graph["rgb"]>) {
  // Map Range with clamp, NOT a raw dot product. The clamp is order-aware in
  // Blender, which is what keeps the underside at the floor value instead of
  // going negative and crushing to black.
  const lift = g.mapRange(g.separate(g.normal("world"), "y"), {
    from: [-1, 1],
    to: [SHADE_FLOOR, SHADE_CEIL],
    clamp: true,
  });
  return g.multiplyColor(1, base, lift);
}

/**
 * Returns the graph as well as the material, so the same structure can be
 * drawn on screen and cannot drift from what is compiled.
 */
export function gooseGraph(map: THREE.Texture | null, tint: THREE.Color) {
  const g = graph();
  const base = map
    ? // UVs select the palette patch. Explicit rather than implied, because the
      // whole colour scheme depends on this coordinate being right.
      g.texture(map, g.uv())
    : g.rgb(tint.r, tint.g, tint.b);
  return { g, out: shaded(g, base) };
}

export interface GooseMaterialResult {
  material: THREE.Material;
  /** The authored graph, for display. */
  graph: ReturnType<typeof gooseGraph>;
}

export function gooseMaterial(
  map: THREE.Texture | null,
  tint: THREE.Color,
): GooseMaterialResult {
  const built = gooseGraph(map, tint);
  return { material: compileMaterial(built.out), graph: built };
}
