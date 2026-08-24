'use client'

/**
 * "3. Cross hatching shader", ported node for node.
 *
 * Source: ~/Dev/3D/personal_website_assets/scenes/"hatching & manga shaders.blend",
 * material "3. Cross hatching shader" wrapping NodeGroup.024. Every value below
 * was READ OUT OF THE FILE, not chosen. An earlier version of this file kept the
 * structure and invented the numbers while claiming to use his, which is why the
 * result looked wrong: the two shaders had almost nothing in common numerically.
 *
 * The graph, as it exists in the .blend:
 *
 *   tone   Diffuse BSDF -> Shader to RGB -> ColorRamp(0.1409 -> 0.3) -> Gamma
 *   hatchA Wave(DIAGONAL, dist 0,    scale A*5) -> Ramp(0 -> 0.2)
 *          SCREEN
 *          Wave(Y,        dist 74.9, scale A)   -> Ramp(0.1955 -> 0.5545 -> 1)
 *   hatchB Wave(DIAGONAL, dist 2.8,  scale B*5) -> Ramp(0 -> 0.2)
 *          SCREEN
 *          Wave(Y, dist 14.2, detail 3.1, detail scale -4.1, scale B)
 *                                                -> Ramp(0.1955 -> 0.5545 -> 1)
 *   out    MULTIPLY(hatchA, hatchB, fac = hatch B amount)
 *          LINEAR_LIGHT(tone, that, fac = Contrast)
 *          -> ColorRamp CONSTANT(0.4591 -> 0.4773)   <- the hard ink threshold
 *
 * The distortions are the whole character of it: 74.9 and 14.2 are what make the
 * strokes wobble like a pen rather than print like stripes, and the final ramp is
 * CONSTANT, so the result is hard black on white with no grey ramp at all.
 *
 * NOT EXACT, and it is one term: Diffuse BSDF and Shader to RGB are not ported,
 * so `tone` is a normal-driven lift against a fixed key standing in for Blender's
 * own diffuse shading. Everything downstream of it is his.
 */
import * as THREE from 'three'
import { compileMaterial, graph, type Graph, type GraphNode } from 'blender-to-threejs'

/** the group's own inputs, at the defaults the material sets on it */
export interface HatchOptions {
  /** Group input "Hatch A size" */
  hatchA?: number
  /** Group input "Hatch B size" */
  hatchB?: number
  /** Group input "hatch B amount": the MULTIPLY factor */
  hatchBAmount?: number
  /** Group input "Contrast": the LINEAR_LIGHT factor */
  contrast?: number
  /** Group input "Gamma" */
  gamma?: number
  /** Group input "Ofset": the Mapping location the waves are sampled through */
  offset?: number
}

/** where the key sits: the stand-in for Diffuse BSDF -> Shader to RGB */
/**
 * The stand-in key. NOT his: his rig is seven lights (four points at 41.4, 28.6,
 * 12.6 and 10.0, a spot at 21.0, and suns at 10.0, 1.0 and 0.1) plus a 0.08
 * world, all reaching the shader through Diffuse BSDF -> Shader to RGB, and the
 * ramps downstream are calibrated against what that produces.
 *
 * Aiming this at his key sun alone (-X) was tried and is worse, not better:
 * every surface facing the camera then reads N.L = 0, drops under the 0.1409
 * ramp and prints solid ink. One light cannot stand in for seven. This points at
 * the viewer instead, which keeps the visible surfaces inside the band the ramps
 * expect, and it is the honest limit of the port until those two nodes exist.
 */
const KEY: [number, number, number] = [-0.48, 0.62, 0.62]

/**
 * Lambert against the key, at the Diffuse BSDF's OWN albedo of 0.8.
 *
 * The range matters more than the shape here, and getting it wrong is what made
 * the first attempt print blank white. Downstream of this sits a ramp at
 * 0.1409 -> 0.3 and then a CONSTANT cut at 0.4591 / 0.4773, and those positions
 * are calibrated against what Blender's Diffuse BSDF -> Shader to RGB actually
 * outputs. A normalised 0..1 dot product put almost the whole surface above the
 * cut, so every pixel came out paper. max(0, N.L) * 0.8 lands in the band the
 * ramps were authored for.
 *
 * This is still the one approximate term in the file: it is not Blender's
 * shading, it is a stand-in with the right range.
 */
