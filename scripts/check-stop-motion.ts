/**
 * Is this actually stop motion?
 *
 * Three properties, and each one is the difference between paper on an animation
 * stand and a computer pretending:
 *   the clock STEPS and HOLDS: one value per exposure, never between
 *   it SLIDES ON in steps: a handful of discrete places, not a glide
 *   it SETTLES: it goes past the mark and comes back
 *   it is STILL once it lands: the boil is what a hand does while it is moving
 *   the piece, so nothing may tremble after it has been put down
 *   it POPS: a reveal is on or off, never part way
 *
 *   npx tsx scripts/check-stop-motion.ts
 */
import { SM_DEFAULTS, WORD_DEFAULTS, boilAt, popAt, settle, slideAt, smFrame, smTime, LANDINGS, SLIDE_CHART, chartAt, chartFor, landingFor, placeAt, placeFor, wordAt, wordGroups, wordOf, wordShot } from '../components/resume/casino/stop-motion'
import { TUNE_DEFAULTS } from '../components/resume/casino/tune'
import { offscreenWordOffset } from '../components/resume/casino/stop-motion'

const fail: string[] = []
const { fps } = SM_DEFAULTS

// the clock steps, and holds between steps
{
  const seen = new Set<number>()
  let jumps = 0
  let prev = smTime(0, fps)
  for (let i = 0; i <= 60000; i++) {
    const t = i / 1000
    const v = smTime(t, fps)
    seen.add(Number(v.toFixed(6)))
    if (v !== prev) {
      // every jump is exactly one exposure
      if (Math.abs(v - prev - 1 / fps) > 1e-9) fail.push(`the clock jumped ${(v - prev).toFixed(4)}s, not ${(1 / fps).toFixed(4)}`)
      jumps++
      prev = v
    }
    // and it never runs ahead of the wall clock
    if (v > t + 1e-9) fail.push('the stepped clock is ahead of real time')
    if (t - v > 1 / fps + 1e-9) fail.push('the stepped clock has fallen more than one exposure behind')
  }
  // 60 seconds at 12 a second
  if (jumps !== 60 * fps) fail.push(`60 seconds produced ${jumps} exposures, expected ${60 * fps}`)
  if (seen.size !== 60 * fps + 1) fail.push(`the clock took ${seen.size} distinct values over 60s`)
}

// smFrame holds an exposure for its whole length: this is what "on twos" means
{
  for (const f of [0, 1, 7, 143]) {
    const start = f / fps
    if (smFrame(start, fps) !== f) fail.push(`exposure ${f} does not begin at its own time`)
    if (smFrame(start + 0.5 / fps, fps) !== f) fail.push(`exposure ${f} does not hold through its middle`)
    if (smFrame(start + 1 / fps, fps) !== f + 1) fail.push(`exposure ${f} does not end on time`)
  }
}

// it boils: bounded, deterministic, and never in step
{
  for (let s = 0; s < 40; s++) {
    for (let f = 0; f < 40; f++) {
      const b = boilAt(s, f)
      for (const [k, v] of Object.entries(b)) {
        if (!Number.isFinite(v)) fail.push(`boil ${k} is not a number`)
        if (Math.abs(v) > 0.5 + 1e-9) fail.push(`boil ${k} left its range at seed ${s} frame ${f}`)
      }
      // deterministic
      const again = boilAt(s, f)
      if (again.x !== b.x || again.y !== b.y || again.turn !== b.turn) fail.push('the boil is not deterministic')
    }
  }
  // no element repeats itself on the next exposure
  let still = 0
  for (let s = 0; s < 40; s++) {
    for (let f = 0; f < 60; f++) {
      const a = boilAt(s, f)
      const b = boilAt(s, f + 1)
      if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6) still++
    }
  }
  if (still) fail.push(`${still} elements did not move between exposures`)
  // and no two elements tremble together, which would read as a shake
  let together = 0
  for (let f = 0; f < 60; f++) {
    for (let s = 0; s < 20; s++) {
      for (let s2 = s + 1; s2 < 20; s2++) {
        const a = boilAt(s, f)
        const b = boilAt(s2, f)
        if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6) together++
      }
    }
  }
  if (together) fail.push(`${together} pairs of elements trembled identically`)
  // the wobble has to actually spread, or it is not a boil
  const xs: number[] = []
  for (let f = 0; f < 400; f++) xs.push(boilAt(3, f).x)
  const spread = Math.max(...xs) - Math.min(...xs)
  if (spread < 0.85) fail.push(`the boil only covers ${spread.toFixed(2)} of its range`)
}

