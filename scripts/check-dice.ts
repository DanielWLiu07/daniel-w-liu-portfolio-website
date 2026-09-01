/**
 * Are these actually dice?
 *
 * A die has rules, so they can be asserted rather than eyeballed:
 *   21 pips, from 1 + 2 + 3 + 4 + 5 + 6
 *   opposite faces sum to seven
 *   right handed: 1 up, 2 toward the viewer, 3 on the right
 *   every pip sits ON its face and inside the flat part, clear of the rounding
 *   no two pips overlap
 *
 * A left-handed die, or one with 2 opposite 5 on the wrong axis, looks
 * completely fine in a render and is wrong to anyone who plays.
 *
 *   npx tsx scripts/check-dice.ts
 */
import { Euler, Vector3 } from 'three'
import { DEFAULTS, diceGeometry, diceMetrics, faceUp, pips } from '../components/resume/casino/dice'

// the shipping proportions, not a copy of them
const o = { ...DEFAULTS }
const all = pips(o)
const half = o.size / 2
// the RESOLVED radius: the requested one is an upper bound and may be clamped
const { radius: r, flat } = diceMetrics(o)
const fail: string[] = []

// 21 pips
if (all.length !== 21) fail.push(`expected 21 pips, got ${all.length}`)

// each face carries its own count
const byValue = new Map<number, number>()
for (const p of all) byValue.set(p.value, (byValue.get(p.value) ?? 0) + 1)
for (let v = 1; v <= 6; v++) {
  if (byValue.get(v) !== v) fail.push(`face ${v} has ${byValue.get(v) ?? 0} pips`)
}

// opposite faces sum to seven
const normalOf = new Map<number, [number, number, number]>()
for (const p of all) normalOf.set(p.value, p.normal)
for (let v = 1; v <= 6; v++) {
  const n = normalOf.get(v)!
  const opposite = [...normalOf.entries()].find(([, m]) => m[0] === -n[0] && m[1] === -n[1] && m[2] === -n[2])
  if (!opposite) fail.push(`face ${v} has no opposite`)
  else if (opposite[0] + v !== 7) fail.push(`face ${v} is opposite ${opposite[0]}, should sum to 7`)
}

// right handed: 1 on +Y, 2 on +Z, 3 on +X
const axis = (v: number) => normalOf.get(v)!
const eq = (a: [number, number, number], b: number[]) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
if (!eq(axis(1), [0, 1, 0])) fail.push(`1 should be on +Y, is on ${axis(1)}`)
if (!eq(axis(2), [0, 0, 1])) fail.push(`2 should be on +Z, is on ${axis(2)}`)
if (!eq(axis(3), [1, 0, 0])) fail.push(`3 should be on +X, is on ${axis(3)} (this die is left handed)`)

// every pip sits on its own face, inside the flat part
for (const p of all) {
  const along = p.position[0] * p.normal[0] + p.position[1] * p.normal[1] + p.position[2] * p.normal[2]
  // a pip's position is the centre of its hollow ON the face; the dent is cut
  // inward from there
  if (Math.abs(along - half) > 1e-9) fail.push(`pip on face ${p.value} sits ${along.toFixed(4)} along its normal, expected ${half.toFixed(4)}`)
  // distance from the face centre, in the plane
  const lat = Math.hypot(
    p.position[0] - p.normal[0] * along,
    p.position[1] - p.normal[1] * along,
    p.position[2] - p.normal[2] * along,
  )
  if (lat + r > flat) fail.push(`pip on face ${p.value} reaches ${(lat + r).toFixed(4)} from centre, past the flat at ${flat.toFixed(4)}`)
}

// no two pips overlap
let closest = Infinity
for (let i = 0; i < all.length; i++)
  for (let j = i + 1; j < all.length; j++) {
    const d = Math.hypot(
      all[i].position[0] - all[j].position[0],
      all[i].position[1] - all[j].position[1],
      all[i].position[2] - all[j].position[2],
    )
    if (d < closest) closest = d
    if (d < 2 * r - 1e-9) fail.push(`pips on faces ${all[i].value}/${all[j].value} overlap (${d.toFixed(4)} < ${(2 * r).toFixed(4)})`)
  }

/**
 * faceUp(n) must actually put face n up.
 *
 * It is a small table of rotations and two of its entries were swapped: asking
 * for a 3 showed a 4, because 3 sits on +X and a positive turn about Z is what
 * carries +X to +Y. Nothing about the die is wrong when this is; it just lies
 * about which face it is showing, which is worse.
 */
