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
import { EYE, EYE_PLANE, GLYPH, lowerReach, rayAt, upperReach, type EyeInk } from './eye'

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

/**
 * Chip denominations, in the house order.
 *
 * The first four ARE the casino palette's inks, unchanged, so anything printed
 * through the spot-colour pass still quantises exactly rather than to a nearest
 * match. The rest are real denomination colours and sit OUTSIDE that palette:
 * they are correct under the watercolour pass the resume actually runs, and a
 * spot-colour pass would round them to the closest ink. That is a deliberate
 * trade, not an oversight.
 *
 * Values are the standard table set: white 1, red 5, blue 10, green 25,
 * black 100, purple 500, orange 1000.
 */
export type ChipInk = 'red' | 'green' | 'gold' | 'black' | 'white' | 'blue' | 'purple' | 'orange'
const CHIP_INK: Record<ChipInk, readonly [number, number, number]> = {
  red: INK_RED,
  green: INK_GREEN,
  gold: INK_GOLD,
  black: INK_BLACK,
  white: PAPER,
  blue: [0.13, 0.32, 0.62],
  purple: [0.36, 0.18, 0.48],
  orange: [0.85, 0.42, 0.13],
}

/** the denomination each colour carries, for a label or a stack's value */
export const CHIP_VALUE: Record<ChipInk, number> = {
  white: 1,
  red: 5,
  blue: 10,
  green: 25,
  black: 100,
  purple: 500,
  orange: 1000,
  gold: 5000,
}

/** every chip colour, in denomination order */
export const CHIP_INKS: ChipInk[] = ['white', 'red', 'blue', 'green', 'black', 'purple', 'orange', 'gold']

/**
 * The edge inserts and the face ring are PAPER on every chip except the white
 * one, where paper on paper would erase them. That one takes its own ink.
 */
export function chipTrim(ink: ChipInk): readonly [number, number, number] {
  return ink === 'white' ? INK_RED : PAPER
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
  const side = g.blend(spot, body, g.rgb(...chipTrim(ink)))
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
  return compileMaterial(register(`chipFace:${ink}`, g.blend(ring, body, g.rgb(...chipTrim(ink)))))
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

/**
 * How much a surface faces `d`, mapped into a lighting band. `from` is deliberately a narrow slice near
 * the top of the dot's range rather than the full [-1, 1]: an open folder is two nearly parallel planes a
 * few degrees apart, and over the full range that difference comes out at about one percent, which is to
 * say invisible. Narrowing the slice spends the whole band on the angles that actually occur.
 */
function facing(g: Graph, d: [number, number, number], from: [number, number], to: [number, number]) {
  const n = g.normal('world')
  const dot = g.add(
    g.add(g.multiply(g.separate(n, 'x'), d[0]), g.multiply(g.separate(n, 'y'), d[1])),
    g.multiply(g.separate(n, 'z'), d[2]),
  )
  return g.mapRange(dot, { from, to, clamp: true })
}

/**
 * The lamp term crossfaded to a front light as the object is presented.
 *
 * The front light is DIRECTIONAL, not flat. A flat multiply was the first version and it lit both leaves of
 * the open folder identically, which erased the crease: the fold stopped reading and the presented folder
 * looked like one printed board rather than a folder holding a page. The direction is fixed in world space,
 * which is sound here because the camera holds still while anything is presented.
 */
function litOrPresented(g: Graph, col: GraphNode, litCol: GraphNode, band = PRESENT_BAND) {
  const p = g.uniform('present', 0)
  const front = g.multiplyColor(1, col, g.rgb(1.1, 1.08, 1.03))
  return g.blend(p, litCol, g.multiplyColor(1, front, facing(g, PRESENT_LIGHT, band[0], band[1])))
}

/**
 * The default band, narrow on purpose: it is what makes the folder's CREASE read, since an open folder is
 * two nearly parallel planes and over the full dot range their difference is about one percent.
 */
const PRESENT_BAND: [[number, number], [number, number]] = [[0.55, 1], [0.8, 1.14]]
/**
 * Paper gets a much gentler one. The same narrow band that separates two flat leaves by a useful amount
 * turns a CURVED sheet into a gradient: measured on the render, the middle of the resume came out at 190
 * against 235 at its edges, which reads as the print and the paper being two different materials rather
 * than as one page catching the light, and reads as too dark besides.
 */
const PAPER_BAND: [[number, number], [number, number]] = [[0.1, 1], [0.94, 1.05]]

/** where the light comes from while something is held up: over the viewer's left shoulder */
const PRESENT_LIGHT: [number, number, number] = [-0.61, 0.41, 0.68]

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
  const base = g.blend(spot, body, g.rgb(...chipTrim(ink)))
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
  const base = g.blend(ring, body, g.rgb(...chipTrim(ink)))
  return trackLit(compileMaterial(register(`chipFaceWC:${ink}`, lit(g, watercolorMaterialGraph(g, { base, scale: 2.5, wobble: 0.04, bands: 3, edge: 0.6 }), lamp(g)))))
}

