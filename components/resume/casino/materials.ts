/**
 * Casino materials, all authored through the node pipeline (graph() +
 * compileMaterial) so they carry Blender semantics and are inspectable.
 *
 * Every colour is an exact CASINO_PALETTE ink times a shading lift, so the
 * manga pass quantises it exactly: felt prints as green spot ink, card pips as
 * red, chips as their own ink, paper regions as black-on-paper.
 */
import * as THREE from 'three'
import { DoubleSide, type Texture } from 'three'
import { CASINO_PALETTE, compileMaterial, feltMaterialGraph, graph, lit, openInViewer, revealMask, smoothStep, spotLamp, watercolorMaterialGraph, type Graph, type GraphNode } from 'blender-to-threejs'

const [INK_BLACK, INK_RED, INK_GREEN, INK_GOLD] = CASINO_PALETTE.inks
const PAPER = CASINO_PALETTE.paper

// Shallow normal-driven lift: enough for the pass to find highlight and shadow
// bands, not enough to read as lit. Map Range with clamp, per the field notes.
function lift(g: ReturnType<typeof graph>, lo = 0.55, hi = 1.05) {
  return g.mapRange(g.separate(g.normal('world'), 'y'), {
    from: [-1, 1],
    to: [lo, hi],
    clamp: true,
  })
}

/** Green baize: the library's felt graph (noise fibre, mottling, Layer Weight rim) on the palette green. */
export function feltMaterial() {
  const g = graph()
  return compileMaterial(register('felt', feltMaterialGraph(g, g.rgb(...INK_GREEN))))
}

/* ---------------- dev: hand any casino graph to the library's node viewer ----------------
 * In the console: b2t.view('felt')  (needs the library dev server: npm run dev in blender-to-threejs) */
const GRAPHS: Record<string, GraphNode> = {}
export function register(name: string, node: GraphNode): GraphNode {
  GRAPHS[name] = node
  if (typeof window !== 'undefined') {
    const w = window as unknown as { b2t?: { graphs: Record<string, GraphNode>; view: (n: string) => void } }
    w.b2t = w.b2t ?? { graphs: GRAPHS, view: (n: string) => { const g = GRAPHS[n]; if (g) openInViewer(g, { title: `casino:${n}` }); else console.warn('graphs:', Object.keys(GRAPHS)) } }
  }
  return node
}

/** Card stock: paper with a slight tone falloff so edges outline. */
export function paperMaterial() {
  const g = graph()
  return compileMaterial(register('paper', g.multiplyColor(1, g.rgb(...PAPER), lift(g, 0.7, 1.0))))
}

/** Card face: the project art, framed by paper. */
export function cardFaceMaterial(map: THREE.Texture) {
  const g = graph()
  const uv = g.uv()
  const u = g.separate(uv, 'x')
  const v = g.separate(uv, 'y')
  // inset frame: 1 inside the art window, 0 in the border
  const inU = g.multiply(g.greaterThan(u, 0.08), g.greaterThan(0.92, u))
  const inV = g.multiply(g.greaterThan(v, 0.08), g.greaterThan(0.92, v))
  const inside = g.multiply(inU, inV)
  const art = g.texture(map, uv)
  return compileMaterial(g.blend(inside, g.rgb(...PAPER), art))
}

/**
 * Card back: red diamond lattice on paper. Pure UV math, prints as red spot
 * ink with the pass doing the shading.
 */
export function cardBackMaterial() {
  const g = graph()
  const uv = g.uv()
  const u = g.separate(uv, 'x')
  const v = g.separate(uv, 'y')
  // diagonal lattice from fract of rotated coordinates
  const s = g.math('FRACT', g.multiply(g.add(u, v), 6))
  const d = g.math('FRACT', g.multiply(g.subtract(u, v), 6))
  const lineS = g.greaterThan(g.math('ABSOLUTE', g.subtract(s, 0.5)), 0.42)
  const lineD = g.greaterThan(g.math('ABSOLUTE', g.subtract(d, 0.5)), 0.42)
  const lattice = g.math('MAXIMUM', lineS, lineD)
  const inU = g.multiply(g.greaterThan(u, 0.07), g.greaterThan(0.93, u))
  const inV = g.multiply(g.greaterThan(v, 0.07), g.greaterThan(0.93, v))
  const inside = g.multiply(inU, inV)
  const fill = g.blend(lattice, g.rgb(...INK_RED), g.rgb(...PAPER))
  return compileMaterial(register('cardBack', g.blend(inside, g.rgb(...PAPER), fill)))
}

