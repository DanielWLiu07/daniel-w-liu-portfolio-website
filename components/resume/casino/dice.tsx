'use client'

/**
 * A pair of dice, generated rather than modelled.
 *
 * No mesh ships with this: the body is a rounded box and the pips are spheres
 * placed from the standard layout, so a die is a function of its size, its
 * corner radius and its pip depth. That means the pair can be re-proportioned
 * from the page without going back to Blender, and it means the two dice can
 * differ (a matched pair is a size and a colour, not two files).
 *
 * Correctness, since dice have a right answer:
 *   OPPOSITE FACES SUM TO SEVEN. 1-6, 2-5, 3-4, on every real die.
 *   The pips are LAID OUT, not drawn: each face has its own basis, and the
 *   layout is given in that face's 2D coordinates, so the arrangement is right
 *   from every angle rather than right from one.
 *   Western dice are RIGHT HANDED: with 1 up and 2 facing you, 3 is on the
 *   right. Casino dice are the same. The face assignment below is checked
 *   against that, because a left-handed die is a real mistake that nobody
 *   notices until someone who plays looks at it.
 */
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { diceMaterial, type ChipInk } from './materials'

export interface DiceOptions {
  /** edge length of the cube */
  size?: number
  /** corner rounding, as a fraction of the size */
  round?: number
  /** pip radius, as a fraction of the size */
  pip?: number
  /**
   * How deep a pip is CUT INTO the face, as a fraction of its own radius.
   *
   * The pips are holes, not studs. An earlier version placed spheres on the
   * surface, which gives domes standing proud of the face: that is a bead, and a
   * die has the opposite. 0.5 is a shallow bowl, which is what a moulded die
   * carries.
   */
  sink?: number
  /**
   * Subdivisions per side of the cube. The dents are cut by displacing vertices,
   * so this decides whether a pip has a clean round rim or a polygonal one:
   * below about 24 the holes come out visibly faceted.
   */
  segments?: number
}

export const DEFAULTS: Required<DiceOptions> = { size: 0.42, round: 0.1, pip: 0.09, sink: 0.5, segments: 40 }

/**
 * The six faces, as an outward normal and the two in-plane axes the layout is
 * given in.
 *
 * Right handed and summing to seven: +Y is 1 and -Y is 6, +Z is 2 and -Z is 5,
 * +X is 3 and -X is 4. Stand the die with 1 up and 2 toward the camera (-Z is
 * away, so 2 is on +Z, facing you) and 3 is on +X, the right. That is a western
 * die.
 */
