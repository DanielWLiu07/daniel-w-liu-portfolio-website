/**
 * Is this actually an eye?
 *
 * A drawn eye has rules, and they are the ones that separate it from a leaf:
 *   the two corners do not move when it opens
 *   the lids never cross: the upper is above the lower everywhere, always
 *   shut means shut: zero aperture at open 0, and a CURVE rather than a line
 *   opening is monotonic, so no part of the eye closes while the rest opens
 *   the iris is cropped by both lids at rest, which is what stops it staring
 *   the gaze never takes the iris outside the aperture, however far the target
 *   a blink is asymmetric, and the eye always comes back to fully open
 *
 * An eye whose iris floats clear of both lids renders perfectly and reads as
 * panic. An eye whose corners drift as it opens reads as a mouth.
 *
 *   npx tsx scripts/check-eye.ts
 */
import {
  EYE,
  EYE_EXTENT,
  EYE_PLANE,
  GLYPH,
  rayAt,
  OPEN_DEFAULTS,
  apertureAt,
  arc,
  baseline,
  blinkShape,
  blinkStart,
  insideEye,
  irisAt,
  lowerLid,
  lowerReach,
  openAt,
  EYE_INKS,
  gazeFor,
  inkFor,
  irisTravel,
  scatterEyes,
  skew,
  upperLid,
  upperReach,
} from '../components/resume/casino/eye'

const fail: string[] = []
const N = 400
const xs = Array.from({ length: N + 1 }, (_, i) => -1 + (2 * i) / N)

// the corners hold still. Whatever the opening, x = +/-1 sits on the baseline.
for (const open of [0, 0.13, 0.5, 0.87, 1]) {
  for (const x of [-1, 1]) {
    if (Math.abs(upperLid(x, open) - baseline(x)) > 1e-12) fail.push(`the upper lid leaves the corner at open ${open}`)
    if (Math.abs(lowerLid(x, open) - baseline(x)) > 1e-12) fail.push(`the lower lid leaves the corner at open ${open}`)
  }
}
// and the skew, which is what moves the upper lid's apex, must not move them
for (const x of [-1, 1]) if (Math.abs(skew(x, EYE.upperSkew) - x) > 1e-12) fail.push('the skew moves a corner')

// the lids never cross
for (let o = 0; o <= 40; o++) {
  const open = o / 40
  for (const x of xs) {
    if (lowerLid(x, open) > upperLid(x, open) + 1e-12) {
      fail.push(`the lids cross at x ${x.toFixed(3)}, open ${open.toFixed(2)}`)
      break
    }
  }
}

// shut is shut, and it is a CURVE
{
  let worst = 0
  for (const x of xs) worst = Math.max(worst, apertureAt(x, 0))
  if (worst > 1e-12) fail.push(`the eye is not shut at open 0: aperture ${worst}`)
  const sag = baseline(0) - baseline(1)
  if (Math.abs(sag) < 0.02) fail.push(`the shut eye is a straight line, sag only ${sag.toFixed(4)}`)
}

// opening is monotonic everywhere
for (const x of xs) {
  let prev = -1
  for (let o = 0; o <= 40; o++) {
    const a = apertureAt(x, o / 40)
    if (a < prev - 1e-12) {
      fail.push(`the aperture shrinks while opening, at x ${x.toFixed(3)}`)
      break
    }
    prev = a
  }
}

// the upper lid does most of the work
if (!(upperReach > lowerReach)) fail.push('the lower lid moves further than the upper one')
if (EYE.upperLine <= EYE.lowerLine) fail.push('the lower lid line is not lighter than the upper one')

// the iris is cropped by BOTH lids at rest. This is the one that separates a
// drawn eye from a startled one.
{
  const top = EYE.irisY + EYE.irisR
  const bot = EYE.irisY - EYE.irisR
  if (top <= upperLid(0, 1)) fail.push(`the upper lid clears the iris by ${(upperLid(0, 1) - top).toFixed(3)}; it should cut across it`)
  if (bot >= lowerLid(0, 1)) fail.push(`the lower lid clears the iris by ${(bot - lowerLid(0, 1)).toFixed(3)}; it should cut across it`)
}

// the gaze never puts the iris outside the aperture, for any target
{
  let escaped = 0
  for (let gx = -3; gx <= 3; gx += 0.1) {
    for (let gy = -3; gy <= 3; gy += 0.1) {
      for (const open of [0.35, 0.6, 0.85, 1]) {
        const [ix, iy] = irisAt([gx, gy], open)
        // the iris's own centre must be in, and so must its left and right edges
        // at the height it sits: those are what reach the corners first
        if (!insideEye(ix, iy, open)) escaped++
        else if (Math.abs(ix) + EYE.pupilR > 1) escaped++
      }
    }
  }
  if (escaped) fail.push(`${escaped} gaze targets put the iris outside the aperture`)
}