export type ChipInk = 'red' | 'green' | 'gold' | 'black'
const CHIP_INK: Record<ChipInk, readonly [number, number, number]> = {
  red: INK_RED,
  green: INK_GREEN,
  gold: INK_GOLD,
  black: INK_BLACK,
}

/**
 * Clay chip: coloured body with paper edge inserts. Angle around the rim from
 * UV, modulo into 8 spots. Face gets a paper ring. All UV math, no textures.
 */
export function chipMaterial(ink: ChipInk) {
  const g = graph()
  const body = g.rgb(...CHIP_INK[ink])
  const uv = g.uv()
  const u = g.separate(uv, 'x')
  // cylinder side UV: u runs around the rim. 8 inserts, each 45 percent duty.
  const spot = g.greaterThan(g.math('FRACT', g.multiply(u, 8)), 0.55)
  const side = g.blend(spot, body, g.rgb(...PAPER))
  return compileMaterial(register(`chip:${ink}`, g.multiplyColor(1, side, lift(g, 0.6, 1.0))))
}

export function chipFaceMaterial(ink: ChipInk) {
  const g = graph()
  const body = g.rgb(...CHIP_INK[ink])
  const uv = g.uv()
  const cx = g.subtract(g.separate(uv, 'x'), 0.5)
  const cy = g.subtract(g.separate(uv, 'y'), 0.5)
  const r = g.math('SQRT', g.add(g.multiply(cx, cx), g.multiply(cy, cy)))
  // paper ring between two radii
  const ring = g.multiply(g.greaterThan(r, 0.3), g.greaterThan(0.4, r))
  return compileMaterial(register(`chipFace:${ink}`, g.blend(ring, body, g.rgb(...PAPER))))
}

/** Black ink for the deck box, marquee, and anything that should print solid. */
export function inkMaterial() {
  const g = graph()
  return compileMaterial(g.multiplyColor(1, g.rgb(...INK_BLACK), lift(g, 0.8, 1.2)))
}

/**
 * Character stock: paper with a deep lift so a figure gets real halftone and
 * hatch in its shadows instead of printing as a flat cutout.
 */
/** the room's one lamp as a graph term (uniforms lampX/Y/Z/Cone/Blend/Range/Amb/Gain, see LAMP) */
export const LAMP = { position: [0, 7.5, 0] as [number, number, number], cone: 33, blend: 0.75, range: 10, ambient: 0.2, gain: 1.9 }
export function lamp(g: Graph, normal?: [number, number, number], override: Partial<typeof LAMP> & { twoSided?: boolean } = {}) {
  return spotLamp(g, { ...LAMP, ...override, normal }).light
}
/**
 * Materials that can be PRESENTED: lifted off the table and held up to the camera. The lamp is a spot over
 * the felt, so anything that leaves the table leaves its pool and goes dark (measured: the folder lost 38
 * percent of its brightness on the way up). These carry a `present` uniform that crossfades their lighting
 * to an even front light, so a presented object reads as lit by the act of being held up.
 */
export const PRESENT_MATERIALS = new Set<{ userData: Record<string, unknown> }>()
export function trackPresent<T extends { userData: Record<string, unknown> }>(m: T): T {
  PRESENT_MATERIALS.add(m)
  return m
}
export function drivePresent(v: number) {
  for (const m of PRESENT_MATERIALS) {
    const u = (m.userData.uniforms as Record<string, { value: number }> | undefined) ?? {}
    if (u.present) u.present.value = v
  }
}

/** the lamp term crossfaded to an even front light as the object is presented */
function litOrPresented(g: Graph, col: GraphNode, litCol: GraphNode) {
  const p = g.uniform('present', 0)
  return g.blend(p, litCol, g.multiplyColor(1, col, g.rgb(1.08, 1.06, 1.02)))
}

