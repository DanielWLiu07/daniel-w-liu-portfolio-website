/**
 * A roulette wheel: the numbers, the colours, and the spin.
 *
 * No three, no react. This is the wheel as DATA and as MOTION, so both can be
 * asserted in scripts/check-roulette.ts without a renderer, the same split the
 * card set uses.
 *
 * The motion is a PURE FUNCTION of time. `spinAt(t)` returns where the wheel
 * head is, where the ball is, and which pocket has it. Nothing integrates frame
 * to frame, so it is deterministic, it can be scrubbed to any instant, and a
 * backgrounded tab handing back a four second delta cannot break it.
 */

/**
 * The single zero wheel, in the order the pockets are actually cut.
 *
 * This is not 0..36 arranged prettily. It is the real European sequence, and its
 * signatures are measurable: red and black strictly alternate all the way round,
 * zero sits between 26 and 32, and high (19-36) and low (1-18) alternate
 * everywhere except one place, between 10 and 5. Getting it wrong is invisible
 * in a render and obvious to anyone who has stood at a table.
 *
 * Worth recording what is NOT true of it, because it is widely repeated and the
 * check caught me asserting it: consecutive numbers do NOT sit opposite each
 * other. Measured on this sequence, only 3 of the 18 pairs are anywhere near
 * opposite. With 37 pockets there is no exact opposite to begin with.
 */
export const WHEEL_ORDER: readonly number[] = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31,
  9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
]

export const POCKETS = WHEEL_ORDER.length

/** the red numbers on a standard layout; everything else 1..36 is black, 0 is green */
export const RED_NUMBERS: ReadonlySet<number> = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
])

export type PocketColour = 'red' | 'black' | 'green'
export function pocketColour(n: number): PocketColour {
  if (n === 0) return 'green'
  return RED_NUMBERS.has(n) ? 'red' : 'black'
}

/** angular width of one pocket */
export const POCKET_ARC = (Math.PI * 2) / POCKETS

/** the centre angle of a pocket, by its index in WHEEL_ORDER, in the wheel's own frame */
export const pocketAngle = (i: number) => i * POCKET_ARC

/* -------------------------------------------------------------------------- */
/* the wheel's dimensions, as fractions of the bowl's outer radius             */
/* -------------------------------------------------------------------------- */

/**
 * The wheel's proportions, all as fractions of the bowl's outer radius.
 *
 * The black EDGE is deliberately slim, in both directions. The bowl's outer wall
 * stands 0.038 against the 0.115 this started at and its underside is at -0.022
 * against -0.09, so the black band seen from the SIDE is 0.06 of the radius
 * where it was 0.205, under a third of it. And the head reaches 0.78 where it
 * started at 0.62, so the black ring on TOP, between the pockets and the rim, is
 * 0.22 of the radius where it was 0.38. A real wheel is mostly pockets.
 */
export const DIMS = {
  /** outer edge of the wooden bowl */
  bowl: 1.0,
  /** where the ball runs while it still has speed */
  track: 0.925,
  /** the ring of diamond deflectors on the apron */
  deflector: 0.855,
  /** outer edge of the spinning wheel head, which is where the pockets start */
  head: 0.78,
  /** inner edge of the pockets, where the cone begins */
  hub: 0.38,
  /** how tall the bowl's outer wall stands */
  wall: 0.038,
  /**
   * The pocket floor, below the rim and ABOVE the base.
   *
   * That ordering is the whole constraint and it is easy to break: thinning the
   * bowl raised `base` to -0.032 and left this at -0.045, which put the pocket
   * floor underneath the bowl's own underside. The wheel then sat with its
   * pockets below the table and the felt drew straight over them, so the head
   * came out as bare green with a turret in the middle.
   */
  floor: -0.009,
  /**
   * How high a fret stands off the pocket floor.
   *
   * All but FLUSH, and that is the point. A fret drawn as a raised box shows
   * its side faces, and those sides are in shadow, so every divider comes with
   * a dark edge and the pair reads as a wall between the pockets rather than as
   * a line between them. Lowering it from 0.038 to 0.015 was not enough, because
   * the sides were still there to catch shadow. At 0.004 the strip is an inlay:
   * a metal line at the surface, with no side to see.
   */
  fret: 0.004,
  /** the ball */
  ball: 0.038,
  /** how many diamond deflectors sit on the apron */
  deflectors: 8,
  /**
   * The underside of the bowl.
   *
   * Everything else here is measured from the pocket floor, which is BELOW the
   * bowl's base, so a wheel dropped at y=0 sits with its pockets under the
   * table: the felt draws straight over them and the wheel reads as a black
   * ring with nothing in it. The component lifts by this, so a caller can place
   * the wheel at the table's surface and have it sit on the table.
   */
  base: -0.022,
} as const