// blinks: asymmetric, brief, and it always comes back
{
  if (blinkShape(0) !== 1 || blinkShape(1) !== 1) fail.push('a blink does not start and end fully open')
  let minAt = 0
  let min = 1
  for (let k = 0; k <= 1; k += 0.001) {
    const v = blinkShape(k)
    if (v < min) {
      min = v
      minAt = k
    }
  }
  if (min > 1e-9) fail.push(`a blink never actually shuts: minimum ${min.toFixed(4)}`)
  if (minAt > 0.45) fail.push(`the lid takes ${(minAt * 100).toFixed(0)} percent of the blink to drop; it should fall faster than it lifts`)

  // over a long run the eye is open nearly all the time and always returns
  let shutFor = 0
  const step = 1 / 240
  for (let t = 0; t < 120; t += step) if (openAt(t) < 0.5) shutFor += step
  const pct = (100 * shutFor) / 120
  if (pct > 8) fail.push(`the eye is shut ${pct.toFixed(1)} percent of the time, which is a stutter and not blinking`)
  if (Math.abs(openAt(119.999) - 1) > 1e-6 && openAt(119.999) < 0.999) {
    // fine to be mid blink at an arbitrary instant, but it must reach 1 often
  }
  let reached = 0
  for (let t = 5; t < 60; t += 0.05) if (openAt(t) > 0.999) reached++
  if (reached < 500) fail.push('the eye rarely reaches fully open')

  // blinks are spaced, never on top of each other
  for (let n = 0; n < 40; n++) {
    const gap = blinkStart(n + 1) - blinkStart(n)
    if (gap < OPEN_DEFAULTS.blink * 3) fail.push(`blinks ${n} and ${n + 1} are only ${gap.toFixed(2)}s apart`)
  }
  // and that holds for any phase, not just the default one
  for (const phase of [0.13, 0.4, 0.77, 0.95]) {
    const o = { ...OPEN_DEFAULTS, phase }
    for (let n = 0; n < 30; n++) {
      if (blinkStart(n + 1, o) - blinkStart(n, o) < OPEN_DEFAULTS.blink * 3) {
        fail.push(`at phase ${phase} two blinks land on top of each other`)
        break
      }
    }
  }
}

// a FIELD does not blink in lockstep.
//
// Jitter within one eye is not enough: give every eye the same schedule offset
// only by when it arrived and any two that opened together blink in time for
// ever, which looks deliberate and is worse than no jitter at all. Each eye
// carries its own phase AND its own cadence.
{
  const eyes = scatterEyes(14, 1.78)
  if (new Set(eyes.map((e) => e.phase.toFixed(6))).size !== eyes.length) fail.push('two eyes share a blink phase')
  if (new Set(eyes.map((e) => e.every.toFixed(6))).size !== eyes.length) fail.push('two eyes share a blink cadence')
  for (const e of eyes) {
    if (e.every < OPEN_DEFAULTS.blink * 6) fail.push('an eye blinks faster than it can finish a blink')
    if (e.phase < 0 || e.phase >= 1) fail.push('a blink phase is outside 0 to 1')
  }

  // walk two minutes and count how much of it has more than one eye mid blink
  const step = 1 / 120
  let together = 0
  let anyBlink = 0
  for (let t = 3; t < 123; t += step) {
    let n = 0
    for (const e of eyes) if (openAt(t - e.delay, { phase: e.phase, every: e.every }) < 0.6) n++
    if (n > 0) anyBlink += step
    if (n > 1) together += step
  }
  const overlap = anyBlink > 0 ? (100 * together) / anyBlink : 0
  console.log(
    `     of the time some eye is blinking, ${overlap.toFixed(1)} percent has more than one doing it at once`,
  )
  // some overlap is inevitable with fourteen of them and is not a fault; what
  // would be a fault is them moving together, which shows up as a high number
  if (overlap > 35) fail.push(`the field blinks together ${overlap.toFixed(0)} percent of the time`)
}