// it SLIDES ON IN STEPS, which is the whole point: a cut-out is nudged along
// between exposures and lands in a handful of places on the way, it does not
// glide. Six exposures across half a second.
{
  const { fps, travel } = SM_DEFAULTS
  const cue = 2
  const seen = new Set<string>()
  for (let i = 0; i <= 8000; i++) {
    const t = cue - 0.2 + (i / 8000) * (travel + 0.4)
    seen.add(slideAt(t, cue, travel, fps).k.toFixed(6))
  }
  // travel * fps steps, plus the 0 before and the 1 after
  const want = Math.round(travel * fps) + 1
  if (seen.size > want + 1) fail.push(`the slide took ${seen.size} distinct positions, which is a glide and not ${want} steps`)
  if (seen.size < 4) fail.push(`the slide only had ${seen.size} positions, too few to read as steps`)

  // it starts at the cue and ends exactly home
  if (slideAt(cue - 0.001, cue, travel, fps).k !== 0) fail.push('the slide starts before its cue')
  if (slideAt(cue + travel, cue, travel, fps).k !== 1) fail.push('the slide does not finish exactly home')
  if (slideAt(cue + travel + 5, cue, travel, fps).k !== 1) fail.push('the slide does not stay home')

  // it OVERSHOOTS: a hand pushes past the mark and pulls back
  let over = 0
  for (let i = 0; i <= 2000; i++) {
    const k = slideAt(cue + (i / 2000) * travel, cue, travel, fps).k
    if (k > 1.0001) over++
  }
  if (!over) fail.push('the slide never goes past its mark, which is a computer easing into place')
  if (Math.max(...[0.6, 0.7, 0.8, 0.9].map((u) => settle(u))) <= 1) fail.push('settle never exceeds 1')

  // and it is STILL once it lands. This is the "no idle animation" rule: the
  // boil hangs off `moving`, so nothing may be handled after it is put down.
  if (slideAt(cue + travel, cue, travel, fps).moving) fail.push('an element is still being handled after it has landed')
  if (slideAt(cue + travel + 10, cue, travel, fps).moving) fail.push('an element never stops being handled')
  if (slideAt(cue - 1, cue, travel, fps).moving) fail.push('an element is being handled before its cue')
  let movingFor = 0
  const step = 1 / 240
  for (let t = cue - 1; t < cue + 6; t += step) if (slideAt(t, cue, travel, fps).moving) movingFor += step
  if (movingFor > travel + 1 / fps) fail.push(`an element is handled for ${movingFor.toFixed(2)}s, longer than its ${travel}s travel`)
}

// it pops: on or off, never part way, and it turns on at the right exposure
{
  for (let i = 0; i <= 4000; i++) {
    const t = i / 400
    const v = popAt(t, 1.5, fps)
    if (v !== 0 && v !== 1) fail.push(`the reveal came out at ${v}, which is a fade`)
  }
  if (popAt(1.49, 1.5, fps) !== 0) fail.push('the reveal is on before its cue')
  // it lands on the first exposure at or past the cue, not on the wall clock
  const cue = 1.5
  let onAt = -1
  for (let i = 0; i <= 4000; i++) {
    const t = i / 400
    if (popAt(t, cue, fps) === 1) {
      onAt = smTime(t, fps)
      break
    }
  }
  if (Math.abs(onAt - cue) > 1e-9) fail.push(`the reveal landed at ${onAt}, not on the exposure at ${cue}`)
}

const assert = (cond: boolean, msg: string) => { if (!cond) fail.push(msg) }

