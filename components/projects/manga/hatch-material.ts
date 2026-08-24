'use client'

/**
 * "3. Cross hatching shader", ported node for node.
 *
 * Source: ~/Dev/3D/personal_website_assets/scenes/"hatching & manga shaders.blend",
 * material "3. Cross hatching shader" wrapping NodeGroup.024. Every value below
 * was READ OUT OF THE FILE. An earlier version kept the structure and invented
 * the numbers while claiming to use his, which is exactly why it looked wrong.
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
 * The distortions are its whole character: 74.9 and 14.2 are what make the
 * strokes wobble like a pen rather than print like stripes, and the final ramp is
 * CONSTANT, so the output is hard black on white with no grey ramp at all.
 *
 * What is exact and what is not: every node here is transcribed from Blender's
 * own GLSL and checked against Cycles, EXCEPT the light PLACEMENT. Diffuse BSDF
 * is Lambert against a stated light set, which is what EEVEE's diffuse reduces
 * to, but his point and spot lights have positions and a directional term can
 * only carry directions. The shading model is right; where the light comes from
 * is approximate.
 */
import * as THREE from 'three'
import { Vector3 } from 'three'
import { compileMaterial, graph, type Graph, type GraphNode } from 'blender-to-threejs'

/**
 * His rig, read out of the .blend: four points (41.4, 28.6, 12.6, 10.0), a spot
 * (21.0), three suns (10.0, 1.0, 0.1) and a 0.08 world.
 *
 * It is here rather than buried in a default because the ramps downstream are
 * calibrated against what THIS rig produces. Two stand-ins proved a single key
 * cannot do it: a normalised dot product put every surface above the 0.4773 cut
 * and printed pure white, and aiming one key at his sun alone dropped every
 * camera-facing surface to N.L = 0 and printed solid ink.
 *
 * The point and spot energies are scaled well down from their raw Blender
 * values, because a point light's energy falls off with distance and a
 * directional term has no distance to fall off over.
 */
const HIS_LIGHTS = [
  { dir: new Vector3(-1, 0.019, 0.003).normalize(), energy: 1.6 }, // image_target_sun
  { dir: new Vector3(-0.967, -0.101, -0.233).normalize(), energy: 0.5 }, // Spot
  { dir: new Vector3(-0.371, 0.9, 0.227).normalize(), energy: 0.1 }, // Sun
  { dir: new Vector3(0, 0, 1).normalize(), energy: 0.9 }, // Sun.001
  { dir: new Vector3(0.25, 0.5, 1).normalize(), energy: 1.1 }, // the point rig, toward the subject
  { dir: new Vector3(-0.35, 0.4, 1).normalize(), energy: 0.7 },
] as const

/**
 * The one free parameter, and it is SOLVED rather than eyeballed.
 *
 * eeveeLighting gives diffuse = sum(N.L * energy) / PI + ambient, and the ramp
 * above it turns white at 0.3. His raw energies sum to 4.9, which puts diffuse
 * over 0.3 for every N.L above 0.14: hatch then appears only in the last eight
 * degrees before the terminator, which is the thin crescent that showed up. For
 * the hatch to cover half the lit side the band has to reach N.L = 0.5, so
 * E * 0.5 / PI = 0.3 - 0.08, giving E = 1.38 and a gain of 1.38 / 4.9.
 *
 * This exists because his point and spot lights fall off with distance and a
 * directional term does not. Their raw energies are correct for Blender and
 * meaningless here without the distance that divides them.
 */
const LIGHT_GAIN = 0.28

/** his World background: 0.08 at strength 1.0 */
const WORLD_AMBIENT = 0.08
/** his Diffuse BSDF's own Color input */
const ALBEDO: [number, number, number, number] = [0.8, 0.8, 0.8, 1]

/** the group's own inputs, at the defaults his material sets on it */
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

/** ColorRamp(0.1955 grey -> 0.5545 black -> 1 white), on the wobbly waves */
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

  // Texture Coordinate -> UV, through Mapping POINT whose Location is the
  // group's "Ofset" on every axis (a Combine XYZ in the original)
  const uv = g.uv()
  const co = g.combine(g.add(g.separate(uv, 'x'), offset), g.add(g.separate(uv, 'y'), offset), offset)

  // hatch A: a clean diagonal at 5x the size, screened with a heavily distorted
  // vertical at 1x. Math.001 in his graph is "Hatch A size" * 5.
  const a1 = edgeRamp(g, g.wave(co, { scale: A * 5, bandsDirection: 'DIAGONAL', distortion: 0, detail: 2, detailScale: 1 }))
  const a2 = lineRamp(g, g.wave(co, { scale: A, bandsDirection: 'Y', distortion: 74.9, detail: 2, detailScale: 0.5 }))
  const hatchA = g.mix('SCREEN', 1, a1, a2)

  // hatch B: the same pair with its own distortions, and a NEGATIVE detail scale
  // on the second, which is his and not a typo
  const b1 = edgeRamp(g, g.wave(co, { scale: B * 5, bandsDirection: 'DIAGONAL', distortion: 2.8, detail: 2, detailScale: 0.5 }))
  const b2 = lineRamp(g, g.wave(co, { scale: B, bandsDirection: 'Y', distortion: 14.2, detail: 3.1, detailScale: -4.1 }))
  const hatchB = g.mix('SCREEN', 1, b1, b2)

  const hatch = g.mix('MULTIPLY', bAmount, hatchA, hatchB)

  // Diffuse BSDF -> Shader to RGB -> ColorRamp -> Gamma: his chain, now that
  // both nodes exist rather than being stood in for
  const diffuse = g.diffuseBsdf(ALBEDO, {
    roughness: 0,
    lights: HIS_LIGHTS.map((l) => ({ dir: l.dir, energy: l.energy * LIGHT_GAIN })),
    worldAmbient: WORLD_AMBIENT,
  })
  const toned = g.colorRamp(g.separate(g.shaderToRgb(diffuse), 'x'), [
    { position: 0.1409, color: [0, 0, 0, 1] },
    { position: 0.3, color: [1, 1, 1, 1] },
  ])
  const tone = g.gamma(toned, gammaValue)
  const lit = g.mix('LINEAR_LIGHT', contrast, tone, hatch)

  // CONSTANT interpolation: no gradient, a hard cut to ink or paper.
  // Blender lets a colour drive a ramp's Fac through an implicit reduction; the
  // library refuses to guess which one. Everything upstream here is greyscale
  // (r == g == b), so taking one channel IS the reduction, not an approximation.
  const out = g.colorRamp(
    g.separate(lit, 'x'),
    [
      { position: 0.4591, color: [0, 0, 0, 1] },
      { position: 0.4773, color: [1, 1, 1, 1] },
    ],
    'CONSTANT',
  )

  const m = compileMaterial(out)
  m.side = THREE.DoubleSide
  return m
}
