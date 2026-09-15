import assert from 'node:assert/strict'
import { jackCardinalAt, jackStraightAt, jackRedBackAt, jackSeedAt, jackFallAt, jackBlastAt, JACK_SEED_LEAD } from '../components/resume/casino/jack-composition'
import { JACK_COMPOSITION, JACK_FAN, JACK_CARRIERS, JACK_GRID, JACK_GRID_CENTRES, jackTileAt, jackEchoAt, jackSpiralAt, jackKeeperAt, jackWallRevealAt, jackDealAt, jackStormAt, jackCrossingOffset, includeJackRect, jackPaperProjection, jackFanAt, jackFraming } from '../components/resume/casino/jack-composition'
import { TUNE_DEFAULTS, TUNE_RANGES } from '../components/resume/casino/tune'

assert.equal(new Set(JACK_GRID_CENTRES.map(p => p.join(','))).size, 4)
assert.equal(TUNE_DEFAULTS.jkFlick, 3.25, 'shorter title-to-chip handoff is the shared default')
assert.ok(TUNE_DEFAULTS.jkFlick - (3.8 + JACK_SEED_LEAD) / 1.3 < .05, 'red finish leads directly into chip flick')
for (let col = 0; col < 9; col++) for (let row = 0; row < 7; row++) {
  assert.equal(jackRedBackAt(TUNE_DEFAULTS.jkFlick * 1.3 - JACK_SEED_LEAD, col, row), 1, 'all backs finish before the chip moves')
}
assert.equal(jackSeedAt(-JACK_SEED_LEAD - .01, 8).visible, false)
assert.equal(jackSeedAt(-JACK_SEED_LEAD, 8).y, -8, 'seed starts fully below the viewport')
assert.equal(jackSeedAt(.1, 8).y, 0, 'seed lands at the exact screen centre')
assert.equal(jackSeedAt(.1, 8).yaw, 0, 'seed is flat before children unfold')
assert.ok(jackSeedAt(-.08, 8).y > .1, 'one small over-catch gives the deal life')
assert.ok(Math.abs(jackSeedAt(.1, 8).roll) < 1e-10, 'wrist settles flat')
const fallVariants = new Set<number>()
for (let i = 0; i < 79; i++) {
  assert.equal(jackFallAt(-.01, i).active, false, 'paper waits for chip descent')
  assert.ok(jackFallAt(1, i).y < -10, 'gravity gives the paper real downward travel')
  fallVariants.add(Math.round(jackFallAt(.8, i).yaw * 100))
  let previous = 0
  for (let t = 0; t <= 2.2; t += .01) {
    const p = jackFallAt(t, i)
    assert.ok(Number.isFinite(p.x + p.y + p.yaw + p.roll))
    assert.ok(Math.abs(p.pitch) <= .36, 'paper flutter stays bounded, not a tumbling-axis snap')
    assert.ok(p.y <= previous + 1e-10, 'fall never reverses upward')
    previous = p.y
  }
  assert.deepEqual(jackFallAt(.7, i), jackFallAt(.7, i), 'fall is replay/scrub deterministic')
  const earlySpin = Math.abs(jackFallAt(.21, i).yaw - jackFallAt(.2, i).yaw)
  const lateSpin = Math.abs(jackFallAt(1.51, i).yaw - jackFallAt(1.5, i).yaw)
  assert.ok(lateSpin <= earlySpin + 1e-10, 'angular drag slows the initial spin instead of winding it up')
}
assert.ok(fallVariants.size > 10, 'individual tumble instead of a rigid falling wall')
assert.equal(jackBlastAt(-1, 0, 1, 0).active, false, 'no release before chip crosses the wall')
assert.ok(jackBlastAt(.25, 0, 1, 0).x > 0, 'nearby card is pushed away from the puncture')
assert.ok(jackBlastAt(.25, 0, -1, 0).x < 0, 'opposite side receives opposite impulse')
assert.ok(jackBlastAt(.25, 0, 1, 0).x > jackBlastAt(.25, 0, 7, 0).x, 'blast quickly weakens away from the chip')
assert.ok(jackBlastAt(.7, 0, 1, 0, 70).y > 15, 'near paper inherits upward chip momentum and stays visible during ascent')
assert.ok(jackBlastAt(.7, 0, 12, 0, 70).y < 0, 'distant wall does not ride upward with the chip')
assert.ok(jackBlastAt(2, 0, 1, 0, 70).y < jackBlastAt(1.3, 0, 1, 0, 70).y, 'launched paper turns over into gravity-driven descent')
for (let i = 0; i < 4; i++) {
  const laneStart = jackStraightAt(0, i, -2, 3, 4, -1)
  const laneEnd = jackStraightAt(1, i, -2, 3, 4, -1)
  assert.deepEqual(laneEnd, { x: 4, y: -1 })
  assert.ok(laneStart.x === laneEnd.x || laneStart.y === laneEnd.y, 'one straight approach per title card')
  const beforeMiddle = jackStraightAt(.499, i, -2, 3, 4, -1)
  const afterMiddle = jackStraightAt(.501, i, -2, 3, 4, -1)
  assert.ok(Math.hypot(afterMiddle.x - beforeMiddle.x, afterMiddle.y - beforeMiddle.y) > .007, 'no elbow or midpoint hesitation')
  assert.deepEqual(jackCardinalAt(0, i, -2, 3, 4, -1), { x: -2, y: 3 })
  assert.deepEqual(jackCardinalAt(1, i, -2, 3, 4, -1), { x: 4, y: -1 })
  for (let p = 0; p < 1; p += .002) {
    if (p < .5 && p + .0001 > .5) continue
    const a = jackCardinalAt(p, i, -2, 3, 4, -1), b = jackCardinalAt(p + .0001, i, -2, 3, 4, -1)
    assert.ok(Math.abs(a.x - b.x) < 1e-10 || Math.abs(a.y - b.y) < 1e-10, 'title travel only changes one coordinate at a time')
  }
}
let converted = 0, waiting = 0
const redPhases = new Set<number>()
for (let col = 0; col < 9; col++) for (let row = 0; row < 7; row++) {
  assert.equal(jackRedBackAt(3.32, col, row), 0, 'last Jack completes before turning red')
  assert.equal(jackRedBackAt(3.8, col, row), 1, 'tight red wave finishes without a long tail')
  redPhases.add(Math.round(jackRedBackAt(3.5, col, row) * 100))
  let previous = 0
  for (let t = 3.4; t < 4.4; t += .01) {
    const p = jackRedBackAt(t, col, row)
    assert.ok(p >= previous && p <= 1, 'one smooth final half-turn, no oscillation')
    previous = p
  }
}
assert.ok(redPhases.size > 7, 'red finish is staggered, not a uniform flash')
for (let col = 0; col < 9; col++) for (let row = 0; row < 7; row++) {
  for (let t = .8; t < 3.14; t += .013) {
    const a = jackEchoAt(t, col, row), b = jackEchoAt(t + .000001, col, row)
    assert.equal(a.lift, 0, 'depth must not turn cardinal travel into perspective drift')
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) / .000001 < 8, 'one easing curve prevents sharp velocity spikes')
    assert.ok(Math.abs(a.x - b.x) < 1e-9 || Math.abs(a.y - b.y) < 1e-9, 'wall movement is cardinal, never diagonal')
  }
}
const phases = new Set<number>()
for (let col = 0; col < 9; col++) for (let row = 0; row < 7; row++) {
  assert.equal(jackWallRevealAt(1, col, row), 0, 'start with mixed ranks')
  const progress = jackWallRevealAt(2.05, col, row)
  phases.add(Math.round(progress * 100))
  if (progress >= .5) converted++
  if (progress === 0) waiting++
  assert.equal(jackWallRevealAt(3.45, col, row), 1, 'entire wall finishes as Jacks')
}
assert.ok(converted > 0 && converted < 63 && waiting > 0 && phases.size > 6, 'separate cohorts reveal progressively, not in unison')
const conversionTimes: number[] = []
for (let col = 0; col < 9; col++) for (let row = 0; row < 7; row++) {
  for (let t = 1; t < 3.5; t += .01) if (jackWallRevealAt(t, col, row) >= .5) { conversionTimes.push(t); break }
}
assert.ok(Math.max(...conversionTimes) - Math.min(...conversionTimes) > 1.2, 'first-to-last Jack conversion spans more than 1.2 seconds')
for (const [i, cue] of [JACK_COMPOSITION.jkTJack, JACK_COMPOSITION.jkTOf, JACK_COMPOSITION.jkTAll, JACK_COMPOSITION.jkTTrades].entries()) {
  const mid = jackKeeperAt((.76 + i * .06 + cue) / 2, i, cue)
  assert.equal(mid.x, 0); assert.equal(mid.y, 0); assert.equal(mid.lift, 0)
  assert.equal(mid.yaw, 0, 'extra in-place keeper flips remain disabled')
  for (const time of [0, cue, cue + 1]) {
    const pose = jackKeeperAt(time, i, cue)
    assert.ok(Math.abs(Math.sin(pose.yaw)) < 1e-10 && Math.cos(pose.yaw) > .999, 'whole turns preserve handoff orientation')
  }
}
assert.equal(jackTileAt(.88, 0, 0).visible, false, 'outer propagation is still underway during early travel')
for (const time of [.98, 1.24, 1.53, 1.92, 2.18, 2.51, 2.88, 3.02]) {
  let active = 0
  for (let col = 0; col < JACK_GRID.columns; col++) for (let row = 0; row < JACK_GRID.rows; row++) {
    const echo = jackEchoAt(time, col, row)
    if (echo.active) {
      active++
      assert.ok(Number.isFinite(echo.x + echo.y), 'paired transfers have finite destinations')
    }
    assert.equal(jackEchoAt(3.2, col, row).active, false, 'travel settles after gradual conversion')
  }
  assert.ok(active >= 2 && active <= 44, `small groups keep moving at ${time}, not the whole wall (${active})`)
}
for (const [x, y] of [[1, 0], [0, 1], [-2, 1]]) {
  const before = jackSpiralAt(.35, x, y), after = jackSpiralAt(2.6, x, y)
  assert.equal(before.x, x); assert.equal(before.y, y)
  assert.equal(after.angle, 0, 'global rotation remains disabled')
  assert.equal(after.x, x); assert.equal(after.y, y, 'wall stays intact behind the title')
}
assert.equal(jackSpiralAt(.9, 1, 0).angle, 0, 'no global rotation during filling')
for (let beat = 1; beat <= 7; beat++) {
  const time = .8 + beat / 3
  const occupied = new Set<string>()
  for (let col = 0; col < 9; col++) for (let row = 0; row < 7; row++) {
    const p = jackEchoAt(time, col, row)
    occupied.add(`${Math.round(col + p.x)},${Math.round(row - p.y)}`)
    assert.ok(Math.abs(Math.hypot(p.qx, p.qy, p.qz, p.qw) - 1) < 1e-8)
  }
  assert.equal(occupied.size, 63, 'every completed exchange fills all 63 cells exactly once')
}
for (let t = .9; t < 3.3; t += .001) {
  const a = jackEchoAt(t, 3, 3), b = jackEchoAt(t + .00001, 3, 3)
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < .001, 'accelerated neighbor travel remains continuous')
  const dot = Math.abs(a.qx * b.qx + a.qy * b.qy + a.qz * b.qz + a.qw * b.qw)
  assert.ok(dot > .9999, 'orientation stays continuous across changes of travel axis')
  assert.ok(a.angle >= 0 && a.angle <= Math.PI, 'one transfer has at most one half-turn')
  assert.ok(Math.abs(a.qx) < 1e-10 && Math.abs(a.qz) < 1e-10, 'card transfers use one vertical hinge without diagonal twisting')
}
let leftTravel = 0, rightTravel = 0
for (let col = 0; col < 9; col++) for (let row = 0; row < 7; row++) {
  const p = jackEchoAt(1.4, col, row)
  if (Math.hypot(p.x, p.y) > .01) {
    if (col < 4) leftTravel++
    if (col > 4) rightTravel++
  }
  assert.ok(Math.abs(col - 4 + p.x) <= 4.001 && Math.abs(3 - row + p.y) <= 3.001, 'travel stays distributed inside the grid')
}
assert.ok(leftTravel >= 8 && rightTravel >= 8 && Math.abs(leftTravel - rightTravel) <= 8, `both sides receive varied travel (${leftTravel}/${rightTravel})`)
assert.equal(JACK_GRID.originCol, (JACK_GRID.columns - 1) / 2)
assert.equal(JACK_GRID.originRow, (JACK_GRID.rows - 1) / 2)
assert.equal(jackTileAt(.12, 4, 3).visible, true)
assert.equal(jackTileAt(.12, 3, 3).visible, false)
assert.equal(jackTileAt(.30, 3, 3).visible, true)
assert.equal(jackTileAt(.30, 4, 4).visible, true)
for (let col = 0; col < JACK_GRID.columns; col++) for (let row = 0; row < JACK_GRID.rows; row++) {
  const full = jackTileAt(1.62, col, row)
  assert.equal(full.visible, true, 'entire checkerboard fills before clearing')
  assert.equal(full.flip, 0)
  assert.equal(full.drop, 0)
  assert.ok(full.turn === 0, 'no rotation before closing')
  const closing = jackTileAt(2.6, col, row)
  assert.equal(closing.drop, 0, 'wall does not fall away')
  assert.equal(closing.retreat, 0, 'wall does not retreat')
  assert.equal(jackTileAt(3.2, col, row).visible, true, 'wall remains behind the title')
  if (!full.seed) {
    const parentCol = col - full.dirX, parentRow = row + full.dirY
    assert.equal(Math.abs(parentCol - col) + Math.abs(parentRow - row), 1)
    assert.equal(jackTileAt(full.cue, parentCol, parentRow).open, 1, 'parent lands before creating child')
    const start = jackTileAt(full.cue, col, row)
    assert.equal(start.flip, Math.PI, 'child begins flat on its parent')
  }
}

