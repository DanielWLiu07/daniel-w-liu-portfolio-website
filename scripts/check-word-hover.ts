import assert from 'node:assert/strict'
import { hoverCorrection, proximityInfluence } from '../components/resume/casino/word-hover'
const rest = { x: 0, y: 0, turn: 0 }
for (const age of [-1, Infinity, NaN]) {
  const p = hoverCorrection(age, 0)
  assert.deepEqual(p, rest)
}
assert.deepEqual(hoverCorrection(0.01, 0), hoverCorrection(0.07, 0))
for (let i = 0; i < 1200; i++) {
  const p = hoverCorrection(i / 12, 0)
  assert.ok(Math.abs(p.x) <= 0.018 && Math.abs(p.turn) <= 0.018)
  assert.ok(0.1 + p.y > 0)
  assert.notDeepEqual(p, rest)
}
assert.notDeepEqual(hoverCorrection(2, 0), hoverCorrection(2.1, 0))
assert.notDeepEqual(hoverCorrection(2, 0), hoverCorrection(2, 1))
console.log('Letter hover: continuous stepped jitter, per-letter phase and tiny bounds pass.')
assert.equal(proximityInfluence(0, 100), 1)
assert.equal(proximityInfluence(100, 100), 0)
assert.equal(proximityInfluence(1000, 100), 0)
assert.ok(proximityInfluence(20, 100) > proximityInfluence(50, 100))
assert.ok(proximityInfluence(50, 100) > proximityInfluence(80, 100))
console.log('Letter proximity: smooth bounded distance falloff passes.')
