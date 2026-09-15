'use client'

/**
 * Materials for the projects section, authored through the node pipeline.
 *
 * These stay physically meaningful on purpose. The manga pass turns TONE into
 * printed bands (paper, halftone dots, crosshatch, solid ink), so it needs real
 * tone to work with: a flat unshaded colour prints as one flat band and the page
 * looks like paper cut-outs. Shading comes from the GRAPH, not from lights, which
 * is why these are unlit.
 */
import * as THREE from 'three'
import { compileMaterial, graph, type Graph, type GraphNode } from 'blender-to-threejs'

/** where the light comes from: over the viewer's left shoulder and slightly above */
const KEY: [number, number, number] = [-0.48, 0.62, 0.62]

/**
 * A shallow lift driven by how much a surface faces the key, not by its world
 * normal Y. Y alone was the first version and it prints FLAT: a card standing up
 * has normal.y = 0 on its front face AND on all four of its sides, so every face
 * of every card lands in the same tone band and the whole page comes out one
 * grey. A real direction separates the face from the edges, which is the only
 * thing giving the ink pass a silhouette to find.
 *
 * Map Range with clamp rather than a hand-written smoothstep: Blender's clamp is
 * order-aware and that is exactly what gets reimplemented wrong.
 */
export function lift(g: Graph, lo = 0.42, hi = 1.02): GraphNode {
  const n = g.normal('world')
  const d = g.add(
    g.add(g.multiply(g.separate(n, 'x'), KEY[0]), g.multiply(g.separate(n, 'y'), KEY[1])),
    g.multiply(g.separate(n, 'z'), KEY[2]),
  )
  return g.mapRange(d, { from: [-1, 1], to: [lo, hi], clamp: true })
}

/**
 * Card stock: the slab a project is printed on. Deep lift range so the pass has
 * somewhere to put hatch on the sides and paper on the top face, which is what
 * makes a chunky slab read as a solid object rather than a white rectangle.
 */
export function cardMaterial(): THREE.Material {
  const g = graph()
  return compileMaterial(g.multiplyColor(1, g.rgb(0.88, 0.88, 0.88), lift(g, 0.34, 1.04)))
}

/** The edge banding on a card: darker stock, so the silhouette prints as ink. */
export function edgeMaterial(): THREE.Material {
  const g = graph()
  return compileMaterial(g.multiplyColor(1, g.rgb(0.3, 0.3, 0.3), lift(g, 0.5, 1.0)))
}

/** The ground the cards sit over: mid tone, so it prints as halftone rather than blank paper. */
export function groundMaterial(): THREE.Material {
  const g = graph()
  const m = compileMaterial(g.multiplyColor(1, g.rgb(0.62, 0.62, 0.62), lift(g, 0.55, 1.0)))
  m.side = THREE.DoubleSide
  return m
}