/**
 * Words, as whole scraps, and the chart they are shot on.
 *
 * The point of this block is the SPACING. A stepped clock over a smooth curve is
 * not stop motion, it is a decimated curve, and it reads as dropped frames. The
 * assertions below are the difference: no gap large enough to strobe, no run of
 * gaps mechanically even, an anticipation, an overshoot, and a rigid scrap.
 */
{
  const wm = { ...WORD_DEFAULTS }
  const FPS = 12
  const TEXT = 'ALWAYS BET ON'

  // 1. the line is cut at the spaces and nowhere else
  const gs = wordGroups(TEXT)
  assert(gs.length === 3, `"${TEXT}" is 3 scraps, got ${gs.length}`)
  assert(gs[0].idx.length === 6 && gs[1].idx.length === 3 && gs[2].idx.length === 2, 'the scraps are ALWAYS / BET / ON')
  const of = wordOf(TEXT)
  assert(of[6] === -1 && of[10] === -1, 'the spaces belong to no word')

  // 2. THE CHART. Every claim about the spacing, checked against the data.
  const gaps = SLIDE_CHART.slice(1).map((v, i) => v - SLIDE_CHART[i])
  const widest = Math.max(...gaps.map(Math.abs))
  assert(SLIDE_CHART[0] === 0, 'the chart starts at the mark it is measured from')
  assert(SLIDE_CHART[1] < 0, 'a hand pulls the scrap back before it pushes it: pose 1 is the anticipation')
  // the carry past the mark is NOT in the chart any more: see 3b, it is the landing
  assert(widest <= 0.22, `no pose may jump more than a fifth of the travel or it strobes: widest is ${(widest * 100).toFixed(0)}%`)
  // and the gaps must NOT shrink monotonically, which is what a sampled ease
  // curve does and what reads mechanical
  const fwd = gaps.slice(1)
  let monotonic = true
  for (let i = 1; i < fwd.length; i++) if (fwd[i] > fwd[i - 1] + 1e-9) monotonic = false
  assert(!monotonic, 'evenly shrinking gaps are a decimated curve, not an animator chart')

  // 3. the whole reason for the chart, as a regression guard. The pass that
  //    sampled easeOutBack at this rate put 64.5% of the travel into a single
  //    exposure, about two letter widths, and that is what read as lag.
  const JUDDER = 0.645
  assert(widest < JUDDER / 3, `the widest gap must be well under the ${(JUDDER * 100).toFixed(0)}% that juddered, got ${(widest * 100).toFixed(0)}%`)

  /**
   * 3b. THE LANDING: a correction is the SAME SIZE AS A REGULAR MOVE.
   *
   * This is the invariant, and it has been got wrong twice in opposite
   * directions. Overshoot poses inside the chart (0.99, 1.04, 0.99, 1.00) are
   * steps of .07, .05, -.05, .01 against regular moves of .16: a quarter the
   * size, so a tremor. Replacing them with a fixed absolute nudge was worse,
   * because a word that travels four times as far then corrects itself by 13% of
   * its own movement. Either way the failure is the same: a move far smaller than
   * the moves around it, which reads as jitter rather than as a hand.
   *
   * So the test is a RATIO, not an absolute, and it is the one that catches both.
   */
  const approach = SLIDE_CHART.slice(1).map((v, i) => v - SLIDE_CHART[i]).slice(1)
  const regular = [...approach].sort((x, y) => x - y)[Math.floor(approach.length / 2)]
  assert(SLIDE_CHART[SLIDE_CHART.length - 1] < 1, 'the approach stops SHORT: the move onto the mark belongs to the landing')
  for (const L of LANDINGS) {
    // every step of the full placement, the final move onto the mark included
    const full = [SLIDE_CHART[SLIDE_CHART.length - 1], ...L, 1]
    const steps = full.slice(1).map((v, i) => Math.abs(v - full[i]))
    for (const st of steps) {
      assert(st > 0, 'every correction changes pose')
      assert(st <= regular * 1.75, `a correction of ${(st / regular * 100).toFixed(0)}% of a regular move would strobe`)
    }
    if (L.length) assert(Math.max(...L) > 1, 'a correcting landing carries past the mark')
  }
  for (const L of LANDINGS) {
    assert(L.length >= 3 && L.length <= 5, 'each word gets a short in-place settle')
    for (let i = 1; i < L.length; i++) {
      assert((L[i] - 1) * (L[i - 1] - 1) < 0, 'corrections alternate around home')
      assert(Math.abs(L[i] - 1) < Math.abs(L[i - 1] - 1), 'corrections decay towards rest')
    }
    assert(Math.abs(L[L.length - 1] - 1) <= 0.0251, 'last correction is small before the exact lock')
  }
  for (let seed = 0; seed < 7; seed++) {
    for (let w = 0; w < 5; w++)
      assert(
        JSON.stringify(landingFor(seed, w)) !== JSON.stringify(landingFor(seed, w + 1)),
        `words ${w} and ${w + 1} must land differently at seed ${seed}`,
      )

  }

  /**
   * 3c. and it holds at ANY travel, which is the point of stating it as a ratio.
   * A word coming in from 6 units and one from 1.2 must both correct themselves
   * by the same share of their own movement.
   */
  {
    const wmA = { ...WORD_DEFAULTS }
    const land = LANDINGS[1]
    const ratio = (ox: number) => {
      const sh = { cue: 0, ox, oy: 0, turn: 0.2, side: 1 }
      const xs: number[] = []
      for (let f = 0; f <= 40; f++) xs.push(wordAt(f / FPS, sh, wmA, FPS, 0, land).x)
      const steps = xs.slice(1).map((v, i) => Math.abs(v - xs[i])).filter((v) => v > 1e-9)
      const big = Math.max(...steps)
      // the correction is the last real step
      const lastStep = steps[steps.length - 1]
      return lastStep / big
    }
    const a2 = ratio(-1.2)
    const b2 = ratio(-6.0)
    assert(Math.abs(a2 - b2) < 1e-6, `the correction must be the same share of the move at any travel: ${a2.toFixed(3)} vs ${b2.toFixed(3)}`)
    assert(a2 > 0 && a2 < 0.15, 'the final correction is a small settle, not another arrival')
  }

  /** 3d. locks cluster closely without all snapping still on one exposure */
  {
    const wmB = { ...WORD_DEFAULTS }
    const stops = [0, 1, 2].map((w) => {
      const sh = wordShot(w, 3, wmB, 11)
      const land = landingFor(11, w)
      let last = -1
      for (let f = 0; f <= 80; f++) if (wordAt(f / FPS, sh, wmB, FPS, 0, land).moving) last = f
      return last
    })
    assert(new Set(stops).size > 1, `the words should not all lock together, got ${stops.join(', ')}`)
    assert(Math.max(...stops) - Math.min(...stops) <= 4, 'the final locks stay within four exposures')
    assert(placeFor(FPS, 1, []) < placeFor(FPS, 1, LANDINGS[5]), 'a fussed-over scrap takes longer than a clean one')
  }

  // 4. poses advance one per exposure, hold when held, and STOP
  const c0 = chartAt(0, 0, FPS, 1)
  assert(c0.pose === 0 && c0.k === 0, 'the cue is pose 0')
  for (let f = 0; f < SLIDE_CHART.length - 1; f++) {
    const c = chartAt(f / FPS, 0, FPS, 1)
    assert(c.pose === f, `exposure ${f} is pose ${f}, got ${c.pose}`)
    assert(c.k === SLIDE_CHART[f], `pose ${f} sits where the chart says`)
    assert(c.moving, `pose ${f} is still in hand`)
  }
  const done = placeAt(placeFor(FPS, 1, LANDINGS[1]) + 5, 0, FPS, 1, LANDINGS[1])
  assert(done.k === 1 && !done.moving, 'and after the last pose it is down and out of hand')
  // the pose it actually lands on carries no hand error, so nothing twitches on it
  const onMark = placeAt((SLIDE_CHART.length + LANDINGS[1].length) / FPS, 0, FPS, 1, LANDINGS[1])
  assert(onMark.k === 1 && !onMark.moving, 'the frame it lands on is exact and unhandled')
  // step holds each pose, without resampling
  const held = chartAt(1 / FPS, 0, FPS, 2)
  assert(held.pose === 0, 'at step 2 the first pose is held for two exposures')
  assert(chartAt(2 / FPS, 0, FPS, 2).pose === 1, 'and the second begins on the third exposure')
  assert(Math.abs(chartFor(FPS, 2) - 2 * chartFor(FPS, 1)) < 1e-9, 'step 2 takes twice as long')

  // 5. a word is ONE RIGID SCRAP: every letter reads the same pose
  const shot0 = wordShot(0, 3, wm, 7)
  for (let f = 0; f <= 30; f++) {
    const a = wordAt(f / FPS, shot0, wm, FPS)
    const b = wordAt(f / FPS, shot0, wm, FPS)
    assert(a.x === b.x && a.y === b.y && a.turn === b.turn, 'the letters of a word share one transform')
  }

  // 6. it arrives TURNED and straightens to exactly square, after it lands
  const atCue = wordAt(shot0.cue, shot0, wm, FPS)
  assert(Math.abs(atCue.turn) > 0.05, `a word comes in off square, got ${atCue.turn.toFixed(3)} rad`)
  let slideDone = -1
  let turnDone = -1
  for (let f = 0; f <= 120; f++) {
    const m = wordAt(f / FPS, shot0, wm, FPS)
    if (slideDone < 0 && f > 0 && Math.hypot(m.x, m.y) < 1e-9) slideDone = f
    if (turnDone < 0 && f > 0 && Math.abs(m.turn) < 1e-9) turnDone = f
  }
  assert(slideDone > 0 && turnDone > 0, 'both the slide and the turn have to finish')
  assert(turnDone > slideDone, `the turn drags behind the slide: slide home on ${slideDone}, turn on ${turnDone}`)
  const landed = wordAt(shot0.cue + chartFor(FPS, wm.step) + (wm.drag + 2) / FPS, shot0, wm, FPS)
  assert(Math.abs(landed.x) < 1e-9 && Math.abs(landed.y) < 1e-9 && Math.abs(landed.turn) < 1e-9, 'and it ends exactly on its mark, square')
  assert(!landed.moving, 'and out of hand')

  // 7. it OVERSHOOTS on the way
  let past = false
  const land0 = LANDINGS[1]
  for (let f = 0; f <= 60; f++) {
    const m = wordAt(f / FPS, shot0, wm, FPS, 0, land0)
    if (m.x * shot0.ox + m.y * shot0.oy < -1e-6) past = true
  }
  assert(past, 'a word given an overshooting landing goes past its mark and is pulled back')

  // 8. the path BOWS: a hand does not move a thing down a rail
  const reach = Math.hypot(shot0.ox, shot0.oy)
  let worstOff = 0
  for (let f = 0; f <= 40; f++) {
    const m = wordAt(f / FPS, shot0, wm, FPS)
    worstOff = Math.max(worstOff, Math.abs(m.x * (shot0.oy / reach) - m.y * (shot0.ox / reach)))
  }
  assert(worstOff > reach * 0.05, `the path has to bow off the straight line, peak ${worstOff.toFixed(3)}`)

  // 9. the words are set down left to right, from alternating sides
  const cues = [0, 1, 2].map((w) => wordShot(w, 3, wm, 7).cue)
  assert(cues[0] < cues[1] && cues[1] < cues[2], `words are set down left to right, got ${cues.join(', ')}`)
  const s1 = wordShot(1, 3, wm, 7)
  const s2 = wordShot(2, 3, wm, 7)
  assert(shot0.turn * s1.turn < 0, 'neighbouring words lean opposite ways')
  /**
   * And each comes in from the edge nearest its own place, so no word ploughs
   * through where another one already sits. Word 0 belongs at the left, so it
   * has to START further left; word 2 belongs at the right and starts further
   * right; the middle one barely travels at all.
   */
  assert(shot0.ox < 0, `the leftmost word comes from the left, got ox ${shot0.ox.toFixed(2)}`)
  assert(s2.ox > 0, `the rightmost word comes from the right, got ox ${s2.ox.toFixed(2)}`)
  const d0 = Math.hypot(shot0.ox, shot0.oy)
  const d1 = Math.hypot(s1.ox, s1.oy)
  const d2 = Math.hypot(s2.ox, s2.oy)
  assert(d1 < d0 && d1 < d2, `a word that belongs in the middle is nudged, not carried in: ${d1.toFixed(2)} vs ${d0.toFixed(2)}/${d2.toFixed(2)}`)
  // over a longer line every word still starts outboard of where it lands
  for (let w = 0; w < 6; w++) {
    const sw = wordShot(w, 6, wm, 3)
    const out = (w / 5 - 0.5) * 2
    if (Math.abs(out) > 0.15) assert(sw.ox * out > 0, `word ${w} of 6 has to start outboard of its own place`)
  }

  // 10. reproducible
  assert(JSON.stringify(wordShot(1, 3, wm, 7)) === JSON.stringify(wordShot(1, 3, wm, 7)), 'a shot is deterministic')
  assert(JSON.stringify(wordShot(1, 3, wm, 7)) !== JSON.stringify(wordShot(1, 3, wm, 12)), 'two lines are cut differently')
}

