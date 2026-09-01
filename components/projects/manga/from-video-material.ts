'use client'

/**
 * "from video", the ship's OWN material, ported node for node.
 *
 * Source: ~/Dev/3D/personal_website_assets/scenes/"hatching & manga shaders.blend",
 * material `from video`, worn by Cube.010 and Cube.003 (the spaceship). The name
 * is his and it is literal: this is the shader the projects-page background
 * VIDEO was rendered with, carried into the shader-library file with the model.
 *
 * This is the material I should have been porting all along. Earlier work put
 * "3. Cross hatching shader" on the ship because that was the shader being
 * studied, and the result was faithful to that shader and nothing like the
 * projects render, which is a different shader entirely.
 *
 * The graph, read out of the file by socket IDENTIFIER:
 *
 *   Emission( MULTIPLY( GreyUnderpaint, MULTIPLY( LittleHatches, PatchHatching ) ) )
 *
 * Both mixes are at factor 1, so they are plain products. Note the EMISSION:
 * unlike the cross-hatching material, which drops a Color straight onto Surface,
 * this one goes through an Emission node, which is the same unlit result.
 *
 * Group inputs, at the values his material sets on them:
 *   Little hatches   voronoi 50, noise 50, wave 100, gamma 1.0
 *   Patch hatching   voronoi 5, wave 200, A 6, B 7, C 5, noise 57.5,
 *                    soft-light 0.258333, gamma 1.2, linear-light 1.0
 *   Grey underpaint  gamma 0.7
 */
import * as THREE from 'three'
import {
  compileMaterial,
  graph,
  type Graph,
  type GraphNode,
  type SketchLight,
} from 'blender-to-threejs'

/**
 * Blender's Generated coordinate needs the object's OWN bounding box, in the
 * object's own space, and every part of a model has a different one.
 */
export interface Bounds {
  min: [number, number, number]
  max: [number, number, number]
}

export interface FromVideoOptions {
  lights: readonly SketchLight[]
  worldAmbient: number
  /** the part's own bounding box, for Texture Coordinate > Generated */
  bounds: Bounds
  /** Little hatches: Voronoi scale (Input_3) */
  littleVoronoi?: number
  /** Little hatches: Noise scale (Input_5) */
  littleNoise?: number
  /** Little hatches: Wave scale (Input_7) */
  littleWave?: number
  /** Little hatches: Gamma (Input_9) */
  littleGamma?: number
  /** Patch: base Voronoi scale (Input_3), multiplied per layer */
  patchVoronoi?: number
  /** Patch: Wave scale (Input_5), shared by all three layers */
  patchWave?: number
  /** Patch: the three per-layer Voronoi multipliers (Input_7 / _9 / _11) */
  patchLayers?: [number, number, number]
  /** Patch: Noise scale (Input_13) */
  patchNoise?: number
  /** Patch: SOFT_LIGHT factor on the tone (Input_17) */
  patchSoft?: number
  /** Patch: Gamma (Input_19) */
  patchGamma?: number
  /** Patch: LINEAR_LIGHT factor (Input_21) */
  patchContrast?: number
  /** Grey underpaint: Gamma (Input_3) */
  underpaintGamma?: number
}

/**
 * Blender's Generated coordinate, expressed in BLENDER's axes.
 *
 * The bounds handed in are the glTF geometry's, because that is the space the
 * mesh is actually in, and the glTF exporter swapped the axes on the way out:
 * Blender (x, y, z) -> glTF (x, z, -y). Generated normalises each axis
 * independently, so the swap survives normalisation and can be undone on the
 * normalised value: blender = (gx, 1 - gz, gy), the flip on y because -y
 * reverses that axis's range.
 *
 * It matters here and not everywhere: the Voronoi is isotropic, so a permutation
 * only reorients its cells, but the first patch layer's Mapping has a scale of
 * (1, 0.5, 1) and squashing the WRONG axis is a different pattern. Measured: the
 * patch group alone printed 5.53 percent ink against Blender's 3.27 with the
 * glTF axes, which is what sent me here.
 */
function generatedBlender(g: Graph, b: Bounds): GraphNode {
  const n = g.generated(b.min, b.max)
  return g.combine(g.separate(n, 'x'), g.subtract(1, g.separate(n, 'z')), g.separate(n, 'y'))
}

/** his Diffuse BSDF's own Color input, in every one of the three groups */
const ALBEDO: [number, number, number, number] = [0.8, 0.8, 0.8, 1]

/**
 * The rotation a Voronoi cell's colour drives, in all four places it appears:
 * Vector Math MULTIPLY by (0, 0, 2.6). A pure Z turn of up to 2.6 radians, which
 * is what gives every patch its own hatch angle. Without a Mapping that can take
 * a DRIVEN rotation this collapses to one angle everywhere and the shader stops
 * being patch hatching at all.
 */
const TURN: [number, number, number] = [0, 0, 2.6]