/** the middle of the pocket ring, which is where a settled ball sits */
export const POCKET_RADIUS = (DIMS.head + DIMS.hub) / 2

/* -------------------------------------------------------------------------- */
/* the spin                                                                    */
/* -------------------------------------------------------------------------- */

export interface SpinOptions {
  /** seconds for one full cycle: spin, settle, hold, reset */
  period?: number
  /** the wheel head's speed just after the croupier pushes it, rad/s */
  wheelSpeed?: number
  /** how quickly the head gives that speed up */
  wheelDecay?: number
  /** the speed the head coasts at and never drops below */
  wheelIdle?: number
  /** the ball's opening speed, rad/s, opposite to the head */
  ballSpeed?: number
  ballDecay?: number
  /** the speed below which the track can no longer hold the ball out */
  leaveSpeed?: number
  /** the speed below which a pocket can catch it */
  catchSpeed?: number
}

export const DEFAULTS: Required<SpinOptions> = {
  period: 15,
  /**
   * A real wheel head turns slowly, about one turn every two or three seconds,
   * and the BALL is the fast one. Spinning the head fast is the single thing
   * that makes a roulette animation read as a fairground ride rather than as a
   * casino wheel. It also never STOPS: it coasts between spins and the croupier
   * gives it a nudge, which is what wheelIdle is.
   */
  wheelSpeed: 2.0,
  wheelDecay: 16,
  wheelIdle: 1.35,
  ballSpeed: -13.5,
  ballDecay: 4.6,
  leaveSpeed: 5.6,
  catchSpeed: 3.1,
}

/**
 * Angle swept by something whose speed decays exponentially.
 *
 * Closed form on purpose: this is what lets the whole spin be evaluated at any
 * instant without stepping through the ones before it.
 */
const swept = (speed: number, decay: number, t: number) => speed * decay * (1 - Math.exp(-t / decay))

/** when a decaying speed falls to `to` */
const timeToSpeed = (speed: number, decay: number, to: number) => decay * Math.log(Math.abs(speed) / to)

/**
 * The head's rotation, CONTINUOUS across spins.
 *
 * It used to be swept() of the time within one spin, which meant the angle
 * reset to zero the moment a new spin began: measured, the head jumped 259
 * degrees at every cycle seam. A wheel that snaps back a three quarter turn
 * every fifteen seconds is the least realistic thing an animation like this can
 * do, and it is invisible in any single frame, which is why scrubbing never
 * showed it.
 *
 * So the head decays toward an IDLE speed rather than toward a stop, and the
 * angle carries the whole rotation of every spin before this one. A real head
 * coasts between spins and the croupier nudges it; that nudge is the only step
 * left, and it is in the speed, not in the position.
 */
function wheelAngle(cycle: number, t: number, o: Required<SpinOptions>): number {
  const push = o.wheelSpeed - o.wheelIdle
  const within = (u: number) => o.wheelIdle * u + push * o.wheelDecay * (1 - Math.exp(-u / o.wheelDecay))
  return cycle * within(o.period) + within(t)
}

export interface SpinState {
  /** rotation of the wheel head, radians */
  wheel: number
  /** the ball, in world polar coordinates */
  ballAngle: number
  ballRadius: number
  ballHeight: number
  /** index into WHEEL_ORDER once the ball is caught, else null */
  pocket: number | null
  /** the number under the ball once it is caught, else null */
  result: number | null
  phase: 'track' | 'fall' | 'settled'
}