// Jack now shares the title's word engine: all four words must finish before lift-off.
// Full word bounds, not just the pivot, must begin beyond the viewport.
for (const [halfW, halfH] of [[6, 2], [2, 6], [3, 3]]) {
  for (const radius of [0.2, 1.5, 4]) {
    for (const side of ['left', 'top', 'right', 'bottom'] as const) {
      const x = 0.6, y = -0.4
      const d = offscreenWordOffset(side, x, y, radius, halfW, halfH)
      const outside = side === 'left' ? x + d.x + radius < -halfW
        : side === 'right' ? x + d.x - radius > halfW
        : side === 'top' ? y + d.y - radius > halfH : y + d.y + radius < -halfH
      if (!outside) fail.push(`${side} entry clips into ${halfW}x${halfH} before it moves`)
    }
  }
}
{
  const t = TUNE_DEFAULTS
  const wm = { beat: t.wdBeat, step: t.wdStep, from: t.wdFrom, turn: t.wdTurn, swing: t.wdSwing, drag: t.wdDrag, dir: t.wdDir, hand: t.wdHand }
  const locks = [t.jkTJack, t.jkTOf, t.jkTAll, t.jkTTrades].map((at, w) =>
    at + w * wm.beat + (SLIDE_CHART.length + landingFor(11, w).length + wm.drag) * wm.step / t.smFps,
  )
  if (Math.max(...locks) - Math.min(...locks) > 0.3) fail.push('Jack final locks must cluster within 0.3 seconds')
  ;[t.jkTJack, t.jkTOf, t.jkTAll, t.jkTTrades].forEach((at, w) => {
    const shot = wordShot(w, 4, wm, 11)
    const pose = wordAt(t.jkFlick - 0.2 - at, shot, wm, t.smFps, 0, landingFor(11, w))
    if (pose.moving || Math.abs(pose.x) + Math.abs(pose.y) + Math.abs(pose.turn) > 1e-9) {
      fail.push(`Jack word ${w} must be fully settled at least 0.2 seconds before the coin launches`)
    }
  })
}

if (fail.length) {
  console.error('FAIL')
  for (const f of fail) console.error('  ' + f)
  process.exit(1)
}
console.log(
  `OK: the clock steps ${fps} times a second and holds between; an element slides on in ` +
    `${Math.round(SM_DEFAULTS.travel * fps)} steps, overshoots, settles home exactly and is then STILL; ` +
    `the boil never outlives the move; and a reveal is on or off with no value in between.`,
)
console.log(
  'OK: the poses are AUTHORED, not sampled, and no gap is big enough to strobe. The correction at the\n' +
    '    end overshoots then decays through short alternating corrections; every word locks exactly\n' +
    '    at home, with no idle motion.',
)