for (const [key, value] of Object.entries(JACK_COMPOSITION)) {
  const k = key as keyof typeof JACK_COMPOSITION
  assert.equal(TUNE_DEFAULTS[k], value)
  assert.ok(value >= TUNE_RANGES[k][0] && value <= TUNE_RANGES[k][1], `${key} is editable`)
}
// Identical authored cap sizes must project identically on narrow/wide views,
// at every depth rung, even when the whole lockup is offset from the camera.
for (const fit of [1, 2.5, 4, 5]) for (const z of [0.1, 0.7, 1.4]) {
  const distance = 17, depth = distance - fit * z
  const correction = jackPaperProjection(distance, fit, z)
  assert.ok(Math.abs(correction * distance / depth - 1) < 1e-12)
  for (const x of [-2, 0, 2]) for (const offset of [-0.3, 0.5]) {
    const local = x * correction + offset * (correction - 1)
    assert.ok(Math.abs((local + offset) * distance / depth - (x + offset)) < 1e-12)
  }
}
assert.ok(JACK_COMPOSITION.jkCardX < JACK_COMPOSITION.jkAllX)
assert.ok(Math.abs(JACK_COMPOSITION.jkOfY - JACK_COMPOSITION.jkAllY) < 0.2)
assert.ok(JACK_COMPOSITION.jkAllY > JACK_COMPOSITION.jkTrY)
assert.ok(JACK_COMPOSITION.jkOfS < JACK_COMPOSITION.jkAllS)
assert.ok(JACK_COMPOSITION.jkOfS / JACK_COMPOSITION.jkAllS >= 0.75, 'of remains a readable middle-row word, not a tiny connector')
console.log('PASS: authored composition ranges, reading hierarchy, depth-invariant size/position across view scales')