function surfaceTone(g: Graph): GraphNode {
  const n = g.normal('world')
  const d = g.add(
    g.add(g.multiply(g.separate(n, 'x'), KEY[0]), g.multiply(g.separate(n, 'y'), KEY[1])),
    g.multiply(g.separate(n, 'z'), KEY[2]),
  )
  // + the world's own contribution, which is why his shadows are not pure ink:
  // his World background is 0.08 at strength 1.0, read from the file
  return g.add(g.multiply(g.math('MAXIMUM', d, 0), DIFFUSE_ALBEDO), WORLD_AMBIENT)
}

/** the Diffuse BSDF's Color input in his file */
const DIFFUSE_ALBEDO = 0.8
/** his World background: 0.08 at strength 1.0 */
const WORLD_AMBIENT = 0.08

/** ColorRamp(0.1955 grey -> 0.5545 black -> 1 white), the "line" ramp on the wobbly waves */
function lineRamp(g: Graph, fac: GraphNode): GraphNode {
  return g.colorRamp(fac, [
    { position: 0.1955, color: [0.391, 0.391, 0.391, 1] },
    { position: 0.5545, color: [0, 0, 0, 1] },
    { position: 1.0, color: [1, 1, 1, 1] },
  ])
}

/** ColorRamp(0 black -> 0.2 white), the tight ramp on the straight waves */
function edgeRamp(g: Graph, fac: GraphNode): GraphNode {
  return g.colorRamp(fac, [
    { position: 0.0, color: [0, 0, 0, 1] },
    { position: 0.2, color: [1, 1, 1, 1] },
  ])
}

export function hatchMaterial(opts: HatchOptions = {}): THREE.Material {
  const A = opts.hatchA ?? 5
  const B = opts.hatchB ?? 5
  const bAmount = opts.hatchBAmount ?? 1
  const contrast = opts.contrast ?? 0.4268
  const gammaValue = opts.gamma ?? 1
  const offset = opts.offset ?? 0.05

  const g = graph()

  // Texture Coordinate -> UV, through Mapping POINT whose Location is the group's
  // "Ofset" on every axis (Combine XYZ in the original)
  const uv = g.uv()
  const co = g.combine(
    g.add(g.separate(uv, 'x'), offset),
    g.add(g.separate(uv, 'y'), offset),
    offset,
  )

  // hatch A: a clean diagonal at 5x the size, screened with a heavily distorted
  // vertical at 1x. Math.001 is "Hatch A size" * 5.
  const a1 = edgeRamp(g, g.wave(co, { scale: A * 5, bandsDirection: 'DIAGONAL', distortion: 0, detail: 2, detailScale: 1 }))
  const a2 = lineRamp(g, g.wave(co, { scale: A, bandsDirection: 'Y', distortion: 74.9, detail: 2, detailScale: 0.5 }))
  const hatchA = g.mix('SCREEN', 1, a1, a2)

  // hatch B: the same pair with its own distortions, and a NEGATIVE detail scale
  // on the second, which is his and not a typo
  const b1 = edgeRamp(g, g.wave(co, { scale: B * 5, bandsDirection: 'DIAGONAL', distortion: 2.8, detail: 2, detailScale: 0.5 }))
  const b2 = lineRamp(g, g.wave(co, { scale: B, bandsDirection: 'Y', distortion: 14.2, detail: 3.1, detailScale: -4.1 }))
  const hatchB = g.mix('SCREEN', 1, b1, b2)

  const hatch = g.mix('MULTIPLY', bAmount, hatchA, hatchB)

  // tone, then Linear Light against the hatch, then the hard threshold
  const toned = g.colorRamp(surfaceTone(g), [
    { position: 0.1409, color: [0, 0, 0, 1] },
    { position: 0.3, color: [1, 1, 1, 1] },
  ])
  const tone = g.gamma(toned, gammaValue)
  const lit = g.mix('LINEAR_LIGHT', contrast, tone, hatch)

  // CONSTANT interpolation: no gradient, a hard cut to ink or paper.
  // Blender lets a colour drive a ramp's Fac through an implicit reduction; the
  // library refuses to guess which one, and rightly so. Everything upstream here
  // is greyscale (r == g == b), so taking one channel IS the reduction rather
  // than an approximation of it.
  const out = g.colorRamp(g.separate(lit, 'x'), [
    { position: 0.4591, color: [0, 0, 0, 1] },
    { position: 0.4773, color: [1, 1, 1, 1] },
  ], 'CONSTANT')

  const m = compileMaterial(out)
  m.side = THREE.DoubleSide
  return m
}