/** the wave every hatch layer uses: X bands, distortion 2.4, detail 2 */
function hatchWave(g: Graph, co: GraphNode, scale: number): GraphNode {
  return g.wave(co, {
    scale,
    bandsDirection: 'X',
    waveType: 'BANDS',
    distortion: 2.4,
    detail: 2,
    detailScale: 1,
  })
}

/**
 * One patch layer: a Voronoi cell field, its edges inked, and a wave hatch whose
 * ANGLE comes from the cell's own random colour.
 *
 * `edgeRamp` differs per layer in his graph and `cellCo` carries that layer's
 * own Mapping (a location offset, so the three layers do not share cells).
 */
function patchLayer(
  g: Graph,
  bounds: Bounds,
  opts: {
    voronoiScale: number
    waveScale: number
    location: [number, number, number]
    coordScale: [number, number, number]
    edgeStops: { position: number; color: [number, number, number, number] }[]
  },
): GraphNode {
  const gen = generatedBlender(g, bounds)
  const cellCo = g.mapping(gen, {
    type: 'POINT',
    location: opts.location,
    rotation: [0, 0, 0],
    scale: opts.coordScale,
  })
  // the cell EDGES, inked by a ramp that runs white to black
  const edge = g.colorRamp(
    g.voronoi(cellCo, { scale: opts.voronoiScale, feature: 'DISTANCE_TO_EDGE' }),
    opts.edgeStops,
  )
  // the cell's own random colour, straight through an identity ramp and scaled
  // into a Z rotation
  // Blender links the Voronoi COLOUR straight into the ramp's Fac, which is a
  // float socket, so it inserts rgbtobw. Taking one channel would be a
  // different number here: a cell colour is three independent hashes.
  const cellColor = g.colorRamp(
    g.rgbToBw(g.voronoi(cellCo, { scale: opts.voronoiScale, feature: 'F1', output: 'color' })),
    [
      { position: 0, color: [0, 0, 0, 1] },
      { position: 1, color: [1, 1, 1, 1] },
    ],
  )
  const rotation = g.vectorMath('MULTIPLY', cellColor, g.combine(TURN[0], TURN[1], TURN[2]))
  const hatch = hatchWave(g, g.mappingDynamic(g.uv(), { type: 'POINT', rotation }), opts.waveScale)
  return g.mix('SCREEN', 1, edge, hatch)
}

/**
 * "Little hatches": one Voronoi patch field whose hatch is masked by a noise, so
 * the strokes appear in drifts rather than everywhere.
 */
function littleHatches(g: Graph, o: Required<Pick<FromVideoOptions, 'littleVoronoi' | 'littleNoise' | 'littleWave' | 'littleGamma'>> & { bounds: Bounds }): GraphNode {
  const gen = generatedBlender(g, o.bounds)
  const cellCo = g.mapping(gen, { type: 'POINT', location: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] })
  const edge = g.colorRamp(g.voronoi(cellCo, { scale: o.littleVoronoi, feature: 'DISTANCE_TO_EDGE' }), [
    { position: 0.0, color: [1, 1, 1, 1] },
    { position: 0.063636, color: [0, 0, 0, 1] },
  ])
  const cellColor = g.colorRamp(g.rgbToBw(g.voronoi(cellCo, { scale: o.littleVoronoi, feature: 'F1', output: 'color' })), [
    { position: 0, color: [0, 0, 0, 1] },
    { position: 1, color: [1, 1, 1, 1] },
  ])
  const rotation = g.vectorMath('MULTIPLY', cellColor, g.combine(TURN[0], TURN[1], TURN[2]))
  const wave = hatchWave(g, g.mappingDynamic(generatedBlender(g, o.bounds), { type: 'POINT', rotation }), o.littleWave)

  // the mask: a noise, gamma'd, ramped hard, deciding wave against plain white
  // Noise.Fac is a float, Gamma.Color is a colour socket, and the ramp's Fac is
  // a float again: Blender promotes on the way in and reduces on the way out,
  // and both have to be said out loud here
  const mask = g.colorRamp(
    g.rgbToBw(
      g.gamma(
        g.noise(gen, { scale: o.littleNoise, detail: 2, roughness: 0.5, lacunarity: 2, normalize: true, output: 'fac' }),
        o.littleGamma,
      ),
    ),
    [
      { position: 0.268182, color: [0, 0, 0, 1] },
      { position: 0.381819, color: [1, 1, 1, 1] },
    ],
  )
  const masked = g.mix('MIX', g.rgbToBw(mask), wave, g.rgb(1, 1, 1))
  const combined = g.mix('SCREEN', 1, masked, edge)
  return g.colorRamp(
    g.rgbToBw(combined),
    [
      { position: 0.209091, color: [0, 0, 0, 1] },
      { position: 0.372727, color: [1, 1, 1, 1] },
    ],
    'CONSTANT',
  )
}

/**
 * "Patch hasting shader": three patch layers at different cell scales and
 * offsets, multiplied together, then driven against the lit tone.
 */
