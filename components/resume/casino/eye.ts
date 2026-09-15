/**
 * A drawn eye that opens: the shape, and the way it moves.
 *
 * No three, no react. This is the eye as GEOMETRY and as MOTION, so both can be
 * asserted in scripts/check-eye.ts without a renderer, the same split the card
 * set and the wheel use. eye-material.ts builds the same maths as a shader.
 *
 * This is NOT an eyeball. An eyeball is a sphere with a texture on it and it
 * reads as an anatomical model; what is wanted here is the DRAWN eye, the one
 * on a tarot card or over a door, and that is a different object with different
 * rules:
 *
 *   It is bounded by two ARCS meeting at fixed points, not by an outline round
 *   a ball. The two points are the corners, and they do not move when the eye
 *   opens. Everything an illustrator does to open an eye happens between them.
 *
 *   A closed eye is a CURVE, not a line. Drawing the shut position as a straight
 *   stroke is the single thing that makes a closed eye read as a scratch on the
 *   page, so the lids share a sagging baseline they both start from.
 *
 *   The iris is CROPPED by the lids. An iris floating clear of both, with white
 *   all the way round it, is the face a person makes when startled, and it is
 *   why a badly drawn eye looks panicked. At rest both lids cut across it.
 *
 *   The upper lid does most of the work and carries all of the weight: the
 *   heavy line, the lashes. The lower lid is a thin line that barely moves.
 */

/* -------------------------------------------------------------------------- */
/* the shape                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Everything is in EYE SPACE: x runs from -1 at the inner corner to +1 at the
 * outer one, and y is in the same units, so the numbers below are all readable
 * as fractions of the eye's half width.
 */
export const EYE = {
  /**
   * The full aperture. Corner to corner is 2, so this is the eye's height
   * against a width of 2.
   *
   * 0.66 was a cat's eye: at better than three to one the almond stops reading
   * as an eye and starts reading as a leaf, and the corners come to a spike. A
   * drawn eye sits nearer two to one.
   */
  height: 0.92,
  /** how much of that the UPPER lid provides. The rest is the lower one. */
  upperShare: 0.56,
  /**
   * How full each arc is. A lower power is a rounder lid; a higher one comes to
   * a point sooner and reads sharper at the corners. The upper lid is the
   * rounder of the two on almost every drawn eye.
   */
  upperPower: 0.62,
  lowerPower: 0.85,
  /**
   * The upper lid's apex sits off centre, toward the inner corner. Symmetric
   * lids read as a leaf rather than as an eye, and this is the asymmetry that
   * fixes it.
   */
  upperSkew: -0.13,
  /** how far the shut eye sags below the corner line, and how curved that sag is */
  closedSag: 0.052,
  closedPower: 0.7,
  /**
   * The iris, big enough that both lids cut across it.
   *
   * It has to grow with the aperture, and the check is what enforces that: make
   * the eye taller without making the iris bigger and the lids stop touching it,
   * which is the startled look. At 0.52 against an upper reach of 0.515 and a
   * lower of 0.405 both lids cross it.
   */
  irisR: 0.52,
  irisY: 0.01,
  /** the dark rim that makes an iris read as an iris rather than a coloured dot */
  limbal: 0.055,
  pupilR: 0.21,
  /** the catchlight, up and toward the inner corner, which is what makes it wet */
  highlightR: 0.1,
  highlightX: -0.19,
  highlightY: 0.19,
  /** line weights: the upper lash line is heavy, the lower lid is a hairline */
  upperLine: 0.072,
  lowerLine: 0.024,
} as const

/**
 * The radiance around the eye: line work only, nothing filled.
 *
 * No triangle. The rays sit on an ELLIPSE matched to the eye rather than on a
 * circle, so they hug it: on a circle the ones above and below start miles off a
 * shape that is twice as wide as it is tall, and the glyph reads as an eye that
 * happens to have a sunburst behind it rather than as one thing.
 */
export const GLYPH = {
  /**
   * How much of the glyph the eye itself takes. Large, now that there is no
   * triangle that has to pass outside the almond.
   */
  eyeScale: 0.82,
  /** the ellipse the rays start from, just outside the eye */
  ringX: 0.95,
  ringY: 0.52,
  /** how many, how far they run past that ring, and how wide */
  rays: 12,
  rayLong: 0.3,
  rayShort: 0.18,
  rayWidth: 0.026,
  /** stroke weight, in eye space */
  line: 0.04,
  /**
   * How far the paper pushes a stroke off its true path, in eye space.
   *
   * This is what makes the line art look DRAWN rather than plotted. It is
   * applied to the coordinates before any of the shape maths, so the lids, the
   * rings and the rays all wander together as if the paper under them moved,
   * which is what happens on a real page. Wobbling each stroke on its own would
   * have them drift apart at the corners where they are supposed to meet.
   */
  wobble: 0.028,
} as const

