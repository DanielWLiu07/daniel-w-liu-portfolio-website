'use client'

/**
 * The poker table as pomme draws its floor: ONE flat disc, no model. A material
 * graph paints it by distance to a D-shaped outline (a semicircle toward the
 * camera, the straight dealer edge at the back): felt with a wobbly cream betting
 * line, a dark rail, a dry-brushed holey outer edge that breaks into blobs of
 * paint like pomme's meadow fade, and the same reveal field as pomme's uGrow
 * sweep paints it in from the chip's landing point. Unpainted table is not there: fully
 * transparent, so only paper shows until the paint reaches it.
 *
 * Blender nodes only: Geometry position, Noise Texture, Math, Map Range, Mix,
 * Layer Weight (via feltMaterialGraph). Inspect in the console with b2t.view('table') / b2t.view('tableAlpha').
 */
import { useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject, type Ref } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  CASINO_PALETTE,
  compileMaterial,
  feltMaterialGraph,
  graph,
  growFromImpact,
  materialUniforms,
  revealMask,
  smoothStep,
  type Graph,
  type GraphNode,
  type NodeInput,
} from 'blender-to-threejs'
import type { ImpactFx } from './hero-chip'
import type { TableFit } from './round-table'
import { lamp, railMaterial, register, trackLit } from './materials'
import { getTune, REVEAL_TIME_SCALE } from './tune'

const PAPER = CASINO_PALETTE.paper

export interface FlatTableSpec {
  /** felt radius (world) */
  feltR: number
  /** rail width beyond the felt */
  rail: number
  /** betting line radius as a fraction of feltR */
  line: number
  /** the straight dealer edge sits this far behind the arc's centre (world z, negative is away from the camera) */
  chordZ: number
}

/** the same spec with graph inputs (uniforms) so size changes never recompile */
export interface FlatTableGraphSpec {
  feltR: NodeInput
  rail: NodeInput
  line: number
  chordZ: NodeInput
}

/** graph uniforms for the live-tunable dimensions; update .value per frame, no recompile */
export function tableUniforms(g: Graph, init: { feltR: number; rail: number; chordZ: number; reach: number }) {
  return {
    feltR: g.uniform('feltR', init.feltR),
    rail: g.uniform('rail', init.rail),
    chordZ: g.uniform('chordZ', init.chordZ),
    reach: g.uniform('reach', init.reach),
  }
}

