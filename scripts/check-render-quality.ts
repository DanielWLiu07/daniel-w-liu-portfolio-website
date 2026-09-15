import assert from 'node:assert/strict'
import { AdaptiveRenderQuality, pixelBudgetScale } from '../components/resume/casino/render-quality'

assert.equal(pixelBudgetScale(.75, 1280, 720, 1), .75)
assert.ok(pixelBudgetScale(.75, 2560, 1440, 1.35) < .57)
assert.equal(pixelBudgetScale(.75, 7680, 4320, 2), .5)
assert.equal(pixelBudgetScale(.4, 7680, 4320, 2), .4)
function run(dt: number, frames: number, base = .75) {
  const q = new AdaptiveRenderQuality()
  let scale = base
  for (let i = 0; i < frames; i++) scale = q.sample(dt, scale, base)
  return scale
}
assert.equal(run(1 / 60, 1800), .75, 'fast devices retain quality')
assert.equal(run(1 / 30, 900), .5, 'sustained overload reaches the usable floor')
assert.equal(run(.15, 150), .5, 'severely slow frames still trigger adaptation')
assert.equal(run(.15, 150, .4), .4, 'never raise an explicitly lower base')
const q = new AdaptiveRenderQuality()
let scale = .75
for (let i = 0; i < 600; i++) scale = q.sample(i === 50 ? .4 : 1 / 60, scale, .75)
assert.equal(scale, .75, 'one compile stall does not lower quality')
assert.equal(q.sample(8, scale, .75), .75, 'resuming a suspended tab is ignored')
console.log('Render quality: pixel budget, sustained misses, stalls and floors pass')
