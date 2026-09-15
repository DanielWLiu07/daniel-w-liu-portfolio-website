'use client'

/**
 * "3. Cross hatching shader", ported node for node.
 *
 * Source: ~/Dev/3D/personal_website_assets/scenes/"hatching & manga shaders.blend",
 * material "3. Cross hatching shader" wrapping NodeGroup.024. Every value below
 * was READ OUT OF THE FILE, by a dump keyed on socket IDENTIFIER rather than
 * socket name: a Math node calls all three of its inputs "Value" and a Mix node
 * calls two different sockets "Factor", so a name-keyed dump silently drops the
 * operands and reports a graph that is missing exactly the numbers you came for.
 *
 * The scene also has a second copy of the group, NodeGroup.015, on the shader
 * library in Scene.001. They are identical: same nodes, same values, same links.
 *
 * The graph, as it exists in the .blend:
 *
 *   tone   Diffuse BSDF -> Shader to RGB -> ColorRamp(0.1409 -> 0.3) -> Gamma
 *   hatchA Wave(DIAGONAL, dist 0,    scale A*5) -> Ramp(0 -> 0.2)
 *          SCREEN, fac 1
 *          Wave(Y,        dist 74.9, scale A)   -> Ramp(0.1955 -> 0.5545 -> 1)
 *   hatchB Wave(DIAGONAL, dist 2.8,  scale B*5) -> Ramp(0 -> 0.2)     <- see ROT_B
 *          SCREEN, fac 1
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
 * The group's Color output goes STRAIGHT into Material Output > Surface, with no
 * Emission node in between. Blender renders that as the colour itself, which is
 * what MeshBasicNodeMaterial does here too, so the port is structurally right
 * for once by accident rather than by choice.
 */
import * as THREE from 'three'
import { Vector3 } from 'three'
import { compileMaterial, graph, type Graph, type GraphNode, type SketchLight } from 'blender-to-threejs'

/**
 * His rig, as it actually RENDERS: ONE point light and the world. That is all.
 *
 * This is the third answer I have had for this question and the first one that
 * came out of a render. The scene has eight lights. Five have hide_render set.
 * Of the remaining three, `Sun.001` is not in this scene at all (it belongs to
 * Scene.001, the shader-library scene), which leaves `image_target_sun` and
 * `better_frame_light`.
 *
 * And `image_target_sun` contributes NOTHING. It has a light-linking receiver
 * collection, "Light Linking for image_target_sun", so it lights that collection
 * and nothing else. Rendering the ship under it alone gives a frame of exact
 * zeroes, in Cycles as well as EEVEE, at every sun angle. The name says as much:
 * it is there to light an image target.
 *
 * So the whole rig is a 41.4 W point lamp about a metre from the subject, plus
 * the world. Decomposed and measured on the real scene: point alone 0.30627
 * median, world alone 0.06421, both 0.37036, and 0.30627 + 0.06421 = 0.37048.
 *
 * Why this matters more than any value inside the node group: a point light a
 * metre away is not a direction. Its angle swings by tens of degrees across one
 * model and its irradiance varies fourfold end to end. An earlier version of
 * this file encoded it as a distant directional at "energy 0.088", which is its
 * irradiance at 6.11 m, and applied that at 1.02 m where the true value is 3.16.
 * Wrong by a factor of 36, and no amount of re-reading the shader would find it.
 */
export const HIS_RIG: { lights: readonly SketchLight[]; worldAmbient: number } = {
  // Blender (-3.98, 0, 0) -> Three (x, z, -y).
  //
  // The EXPOSURE is not decoration. Blender 4.x gives every light its own
  // Exposure field, in stops, separate from Power and invisible in the Power
  // number, and his carries -1.095888 of it. So the lamp reads 41.4 W and
  // delivers 41.4 * 2^-1.095888 = 19.37. Measured before it was believed: a
  // plane at the subject spot under his lamp read 0.09174, and under a FRESH
  // 41.4 W lamp at the same position read 0.19690, a ratio of 0.4659 against
  // 2^-1.095888 = 0.46785. Cycles and EEVEE agreed, which is what ruled out
  // every renderer-side explanation and sent me to a property-by-property diff
  // of the two light datablocks, where it was the only difference.
  lights: [{ kind: 'point', position: new Vector3(-3.98, 0, 0), power: 41.4, exposure: -1.095888 }],
  /** his World.001 Background: 0.0802479 at strength 1.0 */
  worldAmbient: 0.0802479,
}

/**
 * The rig the PROJECTS PAGE uses, and the reason it is not his.
 *
 * A shader's look is inseparable from the rig it was authored for, and porting a
 * shader is not porting a scene. His lamp sits a metre from a subject at a fixed
 * spot; the cards here run down a track and the camera moves past them, so a
 * light fixed in world space would swing across the section. These are suns,
 * which do not care where the subject is.
 *
 * Pass HIS_RIG, or use hisHatchMaterial, to see it under his.
 */