/** The table's colour graph by world radius; exported so the viewer can show it. */
export function tableGraph(g: Graph, spec: FlatTableGraphSpec, reveal?: { centre: [number, number]; reach: NodeInput }): { color: GraphNode; alpha: GraphNode; shape: GraphNode } {
  // the disc's OWN space (CircleGeometry in xy, laid flat by rotation.x = -90 deg, so object y is world -z):
  // moving or scaling the mesh carries the paint with it, which is what a transform gizmo expects.
  // Only the reveal below stays in world space (the impact point is a world event).
  const p = g.position('object')
  const px = g.separate(p, 'x')
  const pz = g.multiply(g.separate(p, 'y'), -1)
  const rc = g.math('SQRT', g.add(g.multiply(px, px), g.multiply(pz, pz)))
  const xz = g.combine(px, 0, pz)
  // D-shape: signed distance to the outline (arc of radius feltR, chord at z = chordZ), expressed as
  // an equivalent radius so every band below reads "how far out from the felt centre am I"
  const r = g.add(g.math('MAXIMUM', g.subtract(rc, spec.feltR), g.subtract(spec.chordZ, pz)), spec.feltR)
  // radii wobble like a brush-drawn outline (slight: a padded rail is a clean curve)
  const wob = g.multiply(g.subtract(g.noise(xz, { scale: 0.9, detail: 1 }), 0.5), 0.05)
  const rw = g.add(r, wob)

  const felt = feltMaterialGraph(g, g.rgb(0.07, 0.3, 0.17), { fibreDetail: 1, mottleDetail: 1 })
  // betting line: a thin cream ring, broken here and there by the paper texture
  const lineR = g.multiply(spec.feltR, spec.line)
  const lineBand = g.multiply(
    smoothStep(g, rw, g.subtract(lineR, 0.05), g.subtract(lineR, 0.015)),
    g.subtract(1, smoothStep(g, rw, g.add(lineR, 0.015), g.add(lineR, 0.05))),
  )
  const lineBreak = smoothStep(g, g.noise(xz, { scale: 6, detail: 1 }), 0.32, 0.5)
  const line = g.multiply(lineBand, lineBreak)
  const cream = g.multiplyColor(1, g.rgb(...PAPER), g.rgb(0.98, 0.95, 0.85))
  let col: GraphNode = g.blend(g.multiply(line, 0.85), felt, cream)

  // rail: padded oxblood leather with a soft grain, a rounded highlight along its crown (a bump the lamp
  // catches) and a cream piping seam right at the felt edge
  const grainF = g.mapRange(g.noise(xz, { scale: 3, detail: 1, roughness: 0.6 }), { from: [0, 1], to: [0.9, 1.1], clamp: true })
  const leather = g.multiplyColor(1, g.rgb(0.34, 0.14, 0.11), g.combine(grainF, grainF, grainF))
  // crown: brightest at the middle of the rail width, darker at both edges (padding roll)
  const railT = g.divide(g.subtract(rw, spec.feltR), spec.rail) // 0 at felt edge .. 1 at outer edge
  const crown = g.subtract(1, g.math('ABSOLUTE', g.subtract(g.multiply(railT, 2), 1)))
  const shade = g.add(0.75, g.multiply(0.5, g.math('POWER', crown, 1.5)))
  const railShaded = g.multiplyColor(1, leather, g.combine(shade, shade, shade))
  const onRail = smoothStep(g, rw, g.subtract(spec.feltR, 0.02), g.add(spec.feltR, 0.03))
  col = g.blend(onRail, col, railShaded)
  // piping seam
  const seam = g.multiply(smoothStep(g, rw, g.subtract(spec.feltR, 0.06), g.subtract(spec.feltR, 0.02)), g.subtract(1, smoothStep(g, rw, g.add(spec.feltR, 0.02), g.add(spec.feltR, 0.07))))
  col = g.blend(g.multiply(seam, 0.7), col, g.multiplyColor(1, g.rgb(...PAPER), g.rgb(0.95, 0.9, 0.78)))

  // dry-brushed outer edge: the fade past the rail is eaten by two octaves of noise so it breaks
  // into surviving blobs of paint with pinholes of bare paper (pomme's fadeR / holes)
  const outer = g.add(spec.feltR, spec.rail)
  const fadeR = g.subtract(1, smoothStep(g, r, g.subtract(outer, 0.15), g.add(outer, 0.55)))
  const shape = fadeR
  const holes = g.multiply(g.add(g.multiply(g.noise(g.mapping(xz, { type: 'POINT', location: [4.7, 0, 4.7] }), { scale: 1.3, detail: 0 }), 0.6), g.multiply(g.noise(g.mapping(xz, { type: 'POINT', location: [9.2, 0, 9.2] }), { scale: 3.4, detail: 0 }), 0.4)), 0.85)
  let alpha: GraphNode = smoothStep(g, fadeR, g.subtract(holes, 0.2), g.add(holes, 0.2))

  // the one lamp over the table (flat up normal: the disc lies in the felt plane)
  col = g.multiplyColor(1, col, (() => { const L = lamp(g, [0, 1, 0]); return g.combine(L, L, L) })())
  if (reveal) {
    const rv = revealMask(g, { centre: reveal.centre, reach: reveal.reach, noiseAmount: g.uniform('revealNoise', 1), radialAmount: g.uniform('revealRadial', 1), softness: g.uniform('revealSoft', 0.13) })
    // soaked darker rim right at each blotch's wet edge
    col = g.multiplyColor(1, col, g.combine(g.subtract(1, g.multiply(rv.rim, 0.35)), g.subtract(1, g.multiply(rv.rim, 0.35)), g.subtract(1, g.multiply(rv.rim, 0.35))))
    alpha = g.multiply(alpha, rv.mask)
  }
  return { color: col, alpha, shape }
}

/** the D outline as a closed 3D path in the felt plane: arc of radius r toward +z, chord at z = chordZ */
class DPath extends THREE.Curve<THREE.Vector3> {
  constructor(
    private r: number,
    private chordZ: number,
  ) {
    super()
  }
  getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const cz = Math.max(-this.r * 0.999, Math.min(this.r * 0.999, this.chordZ))
    const hx = Math.sqrt(Math.max(0, this.r * this.r - cz * cz))
    // arc from the right chord end (hx, cz) over +z to the left chord end (-hx, cz), then the chord back
    const a0 = Math.atan2(cz, hx)
    const span = Math.PI - 2 * a0
    const arcLen = this.r * span
    const chordLen = 2 * hx
    const s = t * (arcLen + chordLen)
    if (s < arcLen) {
      const ang = a0 + (s / arcLen) * span
      target.set(this.r * Math.cos(ang), 0, this.r * Math.sin(ang))
    } else {
      const u = (s - arcLen) / chordLen
      target.set(-hx + u * 2 * hx, 0, cz)
    }
    return target
  }
}