// Fit must include rotated corners and an overhanging headline, not just word advances.
const bounds = { left: Infinity, right: -Infinity, bottom: Infinity, top: -Infinity }
includeJackRect(bounds, -1, 0.5, 1.42, 2.13, 0.27)
includeJackRect(bounds, -1.4, 0.4, 2.5, 0.7, -0.14)
for (const [x,y,w,h,r] of [[-1,0.5,1.42,2.13,0.27],[-1.4,0.4,2.5,0.7,-0.14]]) {
  for (const sx of [-1,1]) for (const sy of [-1,1]) {
    const px=x+sx*w/2*Math.cos(r)-sy*h/2*Math.sin(r)
    const py=y+sx*w/2*Math.sin(r)+sy*h/2*Math.cos(r)
    assert.ok(px>=bounds.left-1e-10 && px<=bounds.right+1e-10)
    assert.ok(py>=bounds.bottom-1e-10 && py<=bounds.top+1e-10)
  }
}
console.log('PASS: rotated card and overhanging headline corners are inside framing bounds')

assert.equal(new Set(['hearts', ...JACK_FAN.map(card => card.suit)]).size, 4)
for (const card of JACK_FAN) {
  assert.ok(Number.isFinite(card.x + card.y + card.roll))
  assert.ok(Math.abs(card.roll) < Math.PI / 4)
}
console.log('PASS: fan contains the other three distinct Jacks with finite, bounded layout')