const FACES: { value: number; normal: [number, number, number]; u: [number, number, number]; v: [number, number, number] }[] = [
  { value: 1, normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { value: 6, normal: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { value: 2, normal: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { value: 5, normal: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
  { value: 3, normal: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { value: 4, normal: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
]

/**
 * Pip positions in a face's own 2D coordinates, at +/- `s` from centre.
 *
 * The three and the two run along the SAME diagonal, and the six runs in two
 * columns of three rather than two rows: both are conventions a real die keeps
 * and a generated one gets wrong by default.
 */
function layout(value: number, s: number): [number, number][] {
  switch (value) {
    case 1:
      return [[0, 0]]
    case 2:
      return [[-s, s], [s, -s]]
    case 3:
      return [[-s, s], [0, 0], [s, -s]]
    case 4:
      return [[-s, -s], [-s, s], [s, -s], [s, s]]
    case 5:
      return [[-s, -s], [-s, s], [0, 0], [s, -s], [s, s]]
    case 6:
      return [[-s, -s], [-s, 0], [-s, s], [s, -s], [s, 0], [s, s]]
    default:
      return []
  }
}

export interface Pip {
  position: [number, number, number]
  /** the face's outward normal, so a caller can orient a decal if it wants one */
  normal: [number, number, number]
  value: number
}

/**
 * Every pip on a die, in world-local coordinates.
 *
 * Exported so it can be counted and checked: the 21 pips of a die and the
 * seven-sum rule are both things a test can assert, and a die with a wrong face
 * is not something you notice by looking at a render.
 */
/**
 * The pip radius and spacing a die of these proportions can actually carry.
 *
 * Both are DERIVED, because both are over-constrained and picking either by eye
 * gets one of them wrong. The check found two in a row this way: a hand-picked
 * spacing put the six's columns 5 percent closer than a pip diameter, and the
 * fix for that pushed the CORNER pips off the face, because a corner sits at
 * s * sqrt(2) from the centre and only the axis distance had been considered.
 *
 *   corners fit:   s * sqrt(2) + r <= flat
 *   the six's columns keep a gap:   s >= 2.15 * r
 *
 * Those two bound the radius as well: substituting gives r <= flat / (2.15 *
 * sqrt(2) + 1). The requested pip size is treated as an upper bound and clamped
 * to that, so a die is always well formed whatever proportions it is asked for.
 */
export function diceMetrics(o: Required<DiceOptions>): { radius: number; spacing: number; flat: number } {
  const half = o.size / 2
  const flat = half - o.size * o.round
  const COLUMN_GAP = 2.15
  const rMax = flat / (COLUMN_GAP * Math.SQRT2 + 1)
  const radius = Math.min(o.size * o.pip, rMax)
  const sMin = COLUMN_GAP * radius
  const sMax = (flat - radius) / Math.SQRT2
  return { radius, spacing: sMin + (sMax - sMin) * 0.5, flat }
}

/**
 * Every pip on a die, in the die's own coordinates.
 *
 * Exported so it can be counted and checked: 21 pips, opposite faces summing to
 * seven, and a right-handed arrangement are all things a script can assert, and
 * a die with a wrong face is not something anyone notices in a render.
 */
export function pips(o: Required<DiceOptions>): Pip[] {
  const half = o.size / 2
  const { radius: r, spacing: s } = diceMetrics(o)
  const out: Pip[] = []
  for (const f of FACES) {
    // ON the face: the hollow is cut from here inward, so this is the rim's
    // plane rather than a sphere's centre
    const d = half
    for (const [a, b] of layout(f.value, s)) {
      out.push({
        position: [
          f.normal[0] * d + f.u[0] * a + f.v[0] * b,
          f.normal[1] * d + f.u[1] * a + f.v[1] * b,
          f.normal[2] * d + f.u[2] * a + f.v[2] * b,
        ],
        normal: f.normal,
        value: f.value,
      })
    }
  }
  return out
}

/** the rotation that puts `value` face up, for a die that should read as a result */
export function faceUp(value: number): [number, number, number] {
  switch (value) {
    case 1:
      return [0, 0, 0]
    case 6:
      return [Math.PI, 0, 0]
    case 2:
      return [-Math.PI / 2, 0, 0]
    case 5:
      return [Math.PI / 2, 0, 0]
    // 3 is on +X, and a POSITIVE turn about Z carries +X to +Y. These two were
    // the wrong way round and the face rig caught it: asking for a 3 showed a 4.
    case 3:
      return [0, 0, Math.PI / 2]
    case 4:
      return [0, 0, -Math.PI / 2]
    default:
      return [0, 0, 0]
  }
}

/**
 * A rounded cube whose FLAT FACES are tessellated.
 *
 * three's RoundedBoxGeometry is the obvious choice and is useless here: it
 * spends its whole vertex budget on the rounding and leaves the flats almost
 * bare. Measured, at 16 segments it puts 72 of its 39,204 vertices on the six
 * flat faces, so there is nothing in the middle of a face to displace and the
 * pips came out as no dents at all on a mesh of a third of a million vertices.
 *
 * This is the standard construction instead: subdivide a box, then for each
 * vertex clamp it into the inner box and push it back out by the radius. A
 * vertex already on a flat is its own clamp plus the radius along that axis, so
 * the flats stay exactly where they were and keep every subdivision.
 */
function roundedBox(size: number, radius: number, segments: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(size, size, size, segments, segments, segments)
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const inner = size / 2 - radius
  const v = new THREE.Vector3()
  const c = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    c.set(
      Math.min(inner, Math.max(-inner, v.x)),
      Math.min(inner, Math.max(-inner, v.y)),
      Math.min(inner, Math.max(-inner, v.z)),
    )
    v.sub(c)
    const len = v.length()
    if (len > 1e-9) v.multiplyScalar(radius / len)
    v.add(c)
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  pos.needsUpdate = true
  return g
}

/**
 * The die body, with the pips CUT INTO it.
 *
 * A rounded box, then every vertex that falls inside a pip is pushed inward
 * along that face's normal by a spherical-cap profile, so the pip is a hollow in
 * the surface. The alternative, a sphere placed at each pip, gives a stud
 * standing proud of the face, which is the opposite of a die.
 *
 * Each vertex also gets a COLOUR: 1 on the body, 0 inside a pip, with the rim
 * feathered over one cell so the edge is not a staircase. The material blends
 * the two inks on that, which is why a die needs only one material even though
 * it has two colours.
 */
export function diceGeometry(o: Required<DiceOptions>): THREE.BufferGeometry {
  const half = o.size / 2
  const { radius: r } = diceMetrics(o)
  const depth = r * o.sink
  const geo = roundedBox(o.size, o.size * o.round, o.segments)
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const all = pips(o)
  const mark = new Float32Array(pos.count * 3).fill(1)
  const v = new THREE.Vector3()
  // the rim is feathered over about one cell, so the colour edge is not a staircase
  const cell = o.size / o.segments

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    for (const p of all) {
      const n = p.normal
      const along = v.x * n[0] + v.y * n[1] + v.z * n[2]
      // only vertices on this face's own flat, not on the rounding or elsewhere
      if (along < half - 1e-4) continue
      const dx = v.x - p.position[0]
      const dy = v.y - p.position[1]
      const dz = v.z - p.position[2]
      const d = Math.hypot(dx, dy, dz)
      if (d >= r) continue
      // spherical cap: deepest at the centre, meeting the surface at the rim
      const drop = depth * Math.sqrt(1 - (d / r) ** 2)
      v.set(v.x - n[0] * drop, v.y - n[1] * drop, v.z - n[2] * drop)
      pos.setXYZ(i, v.x, v.y, v.z)
      const t = Math.min(1, Math.max(0, (r - d) / cell))
      const m = 1 - t
      mark[i * 3] = m
      mark[i * 3 + 1] = m
      mark[i * 3 + 2] = m
      break
    }
  }
  pos.needsUpdate = true
  geo.setAttribute('color', new THREE.BufferAttribute(mark, 3))
  geo.computeVertexNormals()
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
  return geo
}

export default function Die({
  value,
  ink = 'white',
  pipInk = 'black',
  position = [0, 0, 0],
  rotation,
  spin = 0,
  ...opts
}: DiceOptions & {
  /** which face reads upward; ignored when `rotation` is given */
  value?: number
  ink?: ChipInk
  pipInk?: ChipInk
  position?: [number, number, number]
  rotation?: [number, number, number]
  /** extra yaw, so a pair is not two identical objects */
  spin?: number
}) {
  const o = { ...DEFAULTS, ...opts }
  const geo = useMemo(() => diceGeometry(o), [o.size, o.round, o.pip, o.sink, o.segments])
  const mat = useMemo(() => diceMaterial(ink, pipInk), [ink, pipInk])
  useEffect(() => () => geo.dispose(), [geo])
  const rot = rotation ?? faceUp(value ?? 1)
  /**
   * ORDER 'YXZ', so `spin` is a real turn about the world vertical.
   *
   * Under the default XYZ the Y term is applied BEFORE the faceUp tilt on X, so
   * adding a spin to a die that has been laid on its 5 tips it onto an edge
   * instead of turning it: the pair sat on the felt visibly cocked. In YXZ the
   * spin is applied last, in world space, and a die laid flat stays flat however
   * far it is turned. Same trap the shuffle hit with its cards.
   */
  return (
    <mesh
      geometry={geo}
      material={mat}
      castShadow
      receiveShadow
      position={position}
      rotation={new THREE.Euler(rot[0], rot[1] + spin, rot[2], 'YXZ')}
    />
  )
}

/** a matched pair, sat side by side and turned so they do not read as one object twice */
export function DicePair({
  values = [5, 2],
  ink = 'white',
  pipInk = 'black',
  gap = 0.62,
  position = [0, 0, 0],
  ...opts
}: DiceOptions & {
  values?: [number, number]
  ink?: ChipInk
  pipInk?: ChipInk
  gap?: number
  position?: [number, number, number]
}) {
  const size = opts.size ?? DEFAULTS.size
  return (
    <group position={position}>
      <Die {...opts} value={values[0]} ink={ink} pipInk={pipInk} spin={0.3} position={[-gap / 2, size / 2, 0]} />
      <Die {...opts} value={values[1]} ink={ink} pipInk={pipInk} spin={-0.55} position={[gap / 2, size / 2, 0.14]} />
    </group>
  )
}