/** every compiled material carrying the lamp term, so one driver can move the lamp (uniforms by name) */
export const LIT_MATERIALS = new Set<{ userData: Record<string, unknown> }>()
export function trackLit<T extends { userData: Record<string, unknown> }>(m: T): T {
  LIT_MATERIALS.add(m)
  return m
}
/** set the lamp uniforms on every lit material */
export function driveLamp(v: { x?: number; y?: number; z?: number; cone?: number; blend?: number; range?: number; ambient?: number; gain?: number; room?: { cone: number; gain: number } }) {
  for (const m of LIT_MATERIALS) {
    const u = (m.userData.uniforms as Record<string, { value: number }> | undefined) ?? {}
    // the room's own cone (floor and wall): dark until the landing, then opens with the lamp
    if (v.room && u.roomCone) {
      u.roomCone.value = v.room.cone
      u.roomGain.value = v.room.gain
      if (v.y !== undefined && u.roomY) u.roomY.value = v.y
    }
    if (v.x !== undefined && u.lampX) u.lampX.value = v.x
    if (v.y !== undefined && u.lampY) u.lampY.value = v.y
    if (v.z !== undefined && u.lampZ) u.lampZ.value = v.z
    // materials lit by the lamp's spill (room walls, floor) keep their own wide cone
    if (v.cone !== undefined && u.lampCone && !m.userData.lampSpill) u.lampCone.value = v.cone
    if (v.blend !== undefined && u.lampBlend) u.lampBlend.value = v.blend
    if (v.range !== undefined && u.lampRange) u.lampRange.value = v.range
    if (v.ambient !== undefined && u.lampAmb) u.lampAmb.value = v.ambient
    if (v.gain !== undefined && u.lampGain && !m.userData.lampSpill) u.lampGain.value = v.gain
  }
}

export function characterMaterial(opts: { clipScreenX?: number } = {}) {
  const g = graph()
  const col = lit(g, g.multiplyColor(1, g.rgb(...PAPER), lift(g, 0.28, 1.05)), lamp(g))
  // hand-only staging: nothing drawn right of this screen fraction (Texture Coordinate > Window; a graph
  // cutout, camera-independent). Not world position: on a skinned mesh positionWorld is pre-skin.
  if (opts.clipScreenX !== undefined) {
    const sx = g.separate(g.window(), 'x')
    return trackLit(compileMaterial(col, { opacity: g.lessThan(sx, opts.clipScreenX), alphaTest: 0.5 }))
  }
  return trackLit(compileMaterial(col))
}

/**
 * Per-object watercolour (library recipe) on a chip: body ink with the rim
 * inserts, face with the paper ring. The pattern is the same UV math as the
 * palette chip; the wash, wobble, edge darkening and granulation are the
 * watercolour material graph. Pair with the compositor for bleed + paper.
 */
export function chipWatercolorMaterial(ink: ChipInk) {
  const g = graph()
  const body = g.rgb(...CHIP_INK[ink])
  const uv = g.uv()
  const u = g.separate(uv, 'x')
  const spot = g.greaterThan(g.math('FRACT', g.multiply(u, 8)), 0.55)
  const base = g.blend(spot, body, g.rgb(...PAPER))
  return trackLit(compileMaterial(register(`chipWC:${ink}`, lit(g, watercolorMaterialGraph(g, { base, scale: 2.5, wobble: 0.04, bands: 3, edge: 0.6 }), lamp(g)))))
}
export function chipFaceWatercolorMaterial(ink: ChipInk) {
  const g = graph()
  const body = g.rgb(...CHIP_INK[ink])
  const uv = g.uv()
  const cx = g.subtract(g.separate(uv, 'x'), 0.5)
  const cy = g.subtract(g.separate(uv, 'y'), 0.5)
  const r = g.math('SQRT', g.add(g.multiply(cx, cx), g.multiply(cy, cy)))
  const ring = g.multiply(g.greaterThan(r, 0.3), g.greaterThan(0.4, r))
  const base = g.blend(ring, body, g.rgb(...PAPER))
  return trackLit(compileMaterial(register(`chipFaceWC:${ink}`, lit(g, watercolorMaterialGraph(g, { base, scale: 2.5, wobble: 0.04, bands: 3, edge: 0.6 }), lamp(g)))))
}

/**
 * the room itself: walls and floor take the lamp's SPILL (near-hemispherical falloff, no cone) at low gain,
 * so a wall far behind the table still shows a soft gradient from the lamp instead of flat ambient
 */