/** the padded rail as geometry: a tube swept along the D outline, radius = rail width / 2 */
export function RailTube({
  feltR,
  rail,
  chordZ,
  y,
  reveal,
  fx,
}: {
  feltR: number
  rail: number
  chordZ: number
  y: number
  reveal?: { centre: [number, number]; reach: number }
  fx?: MutableRefObject<ImpactFx>
}) {
  const cx = reveal?.centre[0]
  const cz = reveal?.centre[1]
  const mat = useMemo(() => railMaterial(cx !== undefined && cz !== undefined ? { centre: [cx, cz], reach: reveal?.reach ?? 8.5 } : undefined), [cx, cz, reveal?.reach])
  // padded roll: about a third of the apron width, capped so it never becomes a wall
  const tube = rail * 0.5
  const geo = useMemo(() => {
    const path = new DPath(feltR + tube, chordZ)
    return new THREE.TubeGeometry(path, 160, tube, 14, true)
  }, [feltR, tube, chordZ])
  useEffect(() => () => geo.dispose(), [geo])
  const matRef = useRef(mat)
  useLayoutEffect(() => {
    matRef.current = mat
  }, [mat])
  useFrame(() => {
    const u = materialUniforms(matRef.current)
    if (u.grow) u.grow.value = reveal && fx ? growFromImpact(fx.current.impactAge * REVEAL_TIME_SCALE) : 1
    if (u.revealNoise) { const t = getTune(); u.revealNoise.value = t.revealNoise; if (u.revealRadial) u.revealRadial.value = t.revealRadial; if (u.revealSoft) u.revealSoft.value = t.revealSoft }
  })
  // sunk to a low bumper: the crown stands about half a roll above the felt
  return <mesh geometry={geo} material={mat} position={[0, y - tube * 0.45, 0]} castShadow />
}

export default function FlatTable({
  feltR = 3.0,
  rail = 0.55,
  line = 0.86,
  chordZ = -1.2,
  onFit,
  meshRef,
  reveal,
  fx,
}: Partial<FlatTableSpec> & {
  onFit?: (fit: TableFit) => void
  reveal?: { centre: [number, number]; reach: number }
  fx?: MutableRefObject<ImpactFx>
  /** the disc mesh, for the set editor */
  meshRef?: Ref<THREE.Mesh>
}) {
  const cx = reveal?.centre[0]
  const cz = reveal?.centre[1]
  // compiled ONCE: every live dimension is a uniform, so sliders and the gizmo never recompile
  const material = useMemo(() => {
    const g = graph()
    const u = tableUniforms(g, { feltR, rail, chordZ, reach: reveal?.reach ?? 8.5 })
    const { color, alpha } = tableGraph(
      g,
      { feltR: u.feltR, rail: u.rail, line, chordZ: u.chordZ },
      cx !== undefined && cz !== undefined ? { centre: [cx, cz], reach: u.reach } : undefined,
    )
    register('table', color)
    register('tableAlpha', alpha)
    const m = trackLit(compileMaterial(color, { opacity: alpha }))
    m.side = THREE.DoubleSide
    return m
    // dimensions are uniforms updated in useFrame; only the constant parts are deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line, cx, cz])
  const matRef = useRef(material)
  useLayoutEffect(() => {
    matRef.current = material
  }, [material])
  useFrame(() => {
    const u = materialUniforms(matRef.current)
    if (u.feltR) u.feltR.value = feltR
    if (u.rail) u.rail.value = rail
    if (u.chordZ) u.chordZ.value = chordZ
    if (u.reach && reveal) u.reach.value = reveal.reach
    if (u.grow) u.grow.value = reveal && fx ? growFromImpact(fx.current.impactAge * REVEAL_TIME_SCALE) : 1
    if (u.revealNoise) { const t = getTune(); u.revealNoise.value = t.revealNoise; if (u.revealRadial) u.revealRadial.value = t.revealRadial; if (u.revealSoft) u.revealSoft.value = t.revealSoft }
  })
  useLayoutEffect(() => {
    onFit?.({ feltY: 0, feltR })
  }, [feltR, onFit])
  // one big disc; the alpha graph cuts the table out of it, so resizing needs no new geometry
  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} material={material}>
      <circleGeometry args={[40, 128]} />
    </mesh>
  )
}
