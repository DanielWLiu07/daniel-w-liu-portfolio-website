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
 * His rig, as it actually RENDERS.
 *
 * Five of his eight lights have hide_render set, which I missed the first time
 * and encoded anyway. Only three contribute: image_target_sun (SUN, irradiance
 * 10.0), Sun.001 (SUN, 1.0) and better_frame_light (POINT, 41.4 W, which at its
 * 6.11 m from the shader ball works out to 0.088 by inverse square). Directions
 * are toward the light, computed at the ball's own position for the point.
 *
 * Total irradiance at the ball is 11.09, and that number is the whole reason
 * LIGHT_GAIN exists below.
 */
export const HIS_LIGHTS = [
  { dir: new Vector3(1, -0.019, -0.003).normalize(), energy: 10.0 }, // image_target_sun
  { dir: new Vector3(0, 0, 1).normalize(), energy: 1.0 }, // Sun.001
  { dir: new Vector3(-0.103, 0.995, 0.018).normalize(), energy: 0.088 }, // better_frame_light
] as const

/**
 * The rig this PAGE uses, and the reason it is not his.
 *
 * A shader's look is inseparable from the rig it was authored for, and porting a
 * shader is not porting a scene. His key lights along +X because that is where
 * his shader balls sit; the cards here face the camera at +Z, so under his rig
 * they receive almost nothing and print as solid ink. Rendered it that way to be
 * sure, and that is exactly what happens.
 *
 * So the graph is his and the rig is this scene's: the same three lights at the
 * same relative strengths, turned to face the subject the page actually has.
 * Pass HIS_LIGHTS to see it under his.
 */
const PAGE_LIGHTS = [
  { dir: new Vector3(-0.4, 0.5, 0.77).normalize(), energy: 10.0 }, // stands in for image_target_sun
  { dir: new Vector3(0, 0.2, 1).normalize(), energy: 1.0 }, // Sun.001
  { dir: new Vector3(0.6, 0.3, 0.74).normalize(), energy: 0.088 }, // better_frame_light
] as const

/** his World background: 0.08 at strength 1.0 */
const WORLD_AMBIENT = 0.08

/**
 * A DELIBERATE DEPARTURE from his scene, not a fudge and not a fit.
 *
 * His rig delivers 11.09 of irradiance at the shader ball. Through eeveeLighting
 * that is sum(N.L * E) / PI = 3.53 at full facing, which clamps to 1 and leaves
 * the ramp above it white for every N.L over about 0.04. Physically faithful,
 * and it means his shader hatches only in the last two degrees before the
 * terminator: a thin dark rim on an otherwise white ball.
 *
 * So this trades fidelity for legibility, knowingly. E * 0.5 / PI = 0.3 - 0.08
 * puts the hatch band at N.L = 0.5, half the lit side, which needs a total of
 * 1.38 against his 11.09. Set it to 1 to get his scene exactly.
 */
const LIGHT_GAIN = 1.38 / 11.09
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
  /** the rig to shade against; defaults to this page's, pass HIS_LIGHTS for his */
  lights?: readonly { dir: Vector3; energy: number }[]
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
    lights: (opts.lights ?? PAGE_LIGHTS).map((l) => ({ dir: l.dir, energy: l.energy * LIGHT_GAIN })),
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