/** Continuous presentation spin for the flying wheel, without a settle/reset. */
export function orbitAt(t: number, opts: SpinOptions = {}): SpinState {
  return {
    wheel: t * (opts.wheelSpeed ?? DEFAULTS.wheelSpeed),
    ballAngle: t * (opts.ballSpeed ?? DEFAULTS.ballSpeed),
    ballRadius: DIMS.track,
    ballHeight: DIMS.wall * 0.42,
    pocket: null,
    result: null,
    phase: 'track',
  }
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
/** smoothstep, so the ball does not change direction with a corner in it */
const ease = (v: number) => {
  const x = clamp01(v)
  return x * x * (3 - 2 * x)
}

/**
 * Where everything is at local time `t` within one spin, for a given cycle.
 *
 * `cycle` only sets the ball's starting angle, which is what makes consecutive
 * spins land on different numbers without anything being random: the same cycle
 * always produces the same result, so a check can assert over all of them.
 */
export function spinAt(t: number, cycle = 0, opts: SpinOptions = {}): SpinState {
  const o = { ...DEFAULTS, ...opts }
  const wheel = wheelAngle(cycle, t, o)

  // the ball is launched from a different point each cycle. An irrational step
  // means the sequence of results never falls into a short loop.
  const ball0 = (cycle * Math.PI * 2 * 0.6180339887) % (Math.PI * 2)

  const tLeave = timeToSpeed(o.ballSpeed, o.ballDecay, o.leaveSpeed)
  const tCatch = timeToSpeed(o.ballSpeed, o.ballDecay, o.catchSpeed)

  const freeAngle = (u: number) => ball0 + swept(o.ballSpeed, o.ballDecay, u)

  // where the ball would be, and which pocket is under it, at the catch
  const wheelAtCatch = wheelAngle(cycle, tCatch, o)
  const angleAtCatch = freeAngle(tCatch)
  // the pocket is read in the WHEEL's frame, which is the only frame in which
  // pockets hold still
  const rel = angleAtCatch - wheelAtCatch
  const pocket = ((Math.round(rel / POCKET_ARC) % POCKETS) + POCKETS) % POCKETS
  const lockOffset = pocket * POCKET_ARC

  if (t >= tCatch) {
    // caught: the ball is part of the wheel now and turns with it
    return {
      wheel,
      ballAngle: wheel + lockOffset,
      ballRadius: POCKET_RADIUS,
      ballHeight: DIMS.floor + DIMS.ball,
      pocket,
      result: WHEEL_ORDER[pocket],
      phase: 'settled',
    }
  }

  if (t <= tLeave) {
    // still out on the track, held there by its own speed
    return {
      wheel,
      ballAngle: freeAngle(t),
      ballRadius: DIMS.track,
      ballHeight: DIMS.wall * 0.42,
      pocket: null,
      result: null,
      phase: 'track',
    }
  }

  // falling: the ball spirals in off the track, crosses the deflector ring and
  // drops to the pockets. The angle is still the free one, so the fall does not
  // change where it was going to land, only how it gets there.
  const k = ease((t - tLeave) / (tCatch - tLeave))
  const radius = DIMS.track + (POCKET_RADIUS - DIMS.track) * k
  // one shallow bounce off the deflector ring on the way down, so the drop is
  // not a straight slide
  const drop = DIMS.wall * 0.42 + (DIMS.floor + DIMS.ball - DIMS.wall * 0.42) * k
  const bounce = Math.sin(Math.PI * k) * Math.sin(Math.PI * k * 3) * DIMS.wall * 0.2 * (1 - k)
  /**
   * The last stretch is nudged onto the pocket it is going to, by a CONSTANT.
   *
   * The obvious version recomputes the shortest way round to the pocket at every
   * instant. That looks right and is not: the ball and the wheel are turning in
   * opposite directions, so their difference sweeps past a half turn during the
   * fall, and the shortest path flips sign the moment it does. The check caught
   * it as the ball teleporting a full bowl radius at t=6.13s.
   *
   * The correction is worked out ONCE, at the catch, and is never more than half
   * a pocket wide, because that is all the rounding to a pocket centre can be.
   * Blending in something that small cannot flip.
   */
  const wrapPi = (a: number) => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI
  const nudge = wrapPi(wheelAtCatch + lockOffset - angleAtCatch)
  const seat = ease((t - tLeave) / (tCatch - tLeave) * 1.9 - 0.9)
  const free = freeAngle(t)
  return {
    wheel,
    ballAngle: free + nudge * seat,
    ballRadius: radius,
    ballHeight: drop + bounce,
    pocket: null,
    result: null,
    phase: 'fall',
  }
}

/** the cycle index and the time within it, for a clock that has been running for `t` */
export function cycleAt(t: number, opts: SpinOptions = {}) {
  const o = { ...DEFAULTS, ...opts }
  const cycle = Math.floor(t / o.period)
  return { cycle, t: t - cycle * o.period }
}

/** the number this cycle lands on, without having to walk the animation */
export function resultOf(cycle: number, opts: SpinOptions = {}): number {
  const o = { ...DEFAULTS, ...opts }
  return spinAt(o.period, cycle, opts).result as number
}