// the iris travels on an OVAL, not in a box. This is the difference between a
// pupil that sweeps a circle when the cursor goes round one and a pupil that
// traces a square, pausing at four corners and running dead straight between.
{
  const open = 1
  const r = irisTravel(open)
  let offEllipse = 0
  let worstDiag = 0
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 60) {
    // a target far outside the travel, so it always pins to the boundary
    const [ix, iy] = irisAt([Math.cos(a) * 40, Math.sin(a) * 40], open)
    const e = Math.hypot(ix / r.x, (iy - EYE.irisY) / r.y)
    if (Math.abs(e - 1) > 1e-9) offEllipse++
  }
  if (offEllipse) fail.push(`${offEllipse} of the pinned iris positions are not on the travel ellipse`)

  // the decisive one: a box clamp puts the 45 degree case at the CORNER, with
  // both axes maxed. An ellipse must pull it in on both.
  const [dx, dy] = irisAt([40, 40], open)
  if (Math.abs(dx) >= r.x - 1e-9) fail.push('a diagonal target reaches the full sideways travel, so the region is a box')
  if (Math.abs(dy - EYE.irisY) >= r.y - 1e-9) fail.push('a diagonal target reaches the full vertical travel, so the region is a box')
  worstDiag = Math.abs(dx) / r.x
  if (worstDiag > 0.95) fail.push(`the diagonal barely comes in: ${worstDiag.toFixed(3)} of the axis`)

  // and inside the oval the target is followed exactly rather than clamped
  const [sx, sy] = irisAt([r.x * 0.3, r.y * 0.3], open)
  if (Math.abs(sx - r.x * 0.3) > 1e-9 || Math.abs(sy - EYE.irisY - r.y * 0.3) > 1e-9) {
    fail.push('a target inside the travel is not followed exactly')
  }
  // the oval is wider than it is tall, the way an eye actually moves
  if (!(r.x > r.y)) fail.push('the iris travels as far up as sideways')
}

// the inks: every eye gets one, the list is used evenly, and neighbours differ
{
  if (new Set(EYE_INKS).size !== EYE_INKS.length) fail.push('the ink list repeats')
  const seen = new Set<string>()
  for (let i = 0; i < EYE_INKS.length; i++) seen.add(inkFor(i))
  if (seen.size !== EYE_INKS.length) fail.push(`the first ${EYE_INKS.length} eyes only use ${seen.size} of the inks`)
  for (let i = 0; i < 60; i++) if (inkFor(i) === inkFor(i + 1)) fail.push(`eyes ${i} and ${i + 1} share an ink`)
}

// the FIELD: eyes are spread, on screen, and each one looks at the cursor from
// where IT is.
for (const [count, aspect] of [[6, 1.6], [14, 1.78], [24, 1.4], [40, 2.2]] as const) {
  const eyes = scatterEyes(count, aspect)
  if (eyes.length !== count) fail.push(`asked for ${count} eyes, got ${eyes.length}`)

  // all of them on screen, drawn eye and all
  for (const e of eyes) {
    // the whole glyph has to be on screen, rays and all, not just the almond
    if (Math.abs(e.x) + EYE_EXTENT.x * e.scale > aspect + 1e-9) fail.push(`a glyph runs off the side at count ${count}`)
    if (Math.abs(e.y) + EYE_EXTENT.y * e.scale > 1 + 1e-9) fail.push(`a glyph runs off the top or bottom at count ${count}`)
    if (e.scale <= 0) fail.push('an eye has no size')
  }

  // no two eyes sit on top of each other. Compared as the ellipses they are
  // drawn as, because comparing bounding boxes on a field this tilted would
  // reject layouts that are visually fine.
  let clashes = 0
  for (let i = 0; i < eyes.length; i++) {
    for (let j = i + 1; j < eyes.length; j++) {
      const a = eyes[i], b = eyes[j]
      const rx = (a.scale + b.scale) * EYE_EXTENT.x
      const ry = (a.scale + b.scale) * EYE_EXTENT.y
      const dx = (a.x - b.x) / rx
      const dy = (a.y - b.y) / ry
      if (dx * dx + dy * dy < 1) clashes++
    }
  }
  if (clashes) fail.push(`${clashes} pairs of eyes overlap at count ${count}`)

  // they arrive one after another, and every one of them arrives
  // both ends of the timing. Enough spread that it reads as a cascade rather
  // than a switch being thrown, and a hard ceiling so the whole field is up
  // quickly instead of being a sequence you sit and watch.
  const delays = eyes.map((e) => e.delay)
  if (Math.min(...delays) < 0) fail.push('an eye opens before time zero')
  const spread = Math.max(...delays) - Math.min(...delays)
  if (spread < 0.2) fail.push(`the eyes open together: only ${spread.toFixed(2)}s between the first and last`)
  if (spread > 1.4) fail.push(`the eyes are ${spread.toFixed(2)}s apart, which is a sequence and not an arrival`)
  const lastUp = Math.max(...delays) + OPEN_DEFAULTS.delay + OPEN_DEFAULTS.wake
  if (lastUp > 2.2) fail.push(`the field is not all open until ${lastUp.toFixed(2)}s`)
  for (const e of eyes) if (openAt(e.delay + 12) < 0.99) fail.push('an eye never finishes opening')
}

