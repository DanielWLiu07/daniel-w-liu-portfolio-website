/**
 * Does the shuffle ever put two cards through each other?
 *
 * Walks the cycle and tests every pair of cards at every step with a proper
 * separating-axis test on oriented boxes.
 *
 * The first version of this check compared each card's VERTICAL extent
 * independently and reported 112,489 collisions, all of them false. A stack of
 * PARALLEL tilted cards does not intersect: they are offset along their own
 * normal, which a vertical test cannot see. Tilt only matters between cards that
 * disagree about their orientation, and that is exactly what SAT measures.
 *
 *   npx tsx scripts/check-shuffle.ts [steps]
 */
import { Euler, Matrix4, Vector3 } from 'three'
import {
  ASPECT,
  DEFAULTS,
  buildMerge,
  posesAt,
  slotOrder,
  type CardPose,
  type ShuffleOptions,
} from '../components/resume/casino/deck-shuffle'

const STEPS = Number(process.argv[2] ?? 400)
const o: Required<ShuffleOptions> = { ...DEFAULTS }
const merge = buildMerge(o.count)
const order = slotOrder(merge)

/** the card is a shape in XY extruded along Z, so its local half-extents are: */
const HALF = new Vector3((o.length * ASPECT) / 2, o.length / 2, o.thickness / 2)
/** any orientation fits inside this radius, for the cheap reject */
const RADIUS = HALF.length()

interface Box {
  c: Vector3
  /** the three axes of the box, unit length */
  a: Vector3[]
}

function boxOf(p: CardPose): Box {
  // the same rotation the component writes, ORDER INCLUDED: under XYZ the Y term
  // lands before the card is laid flat and becomes a tilt, which is a different
  // shape entirely and would make this check test something the page never draws
  const m = new Matrix4().makeRotationFromEuler(new Euler(-Math.PI / 2 + p.pitch, p.yaw, p.roll, 'YXZ'))
  const e = m.elements
  return {
    c: new Vector3(p.x, p.y, p.z),
    a: [new Vector3(e[0], e[1], e[2]), new Vector3(e[4], e[5], e[6]), new Vector3(e[8], e[9], e[10])],
  }
}

const HALVES = [HALF.x, HALF.y, HALF.z]

/** projection radius of a box onto an axis */
function radius(b: Box, axis: Vector3): number {
  return (
    HALVES[0] * Math.abs(b.a[0].dot(axis)) +
    HALVES[1] * Math.abs(b.a[1].dot(axis)) +
    HALVES[2] * Math.abs(b.a[2].dot(axis))
  )
}

/** how deep two boxes interpenetrate; <= 0 means they are apart */
function penetration(A: Box, B: Box): number {
  const d = new Vector3().subVectors(B.c, A.c)
  const axes: Vector3[] = [...A.a, ...B.a]
  for (const u of A.a)
    for (const v of B.a) {
      const c = new Vector3().crossVectors(u, v)
      if (c.lengthSq() > 1e-12) axes.push(c.normalize())
    }
  let best = Infinity
  for (const ax of axes) {
    const gap = Math.abs(d.dot(ax)) - (radius(A, ax) + radius(B, ax))
    if (gap > 0) return gap // a separating axis: they are apart, done
    if (-gap < best) best = -gap
  }
  return -best // negative gap = penetration depth
}

interface Hit {
  t: number
  a: number
  b: number
  depth: number
}
/**
 * Cards in a deck TOUCH: neighbours sit exactly one thickness apart, so SAT
 * reports a separation of zero and a naive test calls that a collision. Only
 * penetration deeper than a hundredth of a card counts, which is still an order
 * of magnitude finer than anything that could be seen.
 */
const EPS = o.thickness * 0.01
const hits: Hit[] = []
let worst = Infinity
let worstAt = 0

for (let s = 0; s <= STEPS; s++) {
  const t = s / STEPS
  const boxes = posesAt(t, o, merge, order).map(boxOf)
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxes[i].c.distanceToSquared(boxes[j].c) > (2 * RADIUS) ** 2) continue
      const g = penetration(boxes[i], boxes[j])
      if (g < worst) {
        worst = g
        worstAt = t
      }
      if (g < -EPS) hits.push({ t, a: i, b: j, depth: -g })
    }
  }
}

const th = (v: number) => `${(v / o.thickness).toFixed(2)} thicknesses`
console.log(`cards ${o.count}  thickness ${o.thickness.toFixed(5)}  steps ${STEPS}`)
console.log(`closest approach ${worst.toFixed(6)} (${th(worst)}) at t = ${worstAt.toFixed(3)}`)
console.log(`tolerance: penetration deeper than ${EPS.toFixed(7)} (0.01 thicknesses) counts as clipping`)
if (hits.length === 0) {
  console.log('NO CLIPPING: no pair of cards intersects at any step of the cycle')
  process.exit(0)
}
hits.sort((p, q) => q.depth - p.depth)
const times = [...new Set(hits.map((h) => h.t.toFixed(2)))]
console.log(`CLIPPING: ${hits.length} intersecting pair-instants over ${times.length} distinct times`)
console.log(`worst ${hits[0].depth.toFixed(6)} (${th(hits[0].depth)})`)
for (const h of hits.slice(0, 8)) {
  console.log(`  t=${h.t.toFixed(3)} cards ${h.a} & ${h.b} by ${th(h.depth)}`)
}
process.exit(1)
