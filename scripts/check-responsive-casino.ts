import assert from 'node:assert/strict'
import { casinoViewport, PORTRAIT_TITLE, PORTRAIT_JACK_CARRIERS } from '../components/resume/casino/responsive-layout'

for (const [w, h] of [[320,568],[360,640],[390,844],[430,932],[768,1024],[1024,768],[844,390],[1366,768],[1920,1080]]) {
  const p = casinoViewport(w, h)
  assert.ok(p.folderScale >= .5 && p.folderScale <= 1)
  assert.ok(p.dealerFit >= .72 && p.dealerFit <= 1, 'dealer never shrinks to a tiny figure')
  if (w / h >= 1.5 && h >= 500) {
    assert.equal(p.folderScale, 1)
    assert.equal(p.titleFit, Math.min(1, w / h / (1500 / 900)), 'authored desktop sizing unchanged')
    assert.equal(p.rouletteY, 0); assert.equal(p.royalY, 0)
    assert.equal(p.portrait, false)
  }
  if (w / h < .9) assert.ok(p.rouletteY < p.royalY, 'portrait flight props use separate vertical spaces')
}
assert.equal(PORTRAIT_TITLE.map(l => l.text).join(' '), 'ALWAYS BET ON DANIEL W LIU')
assert.equal(new Set(PORTRAIT_JACK_CARRIERS.map(c => c.width)).size, 1, 'four equally sized Jacks')
assert.ok(PORTRAIT_TITLE.every(l => Number.isFinite(l.y) && l.scale > 0))
console.log('PASS: nine viewport profiles, unchanged desktop, readable portrait rows and equal card carriers')
