/**
 * Stop motion, as a clock and a wobble.
 *
 * The ransom title is paper cut-outs, which is the medium cutout animation is
 * actually MADE of, so the thing to reach for is not an effect laid over the
 * motion but the way that motion is recorded.
 *
 * Three properties do all the work, and they are what this module is:
 *
 *   IT IS SHOT ON A LOW FRAME RATE. Twelve a second, "on twos" from
 *   twenty four, is the classic. Everything driven off a stepped clock moves in
 *   discrete jumps and HOLDS between them; smooth interpolation at sixty is the
 *   single thing that says computer.
 *
 *   IT MOVES IN STEPS. A cut-out is nudged along a little between exposures, so
 *   a thing arriving on the page does not glide, it lands in a handful of
 *   discrete places on the way. Six of them across half a second is the whole
 *   effect, and it is the ENTRANCE that carries it: this is what he meant by
 *   stop motion, not a permanent tremble.
 *
 *   IT SETTLES RATHER THAN STOPPING. The hand overshoots and brings it back, so
 *   the last exposure or two go past the mark and return. A move that decelerates
 *   perfectly into place is a computer's move.
 *
 *   IT BOILS ONLY WHILE IT IS HANDLED. A cut-out being moved is picked up and put
 *   down and never lands quite square; one that has been left alone does not move
 *   at all. A permanent boil is an idle animation, which is the opposite of what
 *   an animation stand does between shots.
 *
 *   IT POPS. Things appear between exposures. There is no such thing as a fade
 *   on an animation stand, so a reveal is on or it is off.
 *
 * Everything here is a pure function of time and a seed, so scripts/check-stop-
 * motion.ts can assert it without a renderer, and so the whole title is
 * reproducible frame for frame.
 */

export interface StopMotion {
  /** exposures per second; 12 is "on twos" from 24 */
  fps: number
  /** seconds one element takes to travel onto the page */
  travel: number
  /** how far it starts from home, in the element's own units */
  from: number
  /** how far it shifts between exposures WHILE MOVING, in the element's own units */
  boil: number
  /** and how far it turns, in radians */
  boilTurn: number
}

export const SM_DEFAULTS: StopMotion = {
  fps: 12,
  // half a second at twelve is six exposures: enough to read as steps, few
  // enough that none of them is missed
  travel: 0.5,
  from: 1.6,
  boil: 0.05,
  boilTurn: 0.06,
}

/** which exposure we are on. Floor, not round: an exposure is HELD until the next one. */
export const smFrame = (t: number, fps: number) => Math.floor(Math.max(0, t) * fps)

/** the time that exposure was taken at, which is the clock everything should read */
export const smTime = (t: number, fps: number) => smFrame(t, fps) / fps

/**
 * A deterministic wobble for element `seed` on exposure `frame`, each component
 * in -0.5 to 0.5.
 *
 * Seeded on BOTH so two letters never tremble together and one letter never
 * repeats, which is what separates a boil from a shared shake.
 */
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}
export function boilAt(seed: number, frame: number): { x: number; y: number; turn: number } {
  return {
    x: hash(seed * 7.3 + frame * 13.1) - 0.5,
    y: hash(seed * 11.7 + frame * 17.3 + 41.3) - 0.5,
    turn: hash(seed * 19.1 + frame * 23.9 + 97.7) - 0.5,
  }
}

/**
 * A reveal, popped rather than eased.
 *
 * `at` is when this element is due; anything at or past its exposure is fully
 * on. Compared on the STEPPED clock, so a row of elements coming in on nearby
 * cues still lands them on separate exposures rather than all inside one.
 */
export const popAt = (t: number, at: number, fps: number) => (smTime(t, fps) >= at ? 1 : 0)

/**
 * Overshoot and come back.
 *
 * A hand pushing a cut-out into place goes past the mark and pulls it back; a
 * curve that decelerates perfectly into position is a computer's move. Standard
 * back-out, and at six exposures the overshoot lands on one or two of them,
 * which is exactly the nudge-and-correct a stand gives you.
 */
const OVER = 1.70158
export const settle = (u: number) => {
  const x = Math.min(1, Math.max(0, u)) - 1
  return 1 + (OVER + 1) * x * x * x + OVER * x * x
}

/**
 * An element sliding onto the page: how far along it is, and whether it is still
 * being handled.
 *
 * `k` is 0 at the cue and 1 at home, and because it reads the STEPPED clock it
 * only ever takes travel * fps + 1 values: the thing lands in that many discrete
 * places on the way in rather than gliding.
 *
 * `moving` is what the boil hangs off, so a settled element is completely still.
 */
export function slideAt(t: number, at: number, travel: number, fps: number): { k: number; moving: boolean } {
  const st = smTime(t, fps)
  if (travel <= 0) return { k: st >= at ? 1 : 0, moving: false }
  const u = (st - at) / travel
  if (u <= 0) return { k: 0, moving: false }
  if (u >= 1) return { k: 1, moving: false }
  return { k: settle(u), moving: true }
}