export function roomMaterial(kind: 'wall' | 'floor') {
  const g = graph()
  const co = g.position('world')
  const base: [number, number, number] = kind === 'wall' ? [0.17, 0.12, 0.09] : [0.1, 0.075, 0.06]
  // dark wood panelling: a tone step per panel across x (the lamp picks the panels out), fine vertical grain
  const px = g.separate(co, 'x')
  const panelId = g.math('FLOOR', g.divide(px, 1.7))
  const panelTone = g.mapRange(g.noise(g.combine(g.multiply(panelId, 0.37), 0.5, 0.5), { scale: 1, detail: 0 }), { from: [0, 1], to: [0.82, 1.12], clamp: true })
  const gap = smoothStep(g, g.math('FRACT', g.divide(px, 1.7)), 0.0, 0.03)
  const grain = g.mapRange(g.noise(g.combine(g.multiply(px, 6), g.multiply(g.separate(co, 'y'), 0.4), 0), { scale: 1, detail: 1 }), { from: [0, 1], to: [0.9, 1.08], clamp: true })
  const tone = g.multiply(g.multiply(panelTone, grain), g.add(0.6, g.multiply(0.4, gap)))
  const col = g.multiplyColor(1, g.rgb(...base), g.combine(tone, tone, tone))
  // the main lamp cone (driven with the beat: tight before the drop, opening after) plus a faint spill so
  // the wall keeps a gradient; the spill has its own uniform names so the driver never touches it
  // 'room' prefix: the driver holds the floor dark before the landing while the chip's lamp stays on
  const cone = spotLamp(g, { ...LAMP, prefix: 'room' }).light
  const spill = spotLamp(g, { ...LAMP, prefix: 'spill', cone: 88, blend: 0.9, gain: 0.55, ambient: 0.03, range: 18 }).light
  const m = trackLit(compileMaterial(register(`room:${kind}`, lit(g, col, g.add(cone, spill)))))
  return m
}

/** the padded rail: oxblood leather with grain, crown catches the lamp (real geometry now: a tube on the D outline) */
export function railMaterial(reveal?: { centre: [number, number]; reach: number }) {
  const g = graph()
  const co = g.position('world')
  // leather: coarse grain plus a fine pebble, shaded by the lamp's SPILL (wide cone) so the roll's
  // roundness reads even where the beam does not reach: bright crown, dark underside
  const grain = g.mapRange(g.noise(co, { scale: 3, detail: 1, roughness: 0.6 }), { from: [0, 1], to: [0.82, 1.14], clamp: true })
  const pebble = g.mapRange(g.noise(co, { scale: 28, detail: 1 }), { from: [0, 1], to: [0.94, 1.06], clamp: true })
  const tone = g.multiply(grain, pebble)
  let col = g.multiplyColor(1, g.rgb(0.3, 0.11, 0.09), g.combine(tone, tone, tone))
  col = lit(g, col, lamp(g, undefined, { cone: 80, blend: 0.8, gain: 1.25, ambient: 0.07, range: 12 }))
  if (reveal) {
    // paints in with the table (same field, cutout)
    const rv = revealMask(g, { centre: reveal.centre, reach: reveal.reach, noiseAmount: g.uniform('revealNoise', 1), radialAmount: g.uniform('revealRadial', 1), softness: g.uniform('revealSoft', 0.13) })
    const m = trackLit(compileMaterial(register('rail', col), { opacity: rv.mask, alphaTest: 0.5 }))
    m.userData.lampSpill = true
    return m
  }
  const m = trackLit(compileMaterial(register('rail', col)))
  m.userData.lampSpill = true
  return m
}

/** manila folder stock: flat colour with a faint fibre, lit by the lamp; darker for the tab, white for the sheet */
export function folderMaterial(kind: 'body' | 'tab' | 'sheet' | 'ink') {
  const g = graph()
  const base: [number, number, number] =
    kind === 'sheet' ? [0.92, 0.9, 0.84] : kind === 'tab' ? [0.66, 0.5, 0.27] : kind === 'ink' ? [0.09, 0.06, 0.05] : [0.8, 0.63, 0.36]
  const fibre = g.mapRange(g.noise(g.position('object'), { scale: 40, detail: 1 }), { from: [0, 1], to: [0.94, 1.05], clamp: true })
  const col = g.multiplyColor(1, g.rgb(...base), g.combine(fibre, fibre, fibre))
  // two-sided lighting: the cover's inside faces have flipped normals once it opens, and a one-sided
  // Lambert term made them read as the texture breaking up
  const m = trackPresent(
    trackLit(compileMaterial(register(`folder:${kind}`, litOrPresented(g, col, lit(g, col, lamp(g, undefined, { twoSided: true })))))),
  )
  // the cover flips over when it opens, so its inside faces have to render (single-sided showed the slab's
  // interior and read as the texture breaking up)
  m.side = DoubleSide
  return m
}

