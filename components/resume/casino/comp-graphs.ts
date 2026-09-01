/**
 * Compositor graphs for the resume scene, selectable with ?comp=<name>.
 * Each is a plain function over compGraph(); the recipes that graduate live in
 * the library (blender-to-threejs/src/recipes).
 */
import { fbm, valueNoise, watercolorGraph, type CompGraph, type CompInput, type Compositor } from 'blender-to-threejs'
import type { ImpactFx } from './hero-chip'
import * as THREE from 'three'

// pomme's paper texture for the watercolour compose step
const paper = new THREE.TextureLoader().load('/models/paper.png')
paper.colorSpace = THREE.SRGBColorSpace

type Uniforms = Compositor['uniforms']

export interface CompGraphEntry {
  build: (c: CompGraph) => CompInput
  onFrame?: (u: Uniforms, elapsed: number, fx: ImpactFx) => void
  /** write raw linear values to the canvas like pomme's GLSL pass */
  rawOutput?: boolean
  renderScale?: number
  positionPass?: 'always' | 'onChange'
}

/**
 * The impact flicker, as {impact, after} for the manga pass. One place, because casino-scene drives the
 * same uniforms on its own path and the two had drifted into separate copies of this.
 *
 * SIX frames at 12fps, all of them the SAME treatment:
 *
 *   0      after = 1, a blown-out white frame. The hit itself.
 *   1-5    impact = 2, the inverted two-tone, held for the whole rest of the flicker
 *   then   the afterimage veil decays out
 *
 * The gritty mono frames that used to run from frame 3 are gone. They were the crosshatch look, and
 * switching into them halfway meant the flash changed its mind partway through - two effects in a row
 * rather than one held. One treatment, held, is a stronger read, and the inverted two-tone is the one
 * worth holding: it is the only state that reverses the whole image rather than just texturing it.
 *
 * The blank frame stays, and it is deliberately NOT the crosshatch state underneath - impact is 2 there
 * too, so no mono frame exists anywhere in the sequence. It has to be its own step because in the shader
 * the afterimage veil is mixed BEFORE the inversion, so an inverted frame overwrites any veil on top.
 */
export function impactPass(ia: number): { impact: number; after: number } {
  const IFR = 1 / 12
  if (ia < 0) return { impact: 0, after: 0 }
  const n = Math.floor(ia / IFR)
  if (n === 0) return { impact: 2, after: 1 }
  if (n <= 5) return { impact: 2, after: 0 }
  return { impact: 0, after: 0.5 * Math.exp(-(ia - IFR * 6) * 6) }
}

function impactFrames(u: Uniforms, ia: number) {
  const { impact, after } = impactPass(ia)
  if (u.impact) u.impact.value = impact
  if (u.after) u.after.value = after
}