/**
 * THE SPACING CHART: the poses, written down.
 *
 * This is the thing the first two passes got wrong, and the mistake is worth
 * naming because it is the standard one. Taking a smooth easing curve and
 * sampling it twelve times a second is not stop motion. It is a decimated
 * continuous motion stream, and what it produces is judder: on this title the
 * first exposure covered 64.5% of the whole travel in a single frame, about two
 * letter widths, and the last four exposures moved 3% each. One teleport and
 * then a stall, which reads exactly as a page dropping frames.
 *
 * What separates animating on twos from a low frame rate is that the poses are
 * AUTHORED. An animator draws a spacing chart, decides each position by hand,
 * and the reason it does not read as lag is that no single gap is ever big
 * enough to strobe and no run of gaps is ever mechanically even. Judder is
 * on-screen displacement that is too large for the gap between frames; that is
 * a property of the SPACING, not of the frame rate.
 *
 * So the chart below is data, not a formula. Read it as fractions of the whole
 * travel, one entry per exposure:
 *
 *   -0.06  the anticipation. The hand pulls the scrap back before it pushes it.
 *    0.14  the push: .20, then .19
 *    0.33
 *    0.49  and now uneven on purpose: .16, then .19, then .11, then .13. A run
 *    0.68  of evenly shrinking gaps is a sampled ease curve, and it is what
 *    0.79  reads mechanical.
 *    0.92
 *    0.99
 *    1.04  past the mark
 *    0.99  pulled back too far, which is what a hand does
 *    1.00  and set down.
 *
 * The widest gap is 20% of the travel. At the default distance that is about a
 * third of a letter width between exposures, against the 64.5% (two letter
 * widths in a single frame) that the sampled curve produced and that read as the
 * page dropping frames.
 * Speed is set the way a shoot sets it: by holding each pose for more exposures
 * (`step`), never by resampling the chart, because resampling it would put us
 * straight back to decimating a curve.
 */
export const SLIDE_CHART: readonly number[] = [0, -0.06, 0.14, 0.33, 0.49, 0.68, 0.79, 0.92, 0.99, 1.04, 0.99, 1.0]

/**
 * Which pose we are on, and where that pose sits.
 *
 * Poses advance one per exposure (or per `step` exposures). Before the cue it is
 * off; after the last pose it holds there forever, which is a hold, not an idle.
 */
export function chartAt(
  t: number,
  at: number,
  fps: number,
  step = 1,
  chart: readonly number[] = SLIDE_CHART,
): { k: number; pose: number; moving: boolean } {
  const f = smFrame(Math.max(0, t - at), fps)
  if (t < at) return { k: chart[0], pose: 0, moving: false }
  const pose = Math.floor(f / Math.max(1, step))
  if (pose >= chart.length - 1) return { k: chart[chart.length - 1], pose: chart.length - 1, moving: false }
  return { k: chart[pose], pose, moving: true }
}

/** how long a chart takes end to end */
export const chartFor = (fps: number, step = 1, chart: readonly number[] = SLIDE_CHART) =>
  ((chart.length - 1) * Math.max(1, step)) / fps

/**
 * A WHOLE WORD as one piece of paper.
 *
 * Everything above moves one letter at a time, which is the ransom-note read but
 * not how the medium actually works. On an animation stand a cut-out is one
 * piece, cut apart only where it has to articulate: Gilliam split a face at the
 * jaw because the jaw had to open, and left the rest of the head in one piece.
 * A word has no joint in it, so a word is one scrap, picked up and put down as a
 * unit.
 *
 * What that gives us, and what the letter mode cannot:
 *
 *   IT ARRIVES TURNED AND STRAIGHTENS. A scrap set down by hand comes in off
 *   square and is corrected. This is the whole reason to group: an angle on a
 *   single letter is a tilt, an angle on six letters at once is a hand.
 *
 *   IT TRAVELS ON AN ARC. Hand-moved things follow curved paths; a straight line
 *   between two points is the one path an arm does not take. The bow is
 *   perpendicular to the entry, zero at both ends and widest halfway.
 *
 *   THE TURN DRAGS BEHIND THE SLIDE. Follow-through: parts of a moving thing do
 *   not all stop on the same frame. A block whose every part arrives on the same
 *   exposure reads mechanical, so the rotation is cued slightly late and finishes
 *   last, and the letters inside a word are given a lag across them so the tail
 *   of the word settles an exposure or so after its head. They move TOGETHER,
 *   which is what was asked for, without being welded.
 *
 * Sources: Gilliam's cut-outs are moved a few millimetres between exposures and
 * split only at the joints; arcs, overshoot, follow-through and drag are the
 * standard principles, and drag is specifically the delay of a part against the
 * body that keeps a turn from reading as one rigid block.
 */

/** which whitespace-delimited word each character belongs to; spaces get -1 */
export function wordOf(text: string): number[] {
  let w = -1
  let open = false
  return text.split('').map((ch) => {
    if (ch === ' ') {
      open = false
      return -1
    }
    if (!open) {
      open = true
      w += 1
    }
    return w
  })
}

export interface WordGroup {
  /** every character index in this word, spaces excluded */
  idx: number[]
}

