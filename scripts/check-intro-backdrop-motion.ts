import assert from 'node:assert/strict'
import { BACKDROP_CLEAR_AT, sampleBackdropLayer, sampleBackdropMotion } from '../components/resume/casino/intro-backdrop-motion'
import { IMPACT_DEPART, impactBurstMotion } from '../components/resume/casino/impact-eye-motion'
import { getTune, setTune } from '../components/resume/casino/tune'

const initial = getTune()
const sample = (t: number, ia = -1) => sampleBackdropMotion({ travel: 0, rush: 0, opacity: 0, dive: 0, flick: 0 }, t, ia)
for (const config of [{}, { jkRise: 0.8, jkHold: 0.3, jkFallFor: 0.7, jkDelay: 0.1, jkOver: 0.04 }, { jkRise: 2.2, jkHold: 0.2, jkFallFor: 1.5, jkEaseUp: 2, jkEaseDown: 2 }]) {
  setTune({ ...initial, ...config })
  const tn = getTune(), drop = tn.jkFlick + tn.jkRise + tn.jkHold
  const start = tn.jkFlick + tn.jkDelay, top = drop + tn.jkOver, land = drop + tn.jkFallFor
  assert.equal(sample(start - 0.01).travel, 0, 'background waits for the camera to launch')
  const mid = sample((start + top) / 2), peak = sample(top)
  assert(mid.travel < -0.1 && peak.travel < mid.travel, 'environment moves down during ascent')
  const fallStart = Math.max(top, drop + tn.jkSink)
  const early = sample(fallStart + (land - fallStart) * 0.1)
  const half = sample(fallStart + (land - fallStart) * 0.5)
  const late = sample(fallStart + (land - fallStart) * 0.9)
  assert(early.travel < half.travel && half.travel < late.travel, 'environment moves up during descent')
  assert(late.travel - half.travel > half.travel - early.travel, 'default/heavy descent gathers speed')
  assert(half.rush > early.rush && half.rush > late.rush, 'stretch follows the camera rush')
  assert(sample(land).travel > 0, 'camera lands below its initial title height')
  assert(Math.abs(sample(top + 1e-5).travel - sample(top - 1e-5).travel) < 1e-4, 'continuous apex reversal')
  sample(land + 3, 3)
  assert.deepEqual(sample((start + top) / 2), mid, 'replay / backward scrubbing do not retain later state')
}
setTune(initial)
assert(BACKDROP_CLEAR_AT < IMPACT_DEPART, 'clear before normal-scene reveal begins')
for (let age = BACKDROP_CLEAR_AT; age < 4; age += 0.01) assert.equal(sample(7, age).opacity, 0)
for (let age = 0; age < 1.2; age += 0.01) {
  if (impactBurstMotion(age).reveal > 0) assert.equal(sample(7, age).opacity, 0, 'normal room never receives the intro backdrop')
}
for (const motion of [0, 1.1, 2]) for (let i = 0; i < 3; i++) {
  let previous: ReturnType<typeof sampleBackdropLayer> | undefined
  for (let t = 0; t < 9; t += 1 / 240) {
    const pose = sampleBackdropLayer({ x: 0, y: 0, rotation: 0, sx: 1, sy: 1 }, sample(t), t, i, motion)
    assert(Object.values(pose).every(Number.isFinite))
    if (motion === 0) assert(pose.x === 0 && pose.y === 0 && pose.rotation === 0 && pose.sx === pose.sy, 'motion zero freezes all decoration')
    // Inverse-transform each viewport corner into the plane. No bare edges,
    // including at the fastest fall and maximum editor motion setting.
    for (const x of [-1 / 1.22, 1 / 1.22]) for (const y of [-1 / 1.22, 1 / 1.22]) {
      const dx = x - pose.x, dy = y - pose.y, c = Math.cos(pose.rotation), s = Math.sin(pose.rotation)
      assert(Math.abs((c * dx + s * dy) / pose.sx) < 1 && Math.abs((-s * dx + c * dy) / pose.sy) < 1, 'rotating art covers every viewport corner')
    }
    if (previous) assert(Math.abs(pose.rotation - previous.rotation) < 0.035 && Math.abs(pose.y - previous.y) < 0.05, 'no jumps during launch, apex or landing')
    previous = pose
  }
}
console.log('PASS camera-linked travel, layered rotations, continuity, coverage at max motion, timing changes, replay and zero backdrop during room reveal')