function patchHatching(g: Graph, o: FromVideoOptions): GraphNode {
  const base = o.patchVoronoi ?? 5
  const waveScale = o.patchWave ?? 200
  const [la, lb, lc] = o.patchLayers ?? [6, 7, 5]

  const a = patchLayer(g, o.bounds, {
    voronoiScale: base * la,
    waveScale,
    location: [0, 0, 0],
    coordScale: [1, 0.5, 1],
    edgeStops: [
      { position: 0.0, color: [1, 1, 1, 1] },
      { position: 0.154545, color: [0, 0, 0, 1] },
    ],
  })
  const b = patchLayer(g, o.bounds, {
    voronoiScale: base * lb,
    waveScale,
    location: [5, 5, 0],
    coordScale: [1, 1, 1],
    edgeStops: [
      { position: 0.022727, color: [1, 1, 1, 1] },
      { position: 0.181818, color: [0, 0, 0, 1] },
    ],
  })
  const c = patchLayer(g, o.bounds, {
    voronoiScale: base * lc,
    waveScale,
    location: [10, 10, 0],
    coordScale: [1, 1, 1],
    edgeStops: [
      { position: 0.0, color: [1, 1, 1, 1] },
      { position: 0.104545, color: [0, 0, 0, 1] },
    ],
  })
  const hatch = g.mix('MULTIPLY', 1, g.mix('MULTIPLY', 1, a, b), c)

  // tone: the lit surface, soft-lit by a fine noise so it breaks up
  const lit = g.shaderToRgb(g.diffuseBsdf(ALBEDO, { roughness: 0, lights: o.lights, worldAmbient: o.worldAmbient }))
  // Blender feeds an UNCONNECTED texture Vector with the GENERATED coordinate,
  // not the object position. The builder's default is position('object'), which
  // is the same direction but not normalised into the bounding box, so at scale
  // 57.5 the grain comes out at a completely different frequency. His Noise here
  // has no Vector link, so it gets Generated.
  const grain = g.noise(generatedBlender(g, o.bounds), {
    scale: o.patchNoise ?? 57.499992,
    detail: 2,
    roughness: 0.5,
    lacunarity: 2,
    normalize: true,
    output: 'fac',
  })
  const toned = g.mix('SOFT_LIGHT', o.patchSoft ?? 0.258333, lit, grain)
  const shaped = g.gamma(
    g.colorRamp(g.rgbToBw(toned), [
      { position: 0.0, color: [0, 0, 0, 1] },
      { position: 0.318182, color: [1, 1, 1, 1] },
    ]),
    o.patchGamma ?? 1.2,
  )
  const driven = g.mix('LINEAR_LIGHT', o.patchContrast ?? 1.0, hatch, shaped)
  return g.colorRamp(
    g.rgbToBw(driven),
    [
      { position: 0.0, color: [0, 0, 0, 1] },
      { position: 0.1, color: [1, 1, 1, 1] },
    ],
    'CONSTANT',
  )
}

/**
 * "7.grey underpaint": the lit tone alone, gamma'd and pushed through a ramp
 * that lands on three greys. This is what stops the ship being pure black and
 * white and gives the shadow side its mid tone.
 */
function greyUnderpaint(g: Graph, o: FromVideoOptions): GraphNode {
  const lit = g.shaderToRgb(g.diffuseBsdf(ALBEDO, { roughness: 0, lights: o.lights, worldAmbient: o.worldAmbient }))
  const gam = g.gamma(lit, o.underpaintGamma ?? 0.7)
  return g.colorRamp(g.rgbToBw(gam), [
    { position: 0.075, color: [0.170654, 0.170654, 0.170654, 1] },
    { position: 0.219318, color: [0.483199, 0.483199, 0.483199, 1] },
    { position: 0.222727, color: [1, 1, 1, 1] },
  ])
}

/**
 * Which part of the material to output. Not a feature: a bisection tool. The
 * three groups are MULTIPLIED, so if the product is too dark the question is
 * which factor is, and a product tells you nothing about its factors.
 */
export type FromVideoLayer = 'all' | 'little' | 'patch' | 'under'

export function fromVideoMaterial(o: FromVideoOptions & { layer?: FromVideoLayer }): THREE.Material {
  const g = graph()
  const little = littleHatches(g, {
    bounds: o.bounds,
    littleVoronoi: o.littleVoronoi ?? 50,
    littleNoise: o.littleNoise ?? 50,
    littleWave: o.littleWave ?? 100,
    littleGamma: o.littleGamma ?? 1,
  })
  const patch = patchHatching(g, o)
  const under = greyUnderpaint(g, o)
  const layer = o.layer ?? 'all'
  const out =
    layer === 'little'
      ? little
      : layer === 'patch'
        ? patch
        : layer === 'under'
          ? under
          : g.mix('MULTIPLY', 1, under, g.mix('MULTIPLY', 1, little, patch))
  const m = compileMaterial(out)
  m.side = THREE.DoubleSide
  return m
}