const PAGE_LIGHTS: readonly SketchLight[] = [
  { kind: 'sun', dir: new Vector3(-0.4, 0.5, 0.77).normalize(), energy: 10.0 },
  { kind: 'sun', dir: new Vector3(0, 0.2, 1).normalize(), energy: 1.0 },
  { kind: 'sun', dir: new Vector3(0.6, 0.3, 0.74).normalize(), energy: 0.088 },
] as const

/** the page rig's own nominal total, so `key` reads as an irradiance and not as a ratio */
export const PAGE_TOTAL = 11.088
/**
 * The total the page's rig is normalised to, which is what decides WHERE on the
 * surface the hatch band falls.
 *
 * Solvable rather than dialled. Tone luminance is K * N.L / PI + 0.08 against
 * his ramp, which opens at 0.1409 and closes at 0.3, so the band is N.L in
 * [0.191 / K, 0.691 / K]. Lowering K widens it and drags it up into the lit side:
 *
 *   K = 11.088 (unnormalised) -> N.L 0.017 .. 0.062   a dark rim, nothing else
 *   K = 1.38                  -> N.L 0.139 .. 0.501   one wing, blank elsewhere
 *   K = 0.9                   -> N.L 0.212 .. 0.768   most of the lit side
 *
 * 1.38 was fitted to a sphere, where the band only has to hold a smooth sweep.
 * The ship is large panels sitting in one narrow slice of N.L, so the band has to
 * be wide enough to hold that slice or the ship prints blank.
 */
export const PAGE_KEY = 0.9

/** the page's world term, kept separate from his 0.0802479 */
const PAGE_WORLD = 0.08

/** his Diffuse BSDF's own Color input */
const ALBEDO: [number, number, number, number] = [0.8, 0.8, 0.8, 1]

/**
 * The 90 degree Y rotation on hatch B's Mapping node.
 *
 * It is the one node-level thing the first port missed, because that port
 * hand-rolled a Combine XYZ into the wave's Vector instead of going through
 * g.mapping, and a hand-rolled mapping has nowhere to put a rotation. Three of
 * his four Mapping nodes are identity; this one is not.
 *
 * It is not cosmetic. Blender's POINT mapping is R * (v * scale) + location, so
 * with UV (u, v, 0) this sends the wave (0, v, -u), and a DIAGONAL wave reads
 * x + y, which becomes v alone. Hatch B's "diagonal" layer therefore runs along
 * v like its partner, wobbled by a distortion that still sees u through z. Two
 * layers pulling the same way is what makes hatch B read as weave rather than as
 * a second crossing set.
 */
const ROT_B: [number, number, number] = [0, Math.PI / 2, 0]

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
  /** the rig to shade against; defaults to this page's */
  lights?: readonly SketchLight[]
  /** the world term, added as albedo * this */
  worldAmbient?: number
  /**
   * Where the hatch is sampled. See HatchCoords: 'uv' is his, and is wrong on
   * anything that is not his shader ball.
   */
  coords?: HatchCoords
  /** the Mapping node's Scale, so one `hatchA` means the same thing in every space */
  coordScale?: number
  /**
   * Total irradiance the page rig is normalised to. Ignored when `lights` is
   * passed, because normalising someone else's rig to a number of ours is how
   * the last three wrong answers happened.
   */
  key?: number
}

/**
 * The space the hatch is drawn in, which on this page matters more than any
 * value inside the graph.
 *
 * 'uv' is what his node group does, and it is right for what it was authored on:
 * a shader ball with one clean square unwrap. The ship is not that. Its unwrap is
 * islands, so a UV hatch restarts at every seam, runs at a different density per
 * island, and reads as scattered dashes rather than strokes, which is exactly
 * what it did.
 *
 * 'object' draws in the model's own coordinates: seamless, uniform density, and
 * glued to the surface, so it turns with the ship the way ink on a model would.
 *
 * 'window' draws on the paper, in screen space, which is what pen-and-ink
 * actually does and what Praun et al. call for. It costs the sense that the
 * strokes belong to the surface, and it beats against the print pass's own
 * screen-locked screen, so it is offered rather than defaulted to.
 */
export type HatchCoords = 'uv' | 'object' | 'window'

/** the natural scale of each space, so `hatchA` reads the same across all three */
const COORD_SCALE: Record<HatchCoords, number> = { uv: 1, object: 0.5, window: 1 }