/**
 * A plain coloured body in the casino's own watercolour, with no chip markings.
 *
 * The dice first wore chipFaceWatercolorMaterial, which draws the chip's paper
 * RING, so every face of every die came out with a big white circle stamped on
 * it. A die is not a chip with pips on top: its body is flat colour and the pips
 * are the only marking, so it needs a material that says exactly that.
 */
export function solidWatercolorMaterial(ink: ChipInk, key = 'solid') {
  const g = graph()
  const base = g.rgb(...CHIP_INK[ink])
  return trackLit(
    compileMaterial(
      register(
        `${key}WC:${ink}`,
        lit(g, watercolorMaterialGraph(g, { base, scale: 2.5, wobble: 0.04, bands: 3, edge: 0.6 }), lamp(g)),
      ),
    ),
  )
}

/**
 * A die: one material for the whole thing, body and pips.
 *
 * The pips are RECESSED INTO the body, so they are part of the same mesh rather
 * than spheres sitting on it, and there is no second surface to give a second
 * material to. Which vertices are pip comes in on the mesh's own COLOUR
 * attribute, written when the dents are cut: 1 for the body, 0 inside a pip.
 *
 * Same treatment as everything else on the felt (watercolour over the lamp), so
 * a die next to a chip is made of the same stuff.
 */