/**
 * the sheet inside the folder: paper white with the resume image WRITTEN onto it under a wobbly brush wipe
 * (uniform 'reveal' 0..1, driven by the folder's open amount). Blender: Image Texture, Noise, Math, Mix.
 */
export function sheetMaterial(map: Texture, opts: { flipU?: boolean; flipV?: boolean; rotate?: boolean; printed?: boolean; border?: number; fit?: number } = {}) {
  const g = graph()
  const uv = g.uv()
  let u = g.separate(uv, 'x'), v = g.separate(uv, 'y')
  if (opts.rotate) [u, v] = [v, u]
  if (opts.flipU) u = g.subtract(1, u)
  if (opts.flipV) v = g.subtract(1, v)
  // a white paper margin around the print (the page is stock, the resume is what is printed on it), which
  // also gives the sheet a clean edge against the manila
  // fit = image aspect / paper aspect: below 1 the print is narrower than the sheet (white either side),
  // above 1 it is shorter (white above and below). The print keeps its proportion either way.
  const f = opts.fit ?? 1
  const fu = f < 1 ? f : 1
  const fv = f < 1 ? 1 : 1 / f
  const uf = fu === 1 ? u : g.add(g.divide(g.subtract(u, 0.5), fu), 0.5)
  const vf = fv === 1 ? v : g.add(g.divide(g.subtract(v, 0.5), fv), 0.5)
  const b = opts.border ?? 0
  const uc = b > 0 ? g.divide(g.subtract(uf, b), 1 - 2 * b) : uf
  const vc = b > 0 ? g.divide(g.subtract(vf, b), 1 - 2 * b) : vf
  const co = g.combine(g.math('MINIMUM', g.math('MAXIMUM', uc, 0), 1), g.math('MINIMUM', g.math('MAXIMUM', vc, 0), 1), 0)
  const inside =
    b > 0 || f !== 1
      ? g.multiply(
          g.multiply(g.greaterThan(uc, 0), g.greaterThan(1, uc)),
          g.multiply(g.greaterThan(vc, 0), g.greaterThan(1, vc)),
        )
      : 1
  const img = g.blend(inside, g.rgb(0.98, 0.97, 0.94), g.texture(map, co))
  const paper = g.rgb(0.94, 0.92, 0.86)
  const reveal = g.uniform('reveal', 0)
  // the wipe travels down the page (v from 1 to 0) with a soft ink edge broken by noise
  const wob = g.multiply(g.subtract(g.noise(g.combine(g.multiply(u, 6), g.multiply(v, 6), 0), { scale: 1, detail: 1 }), 0.5), 0.18)
  const front = g.subtract(g.multiply(reveal, 1.25), 0.12) // slightly past 1 so the last rows finish
  const line = g.add(g.subtract(1, v), wob) // 0 at the top edge .. 1 at the bottom
  const t = g.math('DIVIDE', g.subtract(front, line), 0.1, 0, { clamp: true })
  const mask = g.multiply(g.multiply(t, t), g.subtract(3, g.multiply(t, 2)))
  const col = opts.printed ? img : g.blend(mask, paper, img)
  const m = compileMaterial(register('sheet', col))
  // the modelled page is a single plane: it must show whichever way its normal points
  m.side = DoubleSide
  m.polygonOffset = true
  m.polygonOffsetFactor = -2
  m.polygonOffsetUnits = -2
  return m
}

/**
 * A cut-out mark (a logo, an icon) printed on a surface: colour from `map`, lit like everything else, with
 * its shape from `mask` (white where the mark is). The graph's Image Texture node returns RGB only, so the
 * alpha has to arrive as its own map; alphaTest rather than blending keeps it a cutout, which means it
 * still writes depth and position instead of being treated as a decal.
 */
export function markMaterial(map: Texture, mask: Texture, key: string) {
  const g = graph()
  const art = g.texture(map, g.uv())
  const col = litOrPresented(g, art, lit(g, art, lamp(g, [0, 1, 0])))
  const a = g.separate(g.texture(mask, g.uv()), 'x')
  return trackPresent(trackLit(compileMaterial(register(`mark:${key}`, col), { opacity: a, alphaTest: 0.5 })))
}

/** the printed art on a playing card (face or back), lit by the lamp; the card lies flat, so a flat up normal */
export function cardArtMaterial(map: Texture, key: string) {
  const g = graph()
  const col = lit(g, g.texture(map, g.uv()), lamp(g, [0, 1, 0]))
  return trackLit(compileMaterial(register(`cardArt:${key}`, col)))
}