/** ColorRamp(0.1955 grey -> 0.5545 black -> 1 white), on the wobbly waves */
function lineRamp(g: Graph, fac: GraphNode): GraphNode {
  return g.colorRamp(fac, [
    { position: 0.1955, color: [0.391471, 0.391471, 0.391471, 1] },
    { position: 0.554545, color: [0, 0, 0, 1] },
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

/** Texture Coordinate: UV in his graph, the other two are this page's. */
function source(g: Graph, mode: HatchCoords): GraphNode {
  if (mode === 'object') return g.position('object')
  if (mode === 'window') return g.window()
  return g.uv()
}

/**
 * Texture Coordinate -> Mapping POINT. Location is the group's "Ofset" on every
 * axis (a Combine XYZ in the original), Rotation is identity except on hatch B's
 * diagonal, and Scale is his 1 unless the page asks for another space.
 */
function hatchCoords(
  g: Graph,
  mode: HatchCoords,
  offset: number,
  scale: number,
  rotation: [number, number, number] = [0, 0, 0],
): GraphNode {
  return g.mapping(source(g, mode), {
    type: 'POINT',
    location: [offset, offset, offset],
    rotation,
    scale: [scale, scale, scale],
  })
}

interface Rig {
  lights: readonly SketchLight[]
  worldAmbient: number
}

function build(opts: HatchOptions, rig: Rig): THREE.Material {
  const A = opts.hatchA ?? 5
  const B = opts.hatchB ?? 5
  const bAmount = opts.hatchBAmount ?? 1
  const contrast = opts.contrast ?? 0.426775
  const gammaValue = opts.gamma ?? 1
  const offset = opts.offset ?? 0.05
  const mode = opts.coords ?? 'uv'
  const coordScale = opts.coordScale ?? COORD_SCALE[mode]

  const g = graph()
  const co = hatchCoords(g, mode, offset, coordScale)
  const coB = hatchCoords(g, mode, offset, coordScale, ROT_B)

  // hatch A: a clean diagonal at 5x the size, screened with a heavily distorted
  // vertical at 1x. Math.001 in his graph is "Hatch A size" * 5.
  const a1 = edgeRamp(g, g.wave(co, { scale: A * 5, bandsDirection: 'DIAGONAL', distortion: 0, detail: 2, detailScale: 1 }))
  const a2 = lineRamp(g, g.wave(co, { scale: A, bandsDirection: 'Y', distortion: 74.899994, detail: 2, detailScale: 0.5 }))
  const hatchA = g.mix('SCREEN', 1, a1, a2)

  // hatch B: the same pair with its own distortions, its own 90 degree rotation
  // on the diagonal, and a NEGATIVE detail scale on the second, which is his and
  // not a typo
  const b1 = edgeRamp(g, g.wave(coB, { scale: B * 5, bandsDirection: 'DIAGONAL', distortion: 2.8, detail: 2, detailScale: 0.5 }))
  const b2 = lineRamp(g, g.wave(co, { scale: B, bandsDirection: 'Y', distortion: 14.199999, detail: 3.1, detailScale: -4.1 }))
  const hatchB = g.mix('SCREEN', 1, b1, b2)

  const hatch = g.mix('MULTIPLY', bAmount, hatchA, hatchB)

  // Diffuse BSDF -> Shader to RGB -> ColorRamp -> Gamma
  const diffuse = g.diffuseBsdf(ALBEDO, {
    roughness: 0,
    lights: rig.lights,
    worldAmbient: rig.worldAmbient,
  })
  const toned = g.colorRamp(g.separate(g.shaderToRgb(diffuse), 'x'), [
    { position: 0.140909, color: [0, 0, 0, 1] },
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
      { position: 0.459091, color: [0, 0, 0, 1] },
      { position: 0.477273, color: [1, 1, 1, 1] },
    ],
    'CONSTANT',
  )

  const m = compileMaterial(out)
  m.side = THREE.DoubleSide
  return m
}

/**
 * His shader under THIS PAGE's rig: suns, normalised to `key`, defaulting to the
 * object-space sampling the ship needs.
 */
export function hatchMaterial(opts: HatchOptions = {}): THREE.Material {
  const explicit = opts.lights !== undefined
  const gain = explicit ? 1 : (opts.key ?? PAGE_KEY) / PAGE_TOTAL
  const lights = (opts.lights ?? PAGE_LIGHTS).map((l) =>
    l.kind === 'point' ? { ...l, power: l.power * gain } : { ...l, energy: l.energy * gain },
  )
  return build({ coords: 'object', ...opts }, { lights, worldAmbient: opts.worldAmbient ?? PAGE_WORLD })
}

/**
 * His shader under HIS rig, sampled in HIS space, at HIS group defaults.
 *
 * Nothing normalised, nothing retuned, nothing substituted. This is the one that
 * is allowed to be compared against a Blender render and called right or wrong.
 */
export function hisHatchMaterial(opts: HatchOptions = {}): THREE.Material {
  return build({ coords: 'uv', ...opts }, HIS_RIG)
}
