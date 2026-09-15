import assert from 'node:assert/strict'
import { canStartCasinoIntro } from '../components/resume/casino/intro-ready'

for (const phase of ['covering', 'loading', 'revealing', 'hidden']) {
  assert.equal(canStartCasinoIntro(false, phase), false, 'actor construction and GPU preparation must finish')
  assert.equal(canStartCasinoIntro(true, phase), phase === 'hidden' || phase === 'revealing', 'start with the reveal, never on loading')
}
// A slow load can finish long after the route transition is already hidden.
assert.deepEqual([false, false, false, true].map(ready => canStartCasinoIntro(ready, 'hidden')),
  [false, false, false, true])
console.log('PASS: actor/GPU readiness gates slow loading while preserving the original reveal timing')