// the gaze is per eye. An eye LEFT of the cursor must look right, and one right
// of it must look left: this is the whole effect, and a field that shares one
// gaze fails it.
{
  const eyes = scatterEyes(14, 1.78)
  const [cx, cy] = [0.4, -0.2]
  let wrongX = 0
  let wrongY = 0
  for (const e of eyes) {
    const [gx, gy] = gazeFor(e, cx, cy)
    if (Math.abs(e.x - cx) > 0.05 && Math.sign(gx) !== Math.sign(cx - e.x)) wrongX++
    if (Math.abs(e.y - cy) > 0.05 && Math.sign(gy) !== Math.sign(cy - e.y)) wrongY++
  }
  if (wrongX) fail.push(`${wrongX} eyes look the wrong way horizontally`)
  if (wrongY) fail.push(`${wrongY} eyes look the wrong way vertically`)
  // and two eyes on opposite sides of the cursor must disagree
  const left = eyes.reduce((a, b) => (a.x < b.x ? a : b))
  const right = eyes.reduce((a, b) => (a.x > b.x ? a : b))
  if (Math.sign(gazeFor(left, 0, 0)[0]) === Math.sign(gazeFor(right, 0, 0)[0])) {
    fail.push('the leftmost and rightmost eyes look the same way at a centred cursor')
  }
  // a tilted eye still looks AT the cursor: undoing the roll is what does that
  const tilted = { x: -0.5, y: 0, scale: 0.3, roll: 0.6, delay: 0, phase: 0, every: 3.6 }
  const [tx] = gazeFor(tilted, 0.5, 0)
  if (tx <= 0) fail.push('a rolled eye does not look toward a cursor on its right')
}

// the card has to hold the whole glyph, rays included
if (EYE_PLANE.w / 2 < EYE_EXTENT.x) fail.push(`the card is ${EYE_PLANE.w / 2} wide and the glyph needs ${EYE_EXTENT.x}`)
if (EYE_PLANE.h / 2 < EYE_EXTENT.y) fail.push('the card is too short for the rays')
// every ray starts clear of the eye. On a circle the ones above and below start
// far off a shape twice as wide as it is tall, so they sit on an ELLIPSE, and
// this is what checks that ellipse actually clears the almond in every direction.
{
  const K = GLYPH.eyeScale
  for (let i = 0; i < GLYPH.rays; i++) {
    const R = rayAt(i)
    const px = R.c * R.from
    const py = R.s * R.from
    // the eye, in glyph space, at that ray's x
    const ux = px / K
    if (Math.abs(ux) < 1) {
      const lid = (py >= 0 ? upperLid(ux, 1) : lowerLid(ux, 1)) * K
      if (Math.abs(py) < Math.abs(lid) + GLYPH.line) fail.push(`ray ${i} starts on the eye`)
    }
    if (R.to <= R.from) fail.push(`ray ${i} has no length`)
  }
  // and they alternate long and short, which is what a sunburst does
  if (rayAt(0).to - rayAt(0).from === rayAt(1).to - rayAt(1).from) fail.push('every ray is the same length')
}

// arc is the thing every lid is built from, so it had better behave
if (arc(0) !== 1 || arc(1) !== 0 || arc(-1) !== 0 || arc(2) !== 0) fail.push('the arc profile is wrong at its ends')

if (fail.length) {
  console.error('FAIL')
  for (const f of fail) console.error('  ' + f)
  process.exit(1)
}
const shutPct = (() => {
  let s = 0
  for (let t = 0; t < 120; t += 1 / 240) if (openAt(t) < 0.5) s += 1 / 240
  return (100 * s) / 120
})()
console.log(
  'OK: the corners hold still, the lids never cross, shut is shut and is a curve, opening is monotonic, ' +
    'both lids crop the iris, no gaze puts the iris outside the aperture, a blink falls faster than it lifts, ' +
    'the iris travels on an oval rather than in a box, and in a field every eye is on screen, clear of its ' +
    'neighbours, takes its own ink and its own blink rhythm, and looks at the cursor from where it is.',
)
console.log(
  `     aperture ${EYE.height} tall on a width of 2, upper lid ${(upperReach).toFixed(3)} against the lower ${(lowerReach).toFixed(3)}, ` +
    `shut ${shutPct.toFixed(1)} percent of the time.`,
)