/** where ray `i` starts and ends, following the ellipse rather than a circle */
export function rayAt(i: number) {
  const th = (i / GLYPH.rays) * Math.PI * 2 + Math.PI / GLYPH.rays
  const c = Math.cos(th)
  const s = Math.sin(th)
  const from = 1 / Math.hypot(c / GLYPH.ringX, s / GLYPH.ringY)
  return { th, c, s, from, to: from + (i % 2 === 0 ? GLYPH.rayLong : GLYPH.rayShort) }
}

/**
 * How much room the whole glyph takes, as half extents in eye space.
 *
 * The eye alone is 1 by 0.46. With the rays round it the drawn thing is wider
 * and much taller, and the field's spacing is worked out from THIS rather than
 * from the eye, or one glyph's rays run into the next one.
 */
export const EYE_EXTENT = {
  x: GLYPH.ringX + GLYPH.rayLong,
  y: GLYPH.ringY + GLYPH.rayLong,
} as const

/** the upper lid's share of the opening, in eye space */
export const upperReach = EYE.height * EYE.upperShare
/** the lower lid's share */
export const lowerReach = EYE.height * (1 - EYE.upperShare)

/** (1 - x^2) clamped, the arc profile every lid is built from. 0 at the corners. */
export const arc = (x: number) => Math.max(0, 1 - x * x)

/**
 * The upper lid's apex shift.
 *
 * Skewing the coordinate rather than the result keeps the CORNERS fixed: the
 * shift is proportional to arc(x), which is zero at both ends, so x = +/-1 maps
 * to itself however hard the middle is pushed.
 */
export const skew = (x: number, by: number) => x + by * arc(x)

/** where the two lids meet when the eye is shut, as a function of x */
export const baseline = (x: number) => -EYE.closedSag * Math.pow(arc(x), EYE.closedPower)

/** the upper lid, at horizontal position x, for an opening of `open` */
export function upperLid(x: number, open: number): number {
  const s = skew(x, EYE.upperSkew)
  return baseline(x) + open * upperReach * Math.pow(arc(s), EYE.upperPower)
}

/** the lower lid */
export function lowerLid(x: number, open: number): number {
  return baseline(x) - open * lowerReach * Math.pow(arc(x), EYE.lowerPower)
}

/** is (x, y) inside the aperture */
export const insideEye = (x: number, y: number, open: number) =>
  Math.abs(x) <= 1 && y <= upperLid(x, open) && y >= lowerLid(x, open)

/** the aperture's height at x, which is zero at the corners and at open 0 */
export const apertureAt = (x: number, open: number) => Math.max(0, upperLid(x, open) - lowerLid(x, open))

/* -------------------------------------------------------------------------- */
/* the gaze                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * How far the iris may travel from the middle: the semi axes of an OVAL.
 *
 * Wider than it is tall, because that is how an eye moves. The vertical figure
 * also shrinks with the opening, so a half open eye does not roll its iris up
 * behind its own lid.
 */
export const irisTravel = (open: number) => ({
  x: 0.34,
  y: Math.min(0.2, (apertureAt(0, open) / 2) * 0.45),
})

/**
 * Where the iris sits, given something to look at.
 *
 * The travel is clamped to an ELLIPSE, not to a box.
 *
 * Clamping x and y independently is the obvious way to keep the iris in, and it
 * is wrong in a way you can see: the reachable positions are a RECTANGLE, so an
 * eye following a cursor round in a circle moves its pupil round in a square,
 * pausing at four corners and running dead straight between them. Scaling the
 * whole vector back onto the oval instead keeps the direction and only shortens
 * the reach, so the pupil sweeps a smooth oval.
 *
 * Inside the oval the target is followed exactly; outside it, the iris pins to
 * the boundary in the direction of the target.
 */
export function irisAt(target: readonly [number, number], open: number): [number, number] {
  const r = irisTravel(open)
  if (r.x <= 0 || r.y <= 0) return [0, EYE.irisY]
  const nx = target[0] / r.x
  const ny = target[1] / r.y
  const m = Math.hypot(nx, ny)
  const k = m > 1 ? 1 / m : 1
  return [target[0] * k, EYE.irisY + target[1] * k]
}