/** the words of a line, as character index lists */
export function wordGroups(text: string): WordGroup[] {
  const of = wordOf(text)
  const out: WordGroup[] = []
  of.forEach((w, i) => {
    if (w < 0) return
    if (!out[w]) out[w] = { idx: [] }
    out[w].idx.push(i)
  })
  return out.filter(Boolean)
}

export interface WordMotion {
  /** seconds between one word being set down and the next being picked up */
  beat: number
  /** exposures each pose is held; 2 plays the same chart half as fast */
  step: number
  /** how far off its mark a word starts, in the line's own units */
  from: number
  /** the angle it comes in turned by, radians */
  turn: number
  /** how far the path bows off the straight line, against `from` */
  swing: number
  /** whole POSES the turn is cued behind the slide, so the word straightens last */
  drag: number
  /** a bias added to every entry direction, radians; 0 leaves them pointing outward */
  dir: number
}

export const WORD_DEFAULTS: WordMotion = {
  beat: 0.22,
  step: 1,
  // the widest gap in the chart is 24%, so this is the number that decides
  // whether anything strobes: 0.24 * 1.6 is under half a letter width a frame
  from: 1.6,
  turn: 0.3,
  swing: 0.22,
  drag: 2,
  dir: 0,
}

export interface WordShot {
  /** when this word is picked up, seconds after the line's own cue */
  cue: number
  /** where it starts, against its mark, in the line's plane */
  ox: number
  oy: number
  /** the angle it starts turned by */
  turn: number
  /** which side of the straight line it bows out to */
  side: number
}

/**
 * How word `w` of `n` is shot: when it comes in, from where, and how far off
 * square.
 *
 * Seeded on the word so no two are placed identically and the line is the same
 * every time it is played. Odd words come from the other side and lean the other
 * way, so a line does not read as one conveyor belt.
 */
export function wordShot(w: number, n: number, wm: WordMotion, seed = 0): WordShot {
  const flip = w % 2 === 0 ? 1 : -1
  /**
   * A piece comes in from the edge NEAREST its own place, and travels less the
   * closer to the middle it belongs.
   *
   * Firing every word down the same track, or down alternating tracks, makes the
   * inner ones plough straight through where the outer ones are already sitting:
   * ON crossing BET, DANIEL crossing ALWAYS. Nobody animating this by hand would
   * do that, because the piece is carried in from whichever side of the board it
   * is going to live on, and a piece that belongs in the middle is not carried in
   * from off-frame at all, it is nudged.
   *
   * So the direction is outward from the line's centre and the distance grows
   * with it: the ends come in from off the page, the middle gets a short push.
   */
  const uPos = n > 1 ? w / (n - 1) : 0.5
  const out = (uPos - 0.5) * 2
  // a word that belongs dead centre has no side to come from, so it gets a lean
  // and a lift instead
  const vx = Math.abs(out) > 1e-6 ? out : flip * 0.4
  const vy = (1 - Math.abs(out)) * 0.45 * flip
  const a = Math.atan2(vy, vx) + wm.dir
  const dist = wm.from * (0.4 + 0.6 * Math.abs(out)) * (0.85 + hash(seed * 9.1 + w * 2.9) * 0.3)
  return {
    cue: w * wm.beat,
    ox: Math.cos(a) * dist,
    oy: Math.sin(a) * dist,
    turn: wm.turn * flip * (0.65 + hash(seed * 13.3 + w * 7.7) * 0.7),
    side: flip,
  }
}

/**
 * Where a word is against its mark, and whether it is still in hand.
 *
 * `x`/`y` are an offset from home in the line's plane and `turn` an angle about
 * the word's own centre, so the caller applies one rigid transform per word and
 * the letters keep every bit of their existing layout.
 *
 * `at` is the line's cue; `lag` is this letter's own delay inside the word, which
 * is what keeps the piece from arriving as a single welded block.
 */
export function wordAt(
  t: number,
  shot: WordShot,
  wm: WordMotion,
  fps: number,
  at = 0,
): { x: number; y: number; turn: number; moving: boolean; pose: number } {
  const cue = at + shot.cue
  // one chart, read twice: once for the slide and once for the turn, which is
  // cued a whole number of POSES behind it. A fractional lag would be a curve
  // again; an animator is late by exposures.
  const sl = chartAt(t, cue, fps, wm.step)
  const rt = chartAt(t, cue + (wm.drag * Math.max(1, wm.step)) / fps, fps, wm.step)
  // the chart runs past 1 and comes back, so `away` goes negative there and the
  // word carries PAST its mark before it is corrected
  const away = 1 - sl.k
  let x = away * shot.ox
  let y = away * shot.oy
  // and the bow: perpendicular to the entry, zero at both ends, widest halfway,
  // so the piece swings in rather than sliding down a rail
  const len = Math.hypot(shot.ox, shot.oy)
  if (len > 1e-6 && wm.swing !== 0) {
    const bow = Math.sin(Math.PI * Math.min(1, Math.max(0, sl.k))) * wm.swing * len * shot.side
    x += (-shot.oy / len) * bow
    y += (shot.ox / len) * bow
  }
  return { x, y, turn: (1 - rt.k) * shot.turn, moving: sl.moving || rt.moving, pose: sl.pose }
}