for (let i = 0; i < 3; i++) {
  const land = JACK_COMPOSITION.jkTCardLand
  assert.equal(jackFanAt(land + 0.2, land, i).visible, false, 'single card is held after landing')
  assert.deepEqual(jackFanAt(land + 2, land, i), { visible: true, open: 1, arc: Math.sin(Math.PI) ** 2 })
  let previous = 0
  for (let time = land; time <= land + 1.2; time += 0.001) {
    const pose = jackFanAt(time, land, i)
    assert.ok(pose.open >= 0 && pose.open <= 1.05)
    assert.ok(pose.open >= previous - 1e-12, 'spread never reverses direction')
    assert.ok(Math.abs(pose.open - previous) < 0.005, 'no discontinuous split')
    previous = pose.open
    assert.deepEqual(pose, jackFanAt(time, land, i), 'seeking does not depend on earlier frames')
  }
}
assert.equal(jackFanAt(2.2, 1.28, 0, 2.4).visible, false, 'fan follows a retimed headline cue')
assert.equal(jackFanAt(2.2, 1.28, 1, 1.5).open, 1, 'fan completes its snap during the headline arrival')
console.log('PASS: single-card hold, continuous staggered split and deterministic final fan')

const optical = jackFraming({ left: -4, right: 2, bottom: -2, top: 3 }, { left: -2, right: 2, bottom: -2, top: 1 })
assert.equal(optical.x, 1, 'the complete card-and-title silhouette is horizontally centered')
assert.equal(optical.y, -.5, 'the complete silhouette is vertically centered')
for (const x of [-4, 2]) assert.ok(Math.abs(x + optical.x) <= optical.halfWidth)
for (const y of [-2, 3]) assert.ok(Math.abs(y + optical.y) <= optical.halfHeight)
console.log('PASS: optical title centring retains all fan edges inside the fit')