/* -------------------------------------------------------------------------- */
/* the opening, and the blinks                                                 */
/* -------------------------------------------------------------------------- */

export interface OpenOptions {
  /** seconds the first opening takes */
  wake?: number
  /** how long the eye holds shut before it wakes */
  delay?: number
  /** seconds one blink lasts */
  blink?: number
  /** average seconds between blinks */
  every?: number
  /**
   * Where in its own cycle this eye is, 0 to 1.
   *
   * Without it every eye in a field runs the SAME blink schedule, offset only by
   * when it arrived, so any two that opened close together blink in lockstep
   * forever. The phase is what makes each one its own.
   */
  phase?: number
}

export const OPEN_DEFAULTS: Required<OpenOptions> = {
  delay: 0.12,
  wake: 0.5,
  blink: 0.16,
  every: 3.6,
  phase: 0,
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const ease = (v: number) => {
  const t = clamp01(v)
  return t * t * (3 - 2 * t)
}

/**
 * One blink, as a multiplier on the opening.
 *
 * NOT symmetric. A lid drops in about a third of the time it takes to come back
 * up, and a blink animated with the same curve both ways reads as a wink or as
 * a stutter rather than as a blink. `k` is where we are through it, 0 to 1.
 */
export function blinkShape(k: number): number {
  if (k <= 0 || k >= 1) return 1
  const shut = 0.32
  return k < shut ? 1 - ease(k / shut) : ease((k - shut) / (1 - shut))
}

/**
 * When the nth blink starts.
 *
 * Two separate sources of irregularity, and both are needed. The golden ratio
 * step keeps ONE eye from falling into a rhythm of its own; the phase keeps a
 * FIELD of them from falling into rhythm with each other. An eye with only the
 * first is unpredictable on its own and still blinks in time with its
 * neighbours, which is worse than no jitter at all because it looks deliberate.
 *
 * Deterministic either way, so a check can walk every blink of every eye.
 */
export const blinkStart = (n: number, o: Required<OpenOptions> = OPEN_DEFAULTS) =>
  o.delay +
  o.wake +
  o.every * (n + 0.45 + o.phase + 0.62 * (((n * 0.6180339887 + o.phase * 3.77) % 1) - 0.5))

/** how open the eye is at time t */
export function openAt(t: number, opts: OpenOptions = {}): number {
  const o = { ...OPEN_DEFAULTS, ...opts }
  if (t <= o.delay) return 0
  // the wake: a single opening, eased, with no overshoot. An eye that springs
  // past open and settles back reads as a cartoon take, not as waking up.
  const wake = ease((t - o.delay) / o.wake)
  if (t < o.delay + o.wake) return wake
  // find the blink we might be inside. Only the nearest few can matter.
  const n = Math.max(0, Math.floor((t - o.delay - o.wake) / o.every) - 1)
  let shut = 1
  for (let i = n; i <= n + 2; i++) {
    const s = blinkStart(i, o)
    if (t >= s && t <= s + o.blink) shut = Math.min(shut, blinkShape((t - s) / o.blink))
  }
  return shut
}

/**
 * The card the eye is drawn on, in world units.
 *
 * Width 2 so that u maps straight onto eye space, and the height is what turns
 * v into the same units. Changing this changes the shader's y scale, which is
 * why it lives here beside the shape rather than in the component.
 */
export const EYE_PLANE = { w: 2.8, h: 2.1 } as const

/* -------------------------------------------------------------------------- */
/* a field of them                                                             */
/* -------------------------------------------------------------------------- */

/** one eye in the field, in VIEW space: y runs -1 to 1, x runs -aspect to aspect */
export interface EyeInstance {
  x: number
  y: number
  /** multiplies EYE_PLANE, so the drawn eye is 2 * scale wide */
  scale: number
  /** a small tilt, because a field of perfectly level eyes reads as a pattern */
  roll: number
  /** seconds before this one starts to open */
  delay: number
  /** this eye's own place in its blink cycle, 0 to 1 */
  phase: number
  /** and its own seconds between blinks */
  every: number
  /** the view's aspect when it was laid out, so a cursor can be mapped back into it */
  aspect?: number
}

/** deterministic, so the same field comes back every time and a check can walk it */
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

/**
 * Scatter eyes over the view.
 *
 * A JITTERED GRID rather than free placement. Free scatter clumps and leaves
 * holes, and rejection sampling for spacing is not deterministic without more
 * machinery than this needs; jittering a grid gives an even field that still
 * does not read as a grid, and the cell is what guarantees two eyes cannot end
 * up on top of each other.
 *
 * Sizes come from the CELL, not from a fixed range, so the field stays spaced
 * however many are asked for.
 */
export function scatterEyes(count: number, aspect: number, seed = 0): EyeInstance[] {
  const cols = Math.max(1, Math.round(Math.sqrt(count * aspect)))
  const rows = Math.max(1, Math.ceil(count / cols))
  const cellW = (2 * aspect) / cols
  const cellH = 2 / rows
  // the whole GLYPH is what has to fit, not the eye: spacing on the almond alone
  // runs one glyph's rays into the next one
  const room = Math.min(cellW / (2 * EYE_EXTENT.x), cellH / (2 * EYE_EXTENT.y))
  const out: EyeInstance[] = []
  for (let i = 0; i < count; i++) {
    const c = i % cols
    const r = Math.floor(i / cols)
    const h1 = hash(i * 3.1 + seed)
    const h2 = hash(i * 7.7 + seed + 41)
    const h3 = hash(i * 13.3 + seed + 97)
    const h4 = hash(i * 19.9 + seed + 173)
    const scale = room * (0.52 + 0.34 * h3)
    // jitter is bounded by the room the eye does NOT take up in its cell, so it
    // can never carry one over a neighbour
    const jx = (h1 - 0.5) * Math.max(0, cellW - 2 * EYE_EXTENT.x * scale) * 0.9
    const jy = (h2 - 0.5) * Math.max(0, cellH - 2 * EYE_EXTENT.y * scale) * 0.9
    out.push({
      x: -aspect + cellW * (c + 0.5) + jx,
      y: -1 + cellH * (r + 0.5) + jy,
      scale,
      roll: (h4 - 0.5) * 0.28,
      /**
       * They arrive one after another, but only just.
       *
       * The spread used to run to four and a half seconds, which is a sequence
       * you WATCH rather than an effect that happens: by the time the last eye
       * opened the first had already blinked. Under a second still reads as a
       * cascade and the whole field is up almost at once. The check holds both
       * ends of that: enough spread that they are not simultaneous, and a hard
       * ceiling on when the last one finishes.
       */
      delay: 0.04 + 0.5 * h1 + 0.1 * (i % 5),
      // its own place in the cycle, and its own cadence. Two eyes can share one
      // or the other and still never blink together; sharing both is what the
      // check rules out.
      phase: hash(i * 23.7 + 251),
      every: OPEN_DEFAULTS.every * (0.7 + 0.75 * hash(i * 31.1 + 389)),
    })
  }
  return out
}

/**
 * Where an eye should look, given the cursor.
 *
 * Per EYE, not once for the field. The direction is from THAT eye to the
 * cursor, which is the entire effect: a field where every eye uses one shared
 * gaze has them all pointing the same way, and it reads as a printed pattern
 * rather than as something watching you.
 *
 * The eye's own roll is undone, so a tilted eye still looks AT the cursor and
 * not off at an angle, and the distance is divided by the eye's size so a small
 * eye does not need the cursor to be closer before it reacts.
 */
export function gazeFor(e: EyeInstance, cursorX: number, cursorY: number): [number, number] {
  const dx = cursorX - e.x
  const dy = cursorY - e.y
  const c = Math.cos(-e.roll)
  const s = Math.sin(-e.roll)
  const rx = dx * c - dy * s
  const ry = dx * s + dy * c
  const reach = Math.max(1e-6, e.scale * 1.4)
  return [rx / reach, ry / reach]
}

/* -------------------------------------------------------------------------- */
/* colour                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The irises a field draws from.
 *
 * Straight out of the casino palette, so a screen of these belongs to the same
 * page as the chips and the felt. Gold first because it is the one that reads as
 * an eye on its own; the rest are what stop a field looking printed.
 */
export const EYE_INKS = ['gold', 'green', 'blue', 'red', 'purple', 'orange'] as const
export type EyeInk = (typeof EYE_INKS)[number]

/**
 * Which ink an eye takes.
 *
 * Stepped by a number coprime with the list length rather than by a hash, so a
 * field can never deal the same colour to two neighbours in the same row and can
 * never leave one of them out.
 */
export const inkFor = (i: number): EyeInk => EYE_INKS[(i * 5) % EYE_INKS.length]