for (let v = 1; v <= 6; v++) {
  const e = faceUp(v)
  const up = normalOf.get(v)!
  const turned = new Vector3(up[0], up[1], up[2]).applyEuler(new Euler(e[0], e[1], e[2]))
  if (turned.y < 0.999) {
    fail.push(`faceUp(${v}) leaves that face pointing [${turned.toArray().map((x) => x.toFixed(2))}], not up`)
  }
}

/**
 * A die laid on a face must sit FLAT, at any spin.
 *
 * The component composes faceUp with a spin about the vertical, and under the
 * default Euler order the spin lands before the tilt and cocks the die onto an
 * edge. This walks the corners: with the right composition the lowest one is
 * exactly half the size below centre, so placing the die at y = half rests it on
 * the felt like a chip.
 */
const corners: Vector3[] = []
for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
  corners.push(new Vector3(sx * half, sy * half, sz * half))
}
for (let v = 1; v <= 6; v++) {
  for (const spin of [0, 0.3, -0.55, 1.2]) {
    const e = faceUp(v)
    const rot = new Euler(e[0], e[1] + spin, e[2], 'YXZ')
    let low = Infinity
    for (const c of corners) low = Math.min(low, c.clone().applyEuler(rot).y)
    if (Math.abs(low + half) > 1e-6) {
      fail.push(`face ${v} at spin ${spin} sits with its lowest corner at ${low.toFixed(4)}, not ${(-half).toFixed(4)}: the die is cocked`)
    }
  }
}

/**
 * The pips must go IN, not out.
 *
 * An earlier version placed spheres at the pip positions, which gives beads
 * standing proud of the face. This walks the BUILT geometry and asserts two
 * things: nothing reaches past a face's plane anywhere, and every pip really has
 * a hollow of about the depth it was asked for.
 */
const geo = diceGeometry(o)
const gp = geo.getAttribute('position')
if (!geo.getAttribute('color')) {
  fail.push('the geometry carries no colour attribute, so the material cannot tell body from pip')
}
let maxOut = 0
const deepest = new Map<string, number>()
for (let i = 0; i < gp.count; i++) {
  const vx = gp.getX(i)
  const vy = gp.getY(i)
  const vz = gp.getZ(i)
  for (const p of all) {
    const n = p.normal
    const d = Math.hypot(vx - p.position[0], vy - p.position[1], vz - p.position[2])
    if (d > r) continue
    const along = vx * n[0] + vy * n[1] + vz * n[2]
    const below = half - along
    if (below < 0) maxOut = Math.max(maxOut, -below)
    const key = p.position.map((v) => v.toFixed(4)).join(',')
    deepest.set(key, Math.max(deepest.get(key) ?? 0, below))
  }
}
const wantDepth = r * o.sink
if (maxOut > 1e-6) fail.push(`geometry stands ${maxOut.toFixed(5)} proud of the face plane: these are studs, not holes`)
if (deepest.size === 0) fail.push('no vertex falls inside any pip: the dents were never cut')
else {
  const shallow = [...deepest.values()].filter((v) => v < wantDepth * 0.8)
  if (shallow.length) {
    fail.push(`${shallow.length} of ${deepest.size} pips are shallower than ${(wantDepth * 0.8).toFixed(4)}, asked for ${wantDepth.toFixed(4)}`)
  }
}

console.log(`pips ${all.length}   pip radius ${r.toFixed(4)}   closest pair ${closest.toFixed(4)} (needs > ${(2 * r).toFixed(4)})`)
console.log(`geometry ${gp.count} verts   deepest hollow ${Math.max(0, ...deepest.values()).toFixed(4)} (asked ${wantDepth.toFixed(4)})   nothing proud: ${maxOut <= 1e-6}`)
console.log(`faces: ${[1, 2, 3, 4, 5, 6].map((v) => `${v}->[${axis(v)}]`).join('  ')}`)
if (fail.length === 0) {
  console.log('OK: 21 pips, opposite faces sum to 7, right handed, faceUp lands the right face, a laid die sits flat at any spin, all pips on the flat and clear of each other, and every pip is a HOLLOW with nothing standing proud')
  process.exit(0)
}
for (const f of fail) console.log('FAIL ' + f)
process.exit(1)