export function diceMaterial(body: ChipInk, pip: ChipInk) {
  const g = graph()
  const mask = g.separate(g.vertexColor(), 'x')
  const base = g.blend(mask, g.rgb(...CHIP_INK[pip]), g.rgb(...CHIP_INK[body]))
  return trackLit(
    compileMaterial(
      register(
        `dice:${body}/${pip}`,
        lit(g, watercolorMaterialGraph(g, { base, scale: 2.5, wobble: 0.04, bands: 3, edge: 0.6 }), lamp(g)),
      ),
    ),
  )
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
 * The sheet stock: ONE value for the paper's faces, its cut edges, the sheets underneath it and the paper
 * the resume is printed on. Both sides of that split read it, so the printed face and the solid it rides on
 * can never drift apart. White, so the brightest part of a sheet is the paper itself and the baked curl
 * shade only ever takes light away from it.
 */
export const PAPER_STOCK: [number, number, number] = [1, 1, 1]
export const PAPER_STOCK_HEX = '#ffffff'

/**
 * the sheet inside the folder: paper white with the resume image WRITTEN onto it under a wobbly brush wipe
 * (uniform 'reveal' 0..1, driven by the folder's open amount). Blender: Image Texture, Noise, Math, Mix.
 */
/**
 * Paper, lit like everything else in the room. The stock and the printed face BOTH go through this, so a
 * point on the print and the paper directly under it can never be different colours: same fibre, same baked
 * curl shade, same lamp, same presented front light.
 *
 * PAPER_GAIN sets the paper's level and its warmth, and both were solved on the render rather than picked.
 * The paint pass has a compressive shoulder: dropping the gain from 1.005 to 0.778 only moved the paper's
 * 99th percentile from about 255 to 228, so there is no gain that is both as bright as paper should be and
 * free of clipping in red and green. This sits at the bright end, where the sheet reads as lit paper, and
 * spends the headroom on warmth instead: cast +30 against manila at +67, so a white sheet does not read
 * grey beside it.
 */
const PAPER_GAIN: [number, number, number] = [0.9, 0.875, 0.835]
/**
 * What the PRINT's paper has to be multiplied by to become the paper it is printed on.
 *
 * The two are the same stock and the same graph, but one is drawn THROUGH the painterly pass and the other
 * deliberately is not, and the pass does not leave a white alone. Scanned across the page's edge with the
 * paper held out of clipping, the painted margin reads 247/241/231 and the print's own paper 246/235/214:
 * the same red, six less green, seventeen less blue, so the print is markedly the warmer of the two and a
 * sheet carries two different whites, its own margin against its own face. These are those two readings
 * divided, nothing else. It has to be measured out of clipping to mean anything: at the old gain both were
 * pinned at 255 in red and green and the whole difference hid in one channel.
 */
const PRINT_MATCH: [number, number, number] = [1.004, 1.026, 1.079]
function paperLit(g: Graph, base: GraphNode): GraphNode {
  // keyed off object position, so the grain runs continuously from the printed face around the cut edge
  const f = g.mapRange(g.noise(g.position('object'), { scale: 55, detail: 2 }), { from: [0, 1], to: [0.955, 1.03], clamp: true })
  const gained = g.multiplyColor(1, base, g.rgb(...PAPER_GAIN))
  const fibred = g.multiplyColor(1, gained, g.combine(f, f, f))
  // the sheet is a BENT solid (see paperSheet) drawn without the paint pass, so the shade baked into its
  // colour attribute is what tells the eye it is curved. Absent on a flat mesh the node reads white.
  const col = g.multiplyColor(1, fibred, g.vertexColor())
  return litOrPresented(g, col, lit(g, col, lamp(g, undefined, { twoSided: true })), PAPER_BAND)
}

export function sheetMaterial(map: Texture, opts: { flipU?: boolean; flipV?: boolean; rotate?: boolean; printed?: boolean; border?: number; fit?: number; painted?: boolean } = {}) {
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
  // The print and the sheet it is printed on must be INDISTINGUISHABLE, or the resume reads as a decal laid
  // on a card rather than as one piece of paper. Three things do it: both take their paper colour from the
  // one PAPER_STOCK constant, so they cannot drift; the scan's own paper is lifted the measured 0.2 percent
  // that separates it from white (sampled off the file at 254.5/255, neutral); and both carry the same
  // fibre the folder body has, keyed off object position, so the grain runs continuously from the printed
  // face around the cut edge. The ink is untouched, since multiplying black by anything is still black.
  // `painted` means this print goes THROUGH the painterly pass with the paper it is on. Both corrections
  // below exist only to fake what the pass does for a print drawn outside it, so when the pass is really
  // doing it they have to come off, or the sheet is compensated twice.
  const match: [number, number, number] = opts.painted ? [1, 1, 1] : PRINT_MATCH
  const stock = g.multiplyColor(1, g.multiplyColor(1, g.rgb(...PAPER_STOCK), g.rgb(1.0021, 1.0021, 1.0021)), g.rgb(...match))
  // The print cannot go THROUGH the painterly pass (it turns 8pt type to mush), but it can carry the
  // pass's own surface. Measured on the render, the painted stock runs sd 4.1 with a neighbour delta of
  // 1.11 against the print's 1.75 and 0.53: the paper around the print is broken up about two and a half
  // times as much, and that difference in TEXTURE is what still read as two materials once their colours
  // matched. This is a second, much finer grain than the fibre, at the spatial scale the pass works at,
  // and it goes on the printed path only, since the stock already gets the real thing.
  // two octaves, because the pass works at two scales: a fine tooth for the paper's own grain and a much
  // broader wash for the brush. Matching only the fine one left the print smooth in the large (sd 2.36
  // against the stock's 4.64) even once its per-pixel grain was right.
  const tooth = g.mapRange(g.noise(g.position('object'), { scale: 210, detail: 3 }), { from: [0, 1], to: [0.968, 1.032], clamp: true })
  const wash = g.mapRange(g.noise(g.position('object'), { scale: 24, detail: 2 }), { from: [0, 1], to: [0.972, 1.028], clamp: true })
  const grain = g.multiply(tooth, wash)
  const inked = opts.printed
    ? opts.painted
      ? g.multiplyColor(1, img, stock)
      : g.multiplyColor(1, g.multiplyColor(1, img, stock), g.combine(grain, grain, grain))
    : null
  const base = inked ?? g.blend(mask, paper, img)
  const m = trackPresent(trackLit(compileMaterial(register('sheet', paperLit(g, base)))))
  // the modelled page is a single plane: it must show whichever way its normal points
  m.side = DoubleSide
  m.polygonOffset = true
  m.polygonOffsetFactor = -2
  m.polygonOffsetUnits = -2
  return m
}

/**
 * The paper's own stock as a graph material, for the sheet's faces, its cut edges and the sheets under it.
 *
 * It used to be a plain MeshBasicMaterial, which is UNLIT, and the printed side was unlit too. Measured on
 * the render, that left the resume the one dead-neutral surface in the room: every other white in the shot
 * picks up the light's warmth (the manila reads +68 red over blue, a white playing card +7) and the paper
 * read exactly 0, flat, at a brightness owing nothing to the lamp or to the fold it was lying in. That is
 * what kept it looking laid ON the scene rather than in it, whatever the geometry did.
 */
export function stockMaterial() {
  const g = graph()
  const m = trackPresent(trackLit(compileMaterial(register('paperStock', paperLit(g, g.rgb(...PAPER_STOCK))))))
  m.side = DoubleSide
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

/**
 * The Eye of Providence, as LINE ART.
 *
 * Nothing here is filled. The whole glyph is strokes: the two lids, the iris and
 * pupil as rings, the triangle round them and the rays outside that. The card's
 * OPACITY is the strokes themselves, so there is no ground, no vignette and no
 * rectangle to hide, and a field of them composites over each other and over
 * anything behind with no edges to give it away.
 *
 * That is also why it needed rebuilding rather than recolouring: the filled
 * version painted regions back to front over a lifted ground, and every one of
 * those decisions is the opposite of what line art wants.
 *
 * Uniforms, driven per frame from eye.ts so the maths that decides where the
 * iris may go lives somewhere a check can reach it:
 *   eyeOpen             0 shut, 1 open
 *   eyeIrisX, eyeIrisY  where the iris sits, already clamped onto its oval
 */
export function eyeMaterial(key = 'eye', ink: EyeInk = 'gold', flat = false) {
  const g = graph()
  const uv = g.uv()
  // eye space: x from -1 at one corner to +1 at the other, y in the same units
  const x = g.multiply(g.subtract(g.separate(uv, 'x'), 0.5), EYE_PLANE.w)
  const y = g.multiply(g.subtract(g.separate(uv, 'y'), 0.5), EYE_PLANE.h)

  const open = g.uniform('eyeOpen', 0)
  const irisX = g.uniform('eyeIrisX', 0)
  const irisY = g.uniform('eyeIrisY', EYE.irisY)
  /**
   * Weight and paper as UNIFORMS rather than constants.
   *
   * A field is fourteen materials, and a stroke width baked into the graph means
   * every nudge of a slider rebuilds all fourteen. As uniforms the panel drives
   * them for free, which is the difference between a knob you can drag and one
   * you can only set.
   */
  const weight = g.uniform('eyeWeight', 1)
  const paper = g.uniform('eyePaper', 1)

  /**
   * The paper moves under the pen.
   *
   * Two noise fields, one per axis, added to the COORDINATES before any shape
   * maths runs. Every stroke on the glyph then wanders together, the way a
   * drawing on a sheet does, instead of each line wobbling on its own and
   * pulling apart from its neighbours where they are meant to meet.
   *
   * Rebuilding this as line art is where the material's own watercolour got
   * lost: the filled version ran its colour through watercolorMaterialGraph and
   * the line version went straight to a flat ink, so only the compositor was
   * touching it. This puts the paper back, on the geometry as well as the ink.
   */
  /**
   * ONE noise field, one octave, read twice.
   *
   * This was two fields at detail 3, which is eight octaves of 3D noise per
   * FRAGMENT, on a card that is mostly empty and drawn fourteen times over. It
   * measured as the single most expensive thing on the page: p99 frame time went
   * from 27 ms to 79 ms with the field on, and the chip's impact landed on top
   * of that.
   *
   * The second axis is the same field read at an offset instead. Two independent
   * fields would be tidier and the difference is invisible: the offset is large
   * enough that x and y wander independently, which is all the wobble needs.
   */
  const paperNoise = g.noise(g.combine(g.multiply(x, 2.1), g.multiply(y, 2.1), 0), { scale: 2.6, detail: 1 })
  const paperNoise2 = g.noise(g.combine(g.add(g.multiply(x, 2.1), 19.3), g.multiply(y, 2.1), 7.7), { scale: 2.6, detail: 1 })
  const nx = g.subtract(paperNoise, 0.5)
  const ny = g.subtract(paperNoise2, 0.5)
  const wx = g.add(x, g.multiply(g.multiply(nx, paper), GLYPH.wobble * 2))
  const wy = g.add(y, g.multiply(g.multiply(ny, paper), GLYPH.wobble * 2))

  // the eye is drawn in ITS space, which is a fraction of the glyph's
  const K = GLYPH.eyeScale
  const ex = g.divide(wx, K)
  const ey = g.divide(wy, K)

  const F = 0.006
  /** a stroke centred on where a distance is zero, `w` wide */
  const stroke = (d: GraphNode, w: number) => {
    const half = g.multiply(weight, w / 2)
    return g.subtract(1, smoothStep(g, g.abs(d), g.subtract(half, F), g.add(half, F)))
  }
  /** inside a half plane, softened */
  const under = (d: GraphNode) => smoothStep(g, d, 0, F)

  /** (1 - t^2) clamped: the arc every lid is built from, zero at the corners */
  const arcOf = (t: GraphNode | number) => g.max(0, g.subtract(1, g.multiply(t, t)))
  const a = arcOf(ex)
  // the upper lid's apex is shifted by skewing the COORDINATE, which leaves the
  // corners where they are because the shift is proportional to the arc
  const aU = arcOf(g.add(ex, g.multiply(EYE.upperSkew, a)))

  const base = g.multiply(-EYE.closedSag, g.math('POWER', a, EYE.closedPower))
  const up = g.add(base, g.multiply(g.multiply(open, upperReach), g.math('POWER', aU, EYE.upperPower)))
  const dn = g.subtract(base, g.multiply(g.multiply(open, lowerReach), g.math('POWER', a, EYE.lowerPower)))

  // the lids, clipped to between the corners. The upper is the heavy one.
  const within = under(g.subtract(1, g.abs(ex)))
  let lines: GraphNode = g.multiply(stroke(g.subtract(ey, up), EYE.upperLine), within)
  lines = g.max(lines, g.multiply(stroke(g.subtract(ey, dn), GLYPH.line * 0.8), within))

  // the iris and the pupil as RINGS, and both cropped by the lids the way the
  // filled version cropped the disc
  const dx = g.subtract(ex, irisX)
  const dy = g.subtract(ey, irisY)
  const r = g.sqrt(g.add(g.multiply(dx, dx), g.multiply(dy, dy)))
  const inAperture = g.multiply(g.multiply(under(g.subtract(up, ey)), under(g.subtract(ey, dn))), within)
  lines = g.max(lines, g.multiply(stroke(g.subtract(r, EYE.irisR), GLYPH.line), inAperture))
  lines = g.max(lines, g.multiply(stroke(g.subtract(r, EYE.pupilR), GLYPH.line), inAperture))

  /**
   * The rays, as straight strokes at fixed angles.
   *
   * Written out one by one because there is no arctangent in the node set to
   * fold them into an angular repeat with. Twelve is cheap enough and it keeps
   * every ray's start, length and width explicit. rayAt puts each one on the
   * ellipse round the eye, so they all begin the same distance clear of it.
   */
  for (let i = 0; i < GLYPH.rays; i++) {
    const R = rayAt(i)
    const along = g.add(g.multiply(wx, R.c), g.multiply(wy, R.s))
    const across = g.subtract(g.multiply(wx, -R.s), g.multiply(wy, -R.c))
    const seg = g.multiply(under(g.subtract(along, R.from)), under(g.subtract(R.to, along)))
    lines = g.max(lines, g.multiply(stroke(across, GLYPH.rayWidth), seg))
  }

  // one ink for the whole glyph, run through the page's own watercolour so the
  // stroke is pigment on paper rather than a flat fill: it bands, it mottles,
  // and it darkens where the wash pools
  const col = watercolorMaterialGraph(g, {
    base: g.rgb(...CHIP_INK[ink]),
    scale: 4.2,
    wobble: 0.06,
    bands: 3,
    edge: 0.5,
  })

  /**
   * `flat` skips the lamp.
   *
   * The table's light is a SPOT over the felt, so anything wearing it goes dark
   * the moment it leaves that pool. That is right for a chip and wrong for an
   * overlay: hung in front of a camera that swings away across the room, the
   * eyes came out as barely visible scratches. An overlay is not in the room.
   */
  const m = compileMaterial(register(`${key}:${ink}${flat ? ':flat' : ''}`, flat ? col : lit(g, col, lamp(g, [0, 1, 0]))), {
    // the strokes ARE the card: no ground, so nothing to hide and nothing to
    // paint over a neighbour
    opacity: g.multiply(lines, g.add(0.06, g.multiply(0.94, open))),
  })
  m.depthWrite = false
  // a flat one takes no lamp, so it must not be handed to driveLamp either
  return flat ? m : trackLit(m)
}
