import assert from 'node:assert/strict'
import { IMPACT_ARRIVE, IMPACT_DEPART, IMPACT_DURATION, IMPACT_PLACEMENT_AGE, impactBurstMotion, impactEyeMotion, impactExitPosition, impactPropFill } from '../components/resume/casino/impact-eye-motion'

for (const from of [0, 0.4, 1]) {
  const editor = impactEyeMotion(IMPACT_PLACEMENT_AGE, from, true)
  assert.equal(editor.spread, from + (1 - from) * (1 - Math.pow(1 - 2.5 / 6, 3)), 'approved layout stays unchanged')
  assert.equal(impactEyeMotion(-1, from).spread, from)
  let previous = from, previousStep = Infinity
  for (let frame = 1; frame <= 100; frame++) {
    const pose = impactEyeMotion(frame / 100 * IMPACT_ARRIVE, from)
    const step = pose.spread - previous
    assert.ok(step >= 0 && step <= previousStep + 1e-12, 'arrival continuously decelerates')
    previous = pose.spread
    previousStep = step
  }
  assert.deepEqual(impactEyeMotion(IMPACT_ARRIVE, from), editor, 'motion passes through the approved placement exactly')
  for (const t of [IMPACT_ARRIVE, 0.4, IMPACT_DEPART]) {
    if (from < 1 && t > IMPACT_ARRIVE) assert.ok(impactEyeMotion(t, from).spread > editor.spread, 'coast continues beyond the approved placement')
    assert.equal(impactBurstMotion(t).exit, 0, 'no early departure')
    assert.equal(impactBurstMotion(t).reveal, 0, 'normal scene waits for departure')
  }
  assert.deepEqual(impactEyeMotion(0.8, from, true), editor, 'editor remains stationary')
}
// The motion stays outward on every display frame, including the former pause and the
// transition into acceleration. A low but nonzero speed makes the layout readable.
let previousTravel = 0
for (let frame = 1; frame < 240; frame++) {
  const t = frame / 240 * IMPACT_DURATION
  const motion = impactBurstMotion(t)
  const travel = motion.arrival + motion.exit * 50
  assert.ok(travel > previousTravel, 'outward travel never stalls')
  previousTravel = travel
}
const delta = 1e-6
const position = (t: number) => { const m = impactBurstMotion(t); return m.arrival + 50 * m.exit }
const speed = (t: number) => (position(t + delta) - position(t)) / delta
assert.ok(speed(0.4) > 0 && speed(0.4) < speed(0) * 0.05, 'coast retains motion below 5% of launch speed')
for (const t of [IMPACT_ARRIVE, IMPACT_DEPART]) {
  assert.ok(Math.abs(speed(t - delta) - speed(t)) < 1e-3, 'velocity is continuous into coast and acceleration')
}
for (const boundary of [IMPACT_ARRIVE, IMPACT_DEPART, IMPACT_DURATION]) {
  const a = impactBurstMotion(boundary - 1e-7), b = impactBurstMotion(boundary + 1e-7)
  for (const key of ['arrival', 'exit', 'reveal'] as const) assert.ok(Math.abs(a[key] - b[key]) < 1e-5, 'phase boundaries are continuous')
}
let previousExit = 0, previousStep = 0, previousReveal = 0
for (let i = 1; i <= 100; i++) {
  const pose = impactBurstMotion(IMPACT_DEPART + (IMPACT_DURATION - IMPACT_DEPART) * i / 100)
  const step = pose.exit - previousExit
  assert.ok(step > previousStep, 'departure accelerates each frame')
  assert.ok(pose.reveal > previousReveal && pose.reveal <= 1, 'reveal expands monotonically')
  previousExit = pose.exit; previousStep = step; previousReveal = pose.reveal
}
assert.equal(impactBurstMotion(IMPACT_DURATION).exit, 1)
assert.equal(impactBurstMotion(IMPACT_DURATION).reveal, 1)
const exitDuration = IMPACT_DURATION - IMPACT_DEPART
assert.ok(impactBurstMotion(IMPACT_DEPART + exitDuration / 3).reveal < 0.015, 'opening stays tiny through the first third of the return')
assert.ok(impactBurstMotion(IMPACT_DEPART + exitDuration / 2).reveal < 0.065, 'large expansion happens after the tiny circle has had time to read')

assert.equal(impactPropFill(-0.01), 0)
for (let frame = 0; frame <= 240; frame++) {
  assert.equal(impactPropFill(frame / 240 * IMPACT_DURATION), 1, 'props stay readable while any part of the scene is still two-tone')
}
let previousFill = 1
for (let frame = 1; frame <= 120; frame++) {
  const fill = impactPropFill(IMPACT_DURATION + frame / 240)
  assert.ok(fill <= previousFill && fill >= 0, 'lighting settles monotonically after the reveal')
  assert.ok(previousFill - fill < 0.03, 'no abrupt lighting drop between frames')
  previousFill = fill
}
assert.equal(previousFill, 0, 'normal lighting is restored')

// Include wide/tall viewports, large sprites, and exact-centre fallback directions.
// An off-centre origin can be a viewport diagonal from the screen centre.
for (const aspect of [0.45, 1, 16 / 9, 3.5]) {
  const height = 12, diagonal = height * Math.hypot(1, aspect)
  for (const extent of [0.1, 2, 8]) {
    for (const [x, y] of [[0, 0], [0.001, 0], [0, -1], [3, 2], [-4, 3]]) {
      const p = impactExitPosition(x, y, 0.99 ** 3, 2 * diagonal + 8 + extent, 41)
      assert.ok(Math.hypot(p.x, p.y) - extent > 1.5 * diagonal, 'sprite clears screen before retirement')
    }
  }
}
console.log('OK: preserved placements, nonzero coast speed, continuous velocity, accelerating exit and complete radial reveal')