assert.equal(JACK_CARRIERS.length, 4)
assert.equal(new Set(JACK_CARRIERS.map(card => card.width)).size, 1, 'all four Jacks have identical physical dimensions')
for (let i = 0; i < 4; i++) {
  assert.equal(jackDealAt(-1, i).progress, 0)
  assert.deepEqual(jackDealAt(1.5, i), { progress: 1, turn: 0, settle: 0, flip: 0, moving: false })
  const cue = [JACK_COMPOSITION.jkTJack, JACK_COMPOSITION.jkTOf, JACK_COMPOSITION.jkTAll, JACK_COMPOSITION.jkTTrades][i]
  const [col, row] = JACK_GRID_CENTRES[i]
  assert.ok(Math.abs(jackWallRevealAt(cue, col, row) - .5) < 1e-10, 'each word begins at its source background card’s edge-on conversion')
  assert.ok(jackWallRevealAt(cue + .25, col, row) > .999, 'shared reveal completes without another independent full flip')
  assert.ok(cue + 1.2 - i * .08 <= 3.5, 'title completes within the workspace replay')
  assert.ok(Math.cos(jackDealAt(0, i).flip) < -0.99, 'carrier enters back-first')
  let previous = 0
  for (let t = 0; t < 1; t += 0.001) {
    const pose = jackDealAt(t, i)
    assert.ok(pose.progress >= previous - 1e-12)
    assert.ok(Math.abs(pose.progress - previous) < 0.004)
    assert.ok(Number.isFinite(pose.turn))
    previous = pose.progress
  }
}
console.log('PASS: four deterministic card/word deals, smooth travel and exact settled pose')

for (let i = 0; i < 3; i++) {
  assert.ok(Math.abs(jackStormAt(0, i).x) > 1.39)
  assert.ok(Math.abs(jackStormAt(1, i).x) > 1.39)
  for (const u of [0, 0.1, 0.5, 0.9, 1]) {
    const pose = jackStormAt(u, i)
    assert.ok(Object.values(pose).every(Number.isFinite))
    assert.deepEqual(pose, jackStormAt(u, i))
    if (u === 0 || u === 1) assert.ok(Math.max(Math.abs(pose.x), Math.abs(pose.y)) >= 1.39, 'loose cards cross an offscreen boundary')
  }
}
console.log('PASS: three deterministic accent-card passes, with no packet/emitter')

for (let i = 0; i < 4; i++) {
  assert.deepEqual(jackCrossingOffset(0, i, -8, 6, 0.3, -0.4), { x: -8, y: 6 })
  const end = jackCrossingOffset(1, i, -8, 6, 0.3, -0.4)
  assert.ok(Math.hypot(end.x, end.y) < 1e-12)
  const before = jackCrossingOffset(.5 - 1e-6, i, -8, 6, .3, -.4)
  const after = jackCrossingOffset(.5 + 1e-6, i, -8, 6, .3, -.4)
  assert.ok(Math.hypot(before.x - after.x, before.y - after.y) < 0.0001, 'no jump at the central pass')
}
console.log('PASS: crossing lanes retain offscreen starts, continuous pass and exact final placement')