export const COMP_GRAPHS: Record<string, CompGraphEntry> = {
  /** the watercolour recipe from the library, impact frames from the chip */
  watercolor: {
    build: (c) => watercolorGraph(c, { paper, bleedTaps: 3 }),
    onFrame: (u, _t, fx) => impactFrames(u, fx.impactAge),
    rawOutput: true,
    // painterly hides the internal resolution completely; the pass cost scales with pixels
    renderScale: 0.75,
    positionPass: 'onChange',
  },
  /** the dark room: charcoal paper, gouache composition (chalk glow), one lamp pool over the table */
  night: {
    build: (c) =>
      watercolorGraph(c, {
        paper,
        bleedTaps: 3,
        compose: 'gouache',
        posterize: 0.1,
        // Kaiji back room / Balatro felt: a coloured, grainy dark, not black; warm lamp, smoke in the beam
        paperColor: [0.11, 0.125, 0.115],
        grain: 1.0,
        pool: { centre: [0.5, 0.42], radius: 0.8, floor: 0.75, soft: 1.4 },
      }),
    onFrame: (u, _t, fx) => impactFrames(u, fx.impactAge),
    rawOutput: true,
    renderScale: 0.75,
    positionPass: 'onChange',
  },
  /** passthrough: proves the scene target and the final blit */
  plain: {
    build: (c) => c.renderLayer(),
  },
  /** watercolour with screen-anchored noise (A/B against world anchoring) */
  wcscreen: {
    build: (c) => watercolorGraph(c, { paper, worldAnchor: false }),
    onFrame: (u, _t, fx) => impactFrames(u, fx.impactAge),
    rawOutput: true,
  },
  wcedge: { build: (c) => watercolorGraph(c, { paper, debug: 'edge' }), rawOutput: true },
  wcdens: { build: (c) => watercolorGraph(c, { paper, debug: 'dens' }), rawOutput: true },
  /** the world-anchor coordinate field, fract, for A/B against pomme's DBG_AA */
  aa: {
    build: (c) => {
      const pos = c.renderLayer('position')
      const px = c.separate(pos, 'r'), py = c.separate(pos, 'g'), pz = c.separate(pos, 'b')
      const len = c.math('SQRT', c.add(c.add(c.mul(px, px), c.mul(py, py)), c.mul(pz, pz)))
      const k = c.divide(4, c.add(4, len))
      const ax = c.add(c.mul(px, k), c.mul(c.mul(pz, k), 0.83))
      const ay = c.add(c.mul(py, k), c.mul(c.mul(pz, k), 0.31))
      return c.combine(c.math('FRACT', ax), c.math('FRACT', ay), 0, 1)
    },
    rawOutput: true,
  },
  /** fbm(aa*4.2) and vnoise(aa*3.5) on the world anchor, for A/B against pomme's DBG_FBM / DBG_VN */
  fbm: {
    build: (c) => {
      const pos = c.renderLayer('position')
      const px = c.separate(pos, 'r'), py = c.separate(pos, 'g'), pz = c.separate(pos, 'b')
      const len = c.math('SQRT', c.add(c.add(c.mul(px, px), c.mul(py, py)), c.mul(pz, pz)))
      const k = c.divide(4, c.add(4, len))
      const aa = c.combine(c.add(c.mul(px, k), c.mul(c.mul(pz, k), 0.83)), c.add(c.mul(py, k), c.mul(c.mul(pz, k), 0.31)))
      const v = fbm(c, aa, 4.2)
      return c.combine(v, v, v, 1)
    },
    rawOutput: true,
  },
  vn: {
    build: (c) => {
      const pos = c.renderLayer('position')
      const px = c.separate(pos, 'r'), py = c.separate(pos, 'g'), pz = c.separate(pos, 'b')
      const len = c.math('SQRT', c.add(c.add(c.mul(px, px), c.mul(py, py)), c.mul(pz, pz)))
      const k = c.divide(4, c.add(4, len))
      const aa = c.combine(c.add(c.mul(px, k), c.mul(c.mul(pz, k), 0.83)), c.add(c.mul(py, k), c.mul(c.mul(pz, k), 0.31)))
      const v = valueNoise(c, aa, 3.5)
      return c.combine(v, v, v, 1)
    },
    rawOutput: true,
  },
  /** position pass, scaled into view: debug */
  position: {
    build: (c) => {
      const p = c.renderLayer('position')
      return c.combine(c.add(c.mul(c.separate(p, 'r'), 0.25), 0.5), c.add(c.mul(c.separate(p, 'g'), 0.25), 0.5), c.add(c.mul(c.separate(p, 'b'), 0.25), 0.5), 1)
    },
    rawOutput: true,
  },
  /** passthrough with raw linear output: exact numbers on screen for measurement */
  plainraw: {
    build: (c) => c.renderLayer(),
    rawOutput: true,
  },
  /** sobel ink lines over cream paper: proves a kernel stage */
  ink: {
    build: (c) => {
      const scene = c.renderLayer()
      const edges = c.filter(c.luminance(scene), 'SOBEL')
      const ink = c.mapRange(c.separate(edges, 'r'), { from: [0, 1.5], to: [0, 1], clamp: true })
      const paper = c.rgb(0.96, 0.94, 0.88)
      return c.blend(ink, paper, c.rgb(0.07, 0.07, 0.07))
    },
  },
  /** gaussian bleed + posterize + edge darkening: proves separable blur, mix chain, uniform */
  wash: {
    build: (c) => {
      const scene = c.renderLayer()
      const bleedAmt = c.uniform('bleed', 6)
      const bled = c.blur(scene, 6)
      const post = c.posterize(bled, 5)
      const edges = c.filter(c.luminance(scene), 'SOBEL')
      const dark = c.mapRange(c.separate(edges, 'r'), { from: [0.1, 1.2], to: [1, 0.35], clamp: true })
      const paper = c.rgb(0.97, 0.95, 0.9)
      const onPaper = c.multiply(1, paper, post)
      void bleedAmt
      return c.multiply(1, onPaper, c.combine(dark, dark, dark))
    },
    onFrame: (u, t) => {
      if (u.bleed) u.bleed.value = 6 + 2 * Math.sin(t)
    },
  },
}
