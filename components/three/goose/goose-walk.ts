/**
 * The waddle, generated rather than keyframed.
 */
import {
  GOOSE_DAMPING,
  GOOSE_SOFTNESS,
  type PoseDriver,
} from "./use-pose-driver";

const TAU = Math.PI * 2;

/**
 * Per-segment forward pitch when running, base to tip, in radians.
 */
const RUN_NECK = [0.45, 0.34, 0.1, 0.04];

/**
 * Metres of travel per complete two-step cycle.
 */
export const STRIDE = 0.5;

/**
 * Fraction of the cycle a foot spends on the ground.
 *
 * Lives here rather than in foot-ik, which is where it is actually used, purely
 * to keep the imports acyclic: foot-ik already reads STRIDE from this file, so
 * pointing the other constant the same way makes this module the one source of
 * gait timing. Importing it back the other way compiles fine and then hands one
 * side `undefined` at module-evaluation time, which turns the whole pose to NaN.
 *
 * Both files need it. The planner decides when a foot is down; the bob below has
 * to know when mid-stance is (STANCE / 2) to sink the body at the right moment,
 * and those only agree if they read the same number.
 */
export const STANCE = 0.6;

/**
 * The gait's per-step swing on the torso, as coefficients on `step` and `dbl`.
 *
 * Named here rather than written inline at each bone because the head
 * stabiliser below cancels EXACTLY this sum. Two literals that have to stay
 * equal will not: the first time anyone tunes the waddle, a hard-coded counter
 * silently stops cancelling and the wiggle creeps back with no obvious cause.
 * One source, used twice.
 *
 * Roll is the waddle and is by far the largest of these — a quarter radian at
 * the hips, which is the point. Yaw swings the body toward the planted foot,
 * pitch is the footfall bob at double rate.
 */
const GAIT = {
  hipsYaw: 0.07,
  hipsRoll: 0.28,
  spineBob: 0.02,
  spineYaw: -0.03,
  spineRoll: -0.05,
  chestBob: 0.025,
  chestYaw: -0.02,
  chestRoll: -0.06,
  /** The neck's own per-step motion, per bone before the share below. */
  neckBob: 0.016,
  neckRoll: -0.028,
} as const;

/** How much of the neck's motion each segment takes, base to tip. */
const NECK_SHARE = [1, 0.8, 0.6, 0.4] as const;

/**
 * Wingbeats a second, airborne.
 *
 * A Canada goose cruises at roughly 3 a second, and this is deliberately under
 * that: a heave over a hedge is slower and heavier than level flight, and the
 * wing has to be able to physically GET there. Measured through the wing's own
 * spring, a 39-degree command comes out as 7.6 degrees at 3.2 Hz and 37.6 at
 * 2.4 — the difference between a wing that flaps and a wing that shivers. See
 * the wing stiffness in GOOSE_SOFTNESS, which was raised to meet this.
 */
const FLAP_HZ = 2.4;

/**
 * How far the body rises over a planted foot at a walk, world units.
 *
 * The inverted-pendulum vault. Small, and never negative — a walking body is
 * carried over the leg rather than dropped onto it.
 */
const WALK_VAULT = 0.02;
/**
 * How far the body sinks into each step at a full run, world units.
 *
 * The spring-mass compression — the hop. Still more than the walk's vault,
 * since the inversion is the whole read of a run as something other than a
 * brisk walk, but well back from the 0.045 first tried: at 2.85 Hz that was
 * enough travel to read as shaking rather than as a step.
 *
 * A TRANSLATION survives this frequency far better than a rotation does, which
 * is why the hop stays and the trunk rock below is off by default. Moving the
 * body up and down is the same motion at any speed; rotating it swings
 * everything mounted above it through an arc.
 *
 * Downward only, because a straight leg can bend but cannot lengthen — see the
 * note on footfall below.
 */
const RUN_COMPRESS = 0.028;
/** Trunk rock through stance at a full run, radians. Off — see below. */
const RUN_TRUNK_ROCK = 0;

/** How much of the hips' yaw the run removes. See hipYawScale. */
const HIP_YAW_RUN = 1;
/**
 * How much of the WADDLE the run takes out.
 *
 * The waddle is a walking thing. It is weight shifting from one foot to the
 * other, and an animal that speeds up stops rolling side to side and starts
 * bouncing along instead — so taking it out of the run is what the bird does,
 * not a compromise made to fix something.
 *
 * It is also the only lever that reaches the last of the head movement, because
 * it removes the disturbance rather than cancelling it. Measured, head travel
 * side to side at a run against the hips' roll:
 *
 *   0.28 (walk value)   3.87 cm
 *   0.20                2.84 cm
 *   0.14                1.93 cm
 *
 * Taken out ENTIRELY at a run, which is where this ended up. Half measures
 * left 2.23 cm of head sway at 2.85 Hz, and at nearly three cycles a second
 * that does not read as a sway, it reads as a vibration — the frequency is
 * what makes it look wrong, so the only thing left to change is amplitude.
 * At zero the run's head sways 0.68 cm, which is the walk's 0.70. A run is a
 * bounding gait rather than a waddling one, so losing the roll there costs the
 * animal nothing it should have had.
 *
 * Scaled by `run` rather than cut outright, so the walk keeps its full quarter
 * radian — that is where the waddle reads, and the walk's head is already
 * steady at 0.67 cm, so a global cut would have spent the gait's character on
 * nothing.
 */
const HIP_ROLL_RUN = 1;
/**
 * How far the head stabiliser stands down at a full run.
 *
 * It does not stand down because it stops working — it holds the head's FACING
 * better than anything else here. It stands down because at a run that is the
 * wrong thing to hold perfectly. The counter-rotation that pins the facing also
 * swings the head bodily sideways, and with the neck straightened out ahead
 * there is a long lever for it to do that on. Measured at a run, head travel
 * side to side against head rotation:
 *
 *   no stabiliser at all      5.92 cm    18.97 deg
 *   full stabiliser           7.99 cm     6.12 deg   <- steadiest facing, worst travel
 *   fade 0.4                  4.97 cm    11.08 deg
 *   fade 0.7                  3.59 cm    16.47 deg
 *
 * 0.4 answers the complaint. Measured at a run, holding the goose straight:
 *
 *   fade 0     6.74 cm of side-to-side head travel
 *   fade 0.4   3.91 cm
 *
 * It is a trade, not a free win: standing the counter down gives back some head
 * rotation, and an earlier note here claimed otherwise by comparing against a
 * baseline measured on a different build.
 *
 * A WARNING ABOUT MEASURING THIS. Every number above is taken from frames where
 * the heading is genuinely steady. Turning swings the head hard, and the first
 * pass at this let a little residual turn into the samples: one configuration
 * measured 4.0, 8.9 and 7.3 cm on three consecutive runs, a spread wider than
 * any difference being tuned. Filtered to straight-line frames the same config
 * reads 3.9 five times out of five. Tune this against a clean signal or you are
 * tuning against the navigation.
 *
 * Walking is untouched — `r` is zero there — and still measures 1.73 cm against
 * 15.63 with the stabiliser off, which is where the whole thing earns its keep.
 */
const RUN_FADE = 0.4;

/** One bone's share of a signal, for the spring maths below. */
type Term = readonly [bone: string, coeff: number];

/**
 * Where the cancellation is applied.
 *
 * Never the head: see the stabiliser for why. And as LOW as possible, which is
 * the part that took measuring.
 *
 * The hips roll about their own joint, so everything above them swings
 * sideways with it, and the counter only straightens the body from wherever it
 * is applied upward. Whatever sits between the roll and the cancellation is
 * carried along untouched — so the higher the counter, the longer that segment
 * and the further the head travels. Measured at a run, side to side, holding
 * the goose straight:
 *
 *   spine 0.55 / chest 0.45   4.85 cm
 *   spine 1.00 / chest 0.00   3.91 cm
 *
 * It was split across two bones so neither would eat its share of a 70-degree
 * joint limit during a hard turn. The whole counter is about 10 degrees, and
 * the lean it stacks with is nowhere near the rest of that budget, so the split
 * was buying headroom that was never needed — at the cost of the head.
 */
const COUNTER: readonly Term[] = [
  ["spine", 1],
];

/**
 * What the head inherits, per axis, as (bone, coefficient) — hips, spine and
 * chest being exactly the bones between the root and the neck.
 *
 * These mirror the rotate() calls in applyWalk. They are listed per BONE
 * rather than pre-summed because each bone's spring responds differently, so
 * the sum has to be taken after the response, not before.
 */
const SRC_ROLL_HIPS: readonly Term[] = [["hips", GAIT.hipsRoll]];
const SRC_ROLL_BODY: readonly Term[] = [
  ["spine", GAIT.spineRoll],
  ["chest", GAIT.chestRoll],
];
const SRC_YAW_HIPS: readonly Term[] = [["hips", GAIT.hipsYaw]];
const SRC_YAW_BODY: readonly Term[] = [
  ["spine", GAIT.spineYaw],
  ["chest", GAIT.chestYaw],
];
/** Double rate — the footfall bob. Note the hips contribute nothing here. */
const SRC_BOB: readonly Term[] = [
  ["spine", GAIT.spineBob],
  ["chest", GAIT.chestBob],
];
/** The paddle's equivalents, with `push` factored out as a common scalar. */
const SRC_SURGE: readonly Term[] = [
  ["hips", -0.6 * 0.055],
  ["spine", 0.055],
  ["chest", 0.7 * 0.055],
];
const SRC_WAGGLE_YAW: readonly Term[] = [
  ["hips", 0.075],
  ["spine", 0.055],
];
const SRC_WAGGLE_ROLL: readonly Term[] = [
  ["hips", 0.06],
  ["spine", 0.045],
];

/** Scratch for the response sums. This runs every frame; do not allocate. */
const numAcc = { re: 0, im: 0 };
const denAcc = { re: 0, im: 0 };

/**
 * Sum a set of bone contributions through their springs at frequency `omega`.
 *
 * Each bone in use-pose-driver is a second-order system, so its steady-state
 * response to a sinusoid is the complex gain 1 / (1 - r^2 + 2*zeta*r*i), with
 * r = omega / sqrt(k). Magnitude is how much of the commanded angle survives;
 * argument is how far behind it arrives.
 */
function respond(
  terms: readonly Term[],
  omega: number,
  out: { re: number; im: number },
): void {
  let re = 0;
  let im = 0;
  for (const [bone, a] of terms) {
    const k = GOOSE_SOFTNESS[bone] ?? 200;
    const z = GOOSE_DAMPING[bone] ?? 0.8;
    const r = omega / Math.sqrt(k);
    const dr = 1 - r * r;
    const di = 2 * z * r;
    const d = dr * dr + di * di;
    if (d < 1e-12) continue;
    re += (a * dr) / d;
    im += (-a * di) / d;
  }
  out.re = re;
  out.im = im;
}

/**
 * The counter-rotation that cancels `src` at the head, at this frequency.
 *
 * Solve G from (what the source actually does) = (what the counter actually
 * does): G = sum(A_s * H_s) / sum(w_c * H_c), both sums taken AFTER each
 * bone's spring response. Then a phasor of gain |G| and phase arg(G) is just
 * Re(G)*sin + Im(G)*cos, which is what comes back — no phase-shift identity to
 * get backwards, and no constants to go stale.
 *
 * At omega = 0 every response is 1 and this reduces to the plain sum of the
 * source coefficients: the exact-target cancellation, which is the correct
 * zero-frequency limit and the sane default when a caller passes no rate.
 */
function counterWave(
  src: readonly Term[],
  omega: number,
  phaseRad: number,
): number {
  respond(src, omega, numAcc);
  respond(COUNTER, omega, denAcc);
  const d = denAcc.re * denAcc.re + denAcc.im * denAcc.im;
  if (d < 1e-12) return 0;
  const re = (numAcc.re * denAcc.re + numAcc.im * denAcc.im) / d;
  const im = (numAcc.im * denAcc.re - numAcc.re * denAcc.im) / d;
  return re * Math.sin(phaseRad) + im * Math.cos(phaseRad);
}

/**
 * Why the counter is not simply the negative of what the head inherits.
 *
 * Cancelling the TARGETS exactly is arithmetic, and it is not enough. No bone
 * snaps to its target — each chases it through the second-order spring in
 * commit() — and the hips are far stiffer (k=850) than the spine and chest
 * doing the cancelling (k=380, k=320). At a stride near 2 Hz the hips lag their
 * target by about 31 degrees and the spine and chest by about 47 and 50.
 * Subtracting a signal from a copy of itself shifted 18 degrees does not leave
 * zero; it leaves roughly a third of the amplitude, at a new phase.
 *
 * Measured, that is exactly what happened: an exact counter took head roll from
 * 19.7 degrees peak-to-peak to 10.4 — a 47% cut where the arithmetic promised
 * 100% — and yaw barely moved, at 8%. Still a chicken.
 *
 * HOW THIS WAS GOT WRONG THE FIRST TIME, because the failure is instructive.
 * The fix was a phase lead and a gain trim, solved numerically at walking pace
 * and pasted in as constants, with a comment asserting that the stride only
 * spans 1.9 Hz walking to 2.5 Hz running and one pair therefore covered both.
 * That assertion was never measured, and it was false. At running cadence the
 * same constants cut roll by 73% instead of 99% — 5.94 degrees left against
 * 0.10 walking. The goose was steady at a walk and wobbled the moment you held
 * shift, which is a worse bug than the original, because it makes the animal
 * change character rather than merely move badly.
 *
 * So there are no constants any more. counterWave() solves the compensation
 * from the spring parameters at whatever rate the gait is actually running,
 * every frame. That is fewer numbers, not more, and it cannot go stale: retune
 * a bone's stiffness in GOOSE_SOFTNESS and the compensation follows, where a
 * fitted constant would silently stop cancelling.
 *
 * A CAUTION FOR ANYONE READING THE TARGETS. Because the counter is
 * pre-distorted, the pose targets no longer cancel on paper — summed by hand
 * the stabiliser looks like it removes only a third of the roll. That is the
 * compensation doing its job, not a bug, and "fixing" it back to an exact
 * counter is what puts the wiggle back on screen. Measure at the bones, not at
 * the targets: `npx tsx scripts/head-sweep.ts`.
 */

/**
 * A critically-damped spring. Reaches the target without overshooting on the
 * way, but carries momentum — which is exactly the difference between a neck
 * that follows the body and a neck that feels attached to it.
 */
export class Spring {
  value = 0;
  private velocity = 0;
  /**
   * `damping` is absolute, not a ratio: critical for a given stiffness is
   * 2*sqrt(stiffness), so Spring(90, 14) sits at zeta ~0.74 and overshoots a
   * little. Going below about half of critical starts to visibly wobble, which
   * is wanted on the body-lean springs and not wanted on the gait.
   */
  constructor(
    private readonly stiffness = 90,
    private readonly damping = 14,
  ) {}

  step(target: number, dt: number): number {
    // A spring NEVER recovers from a NaN: it feeds its own state forward, so one
    // bad sample poisons every frame after it. Downstream that becomes
    // setFromAxisAngle(axis, NaN), a NaN quaternion, and a shredded mesh — which
    // looks like broken skinning rather than like bad arithmetic. Reject at the
    // door and self-heal instead.
    if (!Number.isFinite(target) || dt <= 0) return this.value;
    if (!Number.isFinite(this.value) || !Number.isFinite(this.velocity)) {
      this.value = 0;
      this.velocity = 0;
    }
    const a =
      (target - this.value) * this.stiffness - this.velocity * this.damping;
    this.velocity += a * dt;
    this.value += this.velocity * dt;
    return this.value;
  }
}

export interface WalkInput {
  /**
   * Gait phase, in whole steps. Accumulated by the caller — see st.phase.
   *
   * Not distance: the stride is no longer a constant, and dividing a fixed
   * distance by a changing stride jumps the phase.
   */
  phase: number;
  /** 0 = standing, 1 = full walking speed. Scales the gait's amplitude. */
  gait: number;
  /** Seconds, for the idle breath that continues while stationary. */
  time: number;
  /** −1..1, how hard the goose is turning. Leans it into the corner. */
  turn: number;
  /**
   * Spring-lagged forward acceleration, -1..1.
   */
  lag: number;
  /** Spring-lagged sideways acceleration, −1..1. Leans into corners. */
  sway: number;
  /**
   * Underdamped whole-body lean, radians. Positive pitches the chest down.
   */
  leanPitch?: number;
  /** Underdamped bank into corners, radians. */
  leanRoll?: number;
  /** Underdamped vertical squash/stretch, world units at rest scale. */
  bounce?: number;
  /**
   * Jump pose. The parabola alone is an object being translated upward; these
   * are the cues that make it a jump — anticipation, tuck, reach, squash.
   */
  /** 0..1 anticipation dip, just before takeoff. */
  crouch?: number;
  /** True between leaving the ground and touching it again. */
  airborne?: boolean;
  /** Vertical velocity, normalised. +1 rising hard, -1 falling hard. */
  vertical?: number;
  /** 0..1, how hard the last landing was. Decays. */
  landImpact?: number;
  /**
   * How hard the head tilts up when running, as the coefficient on the run
   * blend. Exposed so it can be tuned live rather than guessed at — the value
   * that reads correctly is a matter of taste, and taste is faster to find with
   * a slider than with a rebuild.
   */
  runHeadTilt?: number;
  /** Per-segment run neck pitch, overriding RUN_NECK. Four entries. */
  runNeck?: readonly number[];
  /** Body forward pitch when running, radians at full run. */
  runBodyPitch?: number;
  /** Body sink into each step at a full run, world units. See RUN_COMPRESS. */
  runCompress?: number;
  /** Duty factor in force this frame. Below 0.5 there is a flight phase. */
  stance?: number;
  /**
   * How much of the waddle the run KEEPS, 0..1.
   *
   * The waddle is not decoration, it is the weight transfer — the body rolling
   * over each supporting leg in turn. Removing it entirely leaves a gait with
   * no left-and-right to it at all, so the only remaining signal is the vertical
   * bob, and a bob with nothing alternating underneath it reads as vibration
   * rather than as steps. See HIP_ROLL_RUN.
   */
  runRoll?: number;
  /**
   * How loaded the legs actually are, 0..1, measured off the planted feet.
   *
   * 1 when a foot is directly beneath the body and 0 when none is on the ground.
   * Supplied by the caller because only the caller can see where the feet ended
   * up; without it this file has to GUESS the loading from the phase, and a
   * guess made in one file about a schedule owned by another is exactly the
   * thing that kept coming apart.
   */
  load?: number;
  /** Trunk rock through stance at a full run, radians. See RUN_TRUNK_ROCK. */
  runRock?: number;
  // The honk used to arrive here as a 0..1 envelope driving POSTURE rather than
  // the mouth — head thrown up, neck stretched — because the bill was a single
  // sealed shell and there was nothing else a honk could move. The bill is cut
  // now and the jaw hinges for real, so the honk is the mouth alone and the
  // gait no longer hears about it.
  /** 0..1, whether the bill is carrying something. Weighs the head down. */
  carrying?: number;
  /**
   * 0 = on land, 1 = afloat.
   *
   * Swimming is not walking in water. The legs stop carrying the body and go
   * to paddling underneath it, the body sits level because it is held up by
   * the water rather than balanced over two feet, and the neck comes up — a
   * swimming goose is the tall S, not the running stretch.
   */
  swim?: number;
  /**
   * The sneak, 0..1. Shift held while standing: body down and forward, neck
   * flattened out ahead. Complementary to `run` — see duckAmount in the actor.
   */
  duck?: number;
  /** Paddle phase in radians. Advances with time, not with distance. */
  stroke?: number;
  /** How committed the legs are to stroking, 0 while coasting. */
  paddling?: number;
  /**
   * 0 = walking, 1 = running.
   */
  run?: number;
  /**
   * Set false when foot IK owns the legs — the two cannot both run, or the leg
   * is pulled between two different answers.
   */
  legs?: boolean;
  /**
   * 0..1 eased version of `airborne`, for the POSE.
   *
   * `airborne` itself stays boolean because the foot planner needs to know
   * exactly which frame the ground was lost on; the pose wants the blend.
   */
  airBlend?: number;
  /**
   * Gaze stabilisation, 0..1. How much of the gait the upper body refuses to
   * pass on to the head. 0 is the old behaviour, 1 holds the head still.
   *
   * A goose is not a chicken. The waddle is real and it is the whole gait —
   * a quarter radian of hip roll a step — but a bird does not let its head go
   * along for the ride, because the head is where the eyes are. It rides level
   * while the body works underneath it, and that contrast IS the walk: cancel
   * the waddle at the hips and you get a gliding statue, let it reach the head
   * and you get a chicken.
   */
  headSteady?: number;
  /**
   * Steps a second — ground speed over stride length.
   *
   * The stabiliser's spring compensation is a function of drive frequency, and
   * this is that frequency. It is NOT a constant: running lengthens the stride
   * AND raises the cadence, so it runs about 1.9 Hz walking and 2.5 Hz at a
   * full run. Passing a wrong or stale value does not break anything loudly,
   * it just leaves the head wobbling at whichever speed the value does not
   * match — which is precisely the bug this input exists to have fixed.
   *
   * Omit and the compensation falls back to its zero-frequency limit, an exact
   * counter on the targets. Correct for a goose standing still, and steadily
   * more wrong the faster it moves.
   */
  stepHz?: number;
  /** Paddle cycles a second, the same idea for the swim's stroke terms. */
  strokeHz?: number;
}

export function applyWalk(
  pose: PoseDriver,
  {
    phase,
    gait,
    time,
    turn,
    lag,
    sway,
    leanPitch = 0,
    leanRoll = 0,
    bounce = 0,
    legs = true,
    crouch = 0,
    airborne = false,
    airBlend,
    vertical = 0,
    landImpact = 0,
    run = 0,
    runHeadTilt = 2.0,
    runNeck = RUN_NECK,
    runBodyPitch = 0.46,
    runCompress = RUN_COMPRESS,
    stance = STANCE,
    runRoll = 0,
    load,
    runRock = RUN_TRUNK_ROCK,
    carrying = 0,
    swim = 0,
    duck = 0,
    stroke = 0,
    paddling = 0,
    headSteady = 1,
    stepHz = 0,
    strokeHz = 0,
  }: WalkInput,
): void {
  const sw = Math.max(0, Math.min(1, swim));
  const p = phase * TAU;
  const step = Math.sin(p);
  /**
   * 0 at each step transition, 1 at MID-STANCE. One cycle per footfall.
   *
   * How loaded the supporting leg is, which is what both the vertical
   * compression and the trunk rock key off — they are one event on two axes.
   *
   * The offset is the whole point and it was missing. A foot touches down at
   * phase 0 and lifts at STANCE, so mid-stance is at STANCE/2 = 0.3, NOT at the
   * quarter cycle. Without the shift this peaked at 0.25 and the body bottomed
   * out before the leg was properly under it — measured, the hip low point sat
   * at 0.40 of the way through a stance instead of 0.50, and the body was at its
   * HIGHEST at the exact instant of touchdown, which is backwards.
   *
   * The offset is PI * (STANCE - 0.5), not PI * STANCE. (1 - cos 2t) / 2 already
   * peaks at t = PI/2, which is phase 0.25, so the shift only has to make up the
   * difference between that and STANCE / 2 — a twentieth of a cycle here, not
   * three tenths. Getting that wrong by the factor of six inverted the walk:
   * measured, the body sank at mid-stance instead of vaulting over it.
   *
   * Reads the LIVE duty factor, not the constant, because the run shortens it to
   * open a flight phase. That makes this formula do the right thing for free: the
   * low stays at mid-stance wherever mid-stance moves to, and the apex — a
   * quarter cycle later — lands in the gap between the two stances, which is
   * precisely the flight phase. The body leaves the floor at the top of its own
   * push-off without anything here being told about flight at all.
   *
   * These two files describe the same gait from opposite ends and the timing
   * only agrees if they read the same number, which is what went wrong first
   * time round.
   */
  const stanceLoad =
    (1 - Math.cos(2 * (p - Math.PI * (stance - 0.5)))) * 0.5;
  const dbl = Math.sin(p * 2);
  const g = Math.max(0, Math.min(1, gait));

  // Folded into the poses below rather than applied in a second pass:
  // rotate() composes, so posing a bone twice stacks both rotations.
  /**
   * Eased, not switched.
   *
   * This was `airborne ? 1 : 0`, and every airborne term keys off it — the
   * wings flare 0.62 rad, the body pitches, the legs tuck. Flicking that from 0
   * to 1 in one frame snaps the wings fully open the instant a foot leaves the
   * ground, which is survivable on a jump you asked for (the crouch telegraphs
   * it) and reads as a glitch when the goose simply walks off a ledge and the
   * wings bang open under it.
   *
   * The caller eases it, because the caller is the one with state. Falls back
   * to the hard switch so nothing that omits it silently stops animating.
   */
  const air = airBlend ?? (airborne ? 1 : 0);
  const rising = Math.max(0, vertical);
  const falling = Math.max(0, -vertical);
  // Wings out on takeoff, wider on the way down.
  const flare = air * 0.62 + crouch * 0.22 + falling * 0.3;
  /**
   * And beating, not merely held out.
   *
   * The jump is a flap: a goose is too heavy to hop a fence and gets over one
   * by half-flying, which is where the hang time in JUMP_GRAVITY comes from.
   * Held-open wings are right for the fraction of a second the old jump lasted
   * and read as a bird stuck to the ceiling once it lasts 1.44 s.
   *
   * Weighted by `rising`, so it powers hard on the way up and settles toward a
   * glide over the top — which is both what the bird does and what makes the
   * apex legible as the apex, rather than as the middle of a uniform arc.
   */
  const flap = Math.sin(time * FLAP_HZ * TAU) * air * (0.18 + 0.5 * rising);
  const airPitch = (rising * -0.16 + falling * 0.2) * Math.max(air, crouch);
  const fold = crouch * 0.16 + landImpact * 0.2;
  // Running and swimming are opposite postures, so the run blend is cut on
  // water rather than added to it.
  const d = Math.max(0, Math.min(1, duck)) * (1 - sw);
  const r = Math.max(0, Math.min(1, run)) * g * (1 - sw);
  /**
   * The run's share of the NECK and HEAD, stood down by the crouch.
   *
   * Everything else the run does — the forward lean, the waddle removal, the
   * stride — is compatible with a crouch and stays at full strength. These two
   * are not, because they are counter-rotations on the same bones as the
   * crouch's fold and they SUM. The head takes -r * runHeadTilt (2.15) for the
   * run and -d * 2.25 for the crouch, so holding both asked for 4.4 rad against
   * a 175 degree limit: not a blend of two poses, a bone pinned against its
   * stop.
   *
   * The crouch wins the argument on these because it is the more specific pose.
   * A crouched sprint is a low stalk that happens to be fast, so the neck stays
   * folded and only the engine changes — while the body still leans into it,
   * which is what running upright was missing.
   */
  const rn = r * (1 - d);
  // Extreme, not a lean — a half-measure just reads as walking faster.
  const runPitch = r * runBodyPitch;
  /**
   * Trunk pitch oscillation — the second half of what makes a run a run.
   *
   * Running birds do not hold the trunk at a fixed lean. It rocks once per
   * stance, and the direction is not arbitrary: measured on running birds the
   * trunk rotates BACKWARD through stance and forward again across the
   * transition, with the excursion growing with speed (a couple of degrees at
   * moderate pace, up to about 18 at a sprint, depending on where the virtual
   * pivot sits relative to the centre of mass).
   *
   * Subtracted from the lean below, so it nods AGAINST the forward pitch while
   * the foot is loaded and returns as the body passes over. Paired with the
   * compression in `footfall`, the two are the same event seen on two axes: the
   * body sinks and rocks back onto the leg, then rises and tips forward off it.
   *
   * DEFAULTED OFF, and that is a rendering decision overruling the biomechanics.
   * The footfall rate at a run here is about 2.85 Hz, and this file already
   * knows what that frequency does to a rotation — see HIP_ROLL_RUN, where a
   * 2.23 cm head sway at 2.85 Hz "does not read as a sway, it reads as a
   * vibration". A trunk rock is the same signal at the same rate on a longer
   * lever, since the neck and head sit on top of it and amplify whatever the
   * chest does. Measured on an ostrich it is real; rendered on a goose at three
   * cycles a second it is shake.
   *
   * Left as a slider rather than deleted, because the effect is correct and a
   * slower or heavier creature would want it.
   */
  const trunkRock = stanceLoad * runRock * r;
  // The sneak leans on the same bones as the run, at a fraction of the angle:
  // it is the same shape held still, not a separate pose.

  // Roll is the whole gait; the yaw swings the body toward the planted foot.
  // The waddle is weight shifting from foot to foot. Afloat there is no
  // weight on the feet, so it goes.
  const land = 1 - sw;
  /** The gait's own oscillation, before any bone-specific share. */
  const swing = step * g * land;
  const bob = dbl * g * land;
  /**
   * How much of the hips' yaw survives into the run.
   *
   * The waddle's read is the ROLL — a quarter radian at the hips. The yaw is a
   * tenth of that and only swings the body toward the planted foot, so cutting
   * it costs the gait almost nothing to look at. It costs a great deal to
   * leave in: the run straightens the neck and carries the head about half a
   * metre AHEAD of the hips, and a body yaw pivots that lever sideways.
   * 0.07 rad on a 0.5 m arm is 3.5 cm each way, which is the 6-9 cm of
   * side-to-side head travel measured at a run and none of the 1.7 cm measured
   * at a walk, where the head sits stacked over the hips instead.
   *
   * No amount of counter-ROTATION downstream fixes that, which is the trap
   * here — the stabiliser holds the head's facing perfectly while the whole
   * head is swung sideways underneath it. Some sources have to be cut rather
   * than cancelled.
   */
  const hipYawScale = 1 - HIP_YAW_RUN * r;
  /** The waddle, faded out by the run. See HIP_ROLL_RUN. */
  /**
   * The waddle, faded by the run — but not necessarily to nothing.
   *
   * HIP_ROLL_RUN was set to 1 to kill the roll outright at a run, because at
   * 2.85Hz the residual head sway read as a vibration (3.87cm at full roll
   * against 0.68cm at none). That fixed the head and cost the gait its weight
   * transfer: with no roll the two legs are interchangeable and nothing says
   * which one is carrying. `runRoll` buys some of it back deliberately, as a
   * trade against head steadiness rather than by accident.
   */
  const hipRollScale = 1 - HIP_ROLL_RUN * r * (1 - runRoll);
  pose.rotate(
    "hips",
    0,
    GAIT.hipsYaw * hipYawScale * swing,
    GAIT.hipsRoll * hipRollScale * swing,
  );
  // Banks into a turn afloat, the way a boat leans on its own wake.
  if (sw > 0) pose.rotate("spine", 0, 0, -turn * 0.16 * sw);
  // Lean rides on spine/chest, not hips: the thighs are children of hips, so
  // leaning there lifts the feet off the grass.
  pose.rotate(
    "spine",
    GAIT.spineBob * bob +
      leanPitch * 0.55 +
      airPitch * 0.55 +
      fold * 0.5 +
      (runPitch - trunkRock) * 0.55 +
      d * 0.15,
    GAIT.spineYaw * swing,
    GAIT.spineRoll * swing + leanRoll * 0.55,
  );
  pose.rotate(
    "chest",
    GAIT.chestBob * bob +
      leanPitch * 0.45 +
      airPitch * 0.45 +
      fold * 0.4 +
      (runPitch - trunkRock) * 0.45 +
      d * 0.12,
    GAIT.chestYaw * swing,
    GAIT.chestRoll * swing + leanRoll * 0.45,
  );

  /**
   * Vertical motion of the body, and the real difference between the two gaits.
   *
   * A faster walk is not a run. The mechanical distinction is not stride length
   * or step rate — it is WHICH WAY the body moves over a planted foot:
   *
   *   walking  inverted pendulum — the body VAULTS over a straight leg and is
   *            HIGHEST at mid-stance, like a wheel rolling over its spoke
   *   running  spring-mass — the leg compresses and rebounds, so the body is
   *            LOWEST at mid-stance and recovers between footfalls
   *
   * So the bob does not just grow with speed, it INVERTS. That is the push-off:
   * the body sinking into each step and springing back out of it, rather than
   * being carried over the top of it.
   *
   * Birds specifically do not do the human thing of breaking into an aerial
   * phase at the transition — they use "grounded running", keeping a duty factor
   * above 0.5 with both feet still cycling on the ground, and shift the KINETICS
   * from vaulting to bouncing while the footfall pattern stays put. So there is
   * no flight phase to add here, which is just as well: the feet are planned by
   * IK against the ground and an aerial phase would have nothing to plant on.
   *
   * The run half is a DIP rather than a lift, and that part is forced. Hip
   * height is leg reach on this rig — the leg measures 0.359 and spans 0.358
   * standing, so it is straight already and there is no headroom to raise the
   * body at all. Real running gets its low mid-stance by compressing the leg,
   * not by lifting the rest of the cycle, and compressing is the one direction
   * a straight leg can still go. Same constraint that limits DUCK_DROP.
   *
   * Afloat there are no footfalls and the body rides the water instead — a
   * slower rise and fall unrelated to the leg cycle.
   */
  const footfall =
    (WALK_VAULT * (1 - r) * stanceLoad +
      // Centred on the run's crouched baseline rather than hanging below it, so
      // the body rises BETWEEN footfalls as well as sinking into them: down on
      // the loaded leg, up as it pushes off, down onto the other one. A dip-only
      // curve has the same timing but only half the travel, and reads as a
      // slight sag rather than as a bounce — one foot, up-down, next foot.
      //
      // Only possible because the run crouches. The rise is half of runCompress
      // above that baseline, so the crouch has to be at least that or the body
      // climbs past its standing height, where the legs are already straight and
      // the reach guard starts dragging the feet.
      // The run's compression is driven by the MEASURED load when the caller
      // supplies it, falling back to the phase estimate only when it cannot.
      // This is the difference between the body sinking because a leg is under
      // it and the body sinking because a sine wave said so at the same moment.
      // The first cannot desynchronise from the feet; the second is a second
      // schedule that has to be kept in step by hand, and repeatedly was not.
      runCompress * r * (0.5 - (load ?? stanceLoad))) *
    g *
    land;
  const wake = Math.sin(time * 1.1) * 0.008 * sw;

  /**
   * The body has to carry the swim, because nothing else can.
   *
   * The legs are the only part actually doing the work and they are the one
   * part nobody can see — measured, every one of the 23620 leg vertices sits
   * below the waterline, and the pond is opaque. Cutting the walk's body
   * motion afloat was right, but leaving nothing in its place left a rigid
   * decoy gliding across the pond. What reads as swimming from above is the
   * hull: a shove forward on each push, a tail-led waggle as the thrust comes
   * off alternate feet, and a slow roll that has nothing to do with either.
   */
  const push = sw * paddling;
  /**
   * Rocking on the water, independent of the paddle.
   *
   * Without this the glide measured 0.000 on every axis — the moment the legs
   * stopped, the goose became a held prop sliding across the pond. A hull sits
   * in a moving fluid whether or not anything is driving it, and the three
   * periods are deliberately unrelated so they never resolve into a loop.
   */
  const afloat = sw * 0.55 + sw * (1 - paddling) * 0.45;
  const rockPitch = Math.sin(time * 0.9) * 0.03 * afloat;
  const rockRoll = Math.sin(time * 0.71 + 1.3) * 0.038 * afloat;
  const rockYaw = Math.sin(time * 0.53 + 2.1) * 0.022 * afloat;
  // Two pushes per stroke cycle — one per foot — so the surge is double rate.
  const surge = Math.sin(stroke * 2) * 0.055 * push;
  // The waggle is single rate: it leans away from whichever foot is driving.
  const waggle = Math.sin(stroke);
  pose.rotate(
    "spine",
    surge + rockPitch,
    waggle * 0.055 * push + rockYaw,
    waggle * 0.045 * push + rockRoll,
  );
  pose.rotate(
    "hips",
    -surge * 0.6 + rockPitch * 0.5,
    waggle * 0.075 * push + rockYaw * 0.6,
    waggle * 0.06 * push + rockRoll * 0.7,
  );
  pose.rotate("chest", surge * 0.7 + rockPitch * 0.8, 0, rockRoll * 0.6);
  pose.rotate("tail", surge * 0.5 + rockPitch, waggle * 0.12 * push, rockRoll);
  pose.translate("root", 0, footfall + wake + bounce, 0);

  /**
   * Gaze stabilisation — why the head stops reading as a chicken's.
   *
   * The hips roll 0.28 rad a step and everything above them is a child of the
   * hips, so absent anything else the head inherits the lot. Measured down the
   * chain it was arriving at about 0.13 rad — 7.6 degrees of head roll, twice
   * a stride, plus a 3-degree bob at double rate. That is not a goose; that is
   * a chicken, and it is the single loudest thing about the walk.
   *
   * WHY IT IS CANCELLED HERE AND NOT AT THE HEAD. The obvious fix is to
   * counter-rotate the head by whatever it inherits. It does not work, and the
   * reason is in use-pose-driver: every bone chases its target through a
   * spring, and the head's is the softest on the bird (k=45, so about 1.1 Hz).
   * A stride runs near 2 Hz. Ask that spring for a 2 Hz counter-rotation and it
   * returns a third of the amplitude, a third of a cycle late — a counter
   * arriving that far out of phase ADDS to the wiggle over part of the cycle.
   * That is the effect already recorded in GOOSE_SOFTNESS, where stiffening the
   * neck to steady the head made it measurably worse.
   *
   * So the cancellation goes on spine and chest instead, at k=380 and k=320 —
   * roughly 3 Hz, comfortably above stride rate, where the spring actually
   * tracks what it is asked for. The head is then held still by not being
   * shaken in the first place, which needs no spring bandwidth at all.
   *
   * WHAT IS DELIBERATELY NOT CANCELLED: the hips. The waddle is the gait. Kill
   * it at the source and the goose glides along like a chess piece. It stays at
   * full strength on the hips, legs and tail — where it reads — and stops at
   * the shoulders. The contrast between a working body and a level head is the
   * walk, and it is also just what a real bird does: the head is where the eyes
   * are, and eyes want a stable platform.
   *
   * Slow motion is left alone throughout — the swim rock, `lag`, `sway`, the
   * lean. Those are momentum and sea state, not gait, and a head that ignores
   * them reads as detached from the body rather than stabilised on it.
   */
  const steady = Math.max(0, Math.min(1, headSteady)) * (1 - RUN_FADE * r);
  if (steady > 0) {
    // Radians a second for each driver. `p` advances one full cycle per step,
    // so the step rate IS the frequency of sin(p); `dbl` and `surge` are the
    // double-rate terms and get twice it.
    const wStep = TAU * stepHz;
    const wStroke = TAU * strokeHz;

    // What the neck base inherits from the torso, per axis, already corrected
    // for what each bone's spring will actually do with it. The stroke terms
    // are the swim's equivalent of a footfall — same fast, mechanical rate,
    // same reason to keep it out of the head — and carry their own frequency
    // because the paddle is not the stride.
    const counterPitch =
      counterWave(SRC_BOB, 2 * wStep, 2 * p) * g * land +
      counterWave(SRC_SURGE, 2 * wStroke, 2 * stroke) * push;
    const counterYaw =
      (counterWave(SRC_YAW_HIPS, wStep, p) * hipYawScale +
        counterWave(SRC_YAW_BODY, wStep, p)) *
        g *
        land +
      counterWave(SRC_WAGGLE_YAW, wStroke, stroke) * push;
    const counterRoll =
      (counterWave(SRC_ROLL_HIPS, wStep, p) * hipRollScale +
        counterWave(SRC_ROLL_BODY, wStep, p)) *
        g *
        land +
      counterWave(SRC_WAGGLE_ROLL, wStroke, stroke) * push;

    /**
     * NOT turned into the posture's frame, though that was tried.
     *
     * pose.rotate() works about each bone's REST-pose world axes, so once the
     * run tips the spine forward the chest's axes are no longer the world's,
     * and a counter commanded there does not point where a hips-frame roll
     * points. Correcting for it looks obviously right and made things worse:
     *
     *   rotation off   yaw 97%   roll 98%
     *   rotation on    yaw 33%   roll 97%
     *
     * Roll gained nothing and yaw lost two thirds — which showed up as the head
     * swinging side to side at a run, the one thing the stabiliser is for. The
     * mistake was doing half a transform: the counter was rotated into the
     * chest's frame while the chest SOURCE it cancels was left in the hips'.
     * Roll's coefficient is about eight times yaw's, so that asymmetry spills a
     * large slice of roll into the yaw command, and the yaw command flips sign.
     *
     * Doing the whole transform consistently is the real answer, and it is only
     * worth it if a measurement says the residual matters. It does not: with the
     * rotation off, roll is 98% and yaw 97%, and what is left is a fraction of a
     * degree. Half a correction is worse than none.
     */
    for (const [bone, share] of COUNTER) {
      pose.rotate(
        bone,
        -counterPitch * share * steady,
        -counterYaw * share * steady,
        -counterRoll * share * steady,
      );
    }
  }

  // Legs, half a cycle apart. Names have no dot — the exporter flattens
  // `thigh.L` to `thighL`, and an unresolved name animates nothing.
  if (legs) {
    /**
     * Paddling, when afloat.
     *
     * Alternating and further back than a stride, because a paddle pushes
     * water behind rather than planting ground below. Never seen directly —
     * the pond surface is drawn over it — but it drives what little of the
     * legs shows at the waterline.
     */
    // A stroke is not a step. The power half drives the webbed foot back with
    // the leg straight, and the recovery folds the knee to bring it forward
    // edge-on, where a walking leg instead lifts to clear the ground. Left and
    // right are half a cycle apart, so one is always pushing.
    const swing = sw * paddling * 0.34;
    const kick = Math.sin(stroke);
    const kickL = kick;
    const kickR = -kick;
    // Legs trail slightly astern while coasting rather than hanging plumb.
    const trail = sw * (1 - paddling) * 0.16;

    pose.rotate("thighL", step * 0.5 * g * land + kickL * swing - trail, 0, 0);
    pose.rotate("thighR", -step * 0.5 * g * land + kickR * swing - trail, 0, 0);
    // Knee folds only on the lift, so the swinging leg clears the ground.
    // Afloat it folds on the RECOVERY instead — the opposite half.
    pose.rotate(
      "shinL",
      -Math.max(0, step) * 0.6 * g * land + Math.max(0, kickL) * swing * 1.5,
      0,
      0,
    );
    pose.rotate(
      "shinR",
      -Math.max(0, -step) * 0.6 * g * land + Math.max(0, kickR) * swing * 1.5,
      0,
      0,
    );
    // The web feathers on the way forward and opens flat on the push.
    pose.rotate(
      "footL",
      (-step * 0.22 + Math.max(0, step) * 0.45) * g * land -
        kickL * swing * 0.8,
      0,
      0,
    );
    pose.rotate(
      "footR",
      (step * 0.22 + Math.max(0, -step) * 0.45) * g * land -
        kickR * swing * 0.8,
      0,
      0,
    );
  }

  // Idle drift so a standing goose is not a statue.
  const idle = Math.sin(time * 0.8) * 0.012;
  const breath = Math.sin(time * 1.6) * 0.006;
  // The neck's and head's own per-step motion fades out as the stabiliser comes
  // in. These were hand-tuned partial counters to the torso — useful when the
  // waddle still reached this far, and pure re-introduced wiggle once it does
  // not. Left on the same dial so there is only ever one thing to turn.
  const loose = 1 - steady;
  for (const [i, bone] of ["neck1", "neck2", "neck3", "neck4"].entries()) {
    const k = NECK_SHARE[i] ?? 0;
    // Lag builds DOWN the chain — the base barely moves, the tip trails most,
    // which is how a real neck behaves and why a uniform lean looks stiff.
    const trail = (i + 1) / 4;
    pose.rotate(
      bone,
      // Positive pitch here lowers and extends the neck, so the S flattens
      // into a straight line held out in front — the running silhouette.
      /**
       * The neck's own per-step motion, kept small.
       */
      // pitch
      GAIT.neckBob * bob * k * (1 - r * 0.8) * loose +
        idle * k * (1 - r) +
        lag * 0.13 * trail +
        rn * (runNeck[i] ?? 0) -
        // Neck lifts into a taller S afloat.
        sw * 0.07 * (1.3 - trail * 0.5) +
        // A full bill pulls the neck down, most at the tip.
        carrying * 0.06 * trail +
        // The sneak folds the neck down hard, base leading. This is the main
        // read of the crouch: the body drop is only 0.17, and a goose that
        // lowers its hips without lowering its head just looks short.
        d * 0.46 * (1.15 - trail * 0.3),
      // yaw
      turn * 0.05 * k,
      // roll
      GAIT.neckRoll * swing * k * loose - sway * 0.1 * trail,
    );
  }
  pose.rotate(
    "head",
    /**
     * Counter-rotated hard: the head inherits the whole straightened neck, and
     * without this the beak points at the ground while the neck itself is level.
     */
    /**
     * Beak UP when running, not merely level — a goose at speed carries its bill
     * tipped up. Needs the head's joint limit opened to match, or it is clamped.
     */
    -0.035 * bob * (1 - r * 0.8) * loose +
      breath -
      lag * 0.18 -
      rn * runHeadTilt -
      // Counter to the neck above, or the sneak stares at its own feet.
      // Counter to the neck above, and note the sign: this term LIFTS the head
      // against the fold. Raising it to 0.5 while trying to make the sneak
      // lower did the exact opposite and left the crouch's head at 0.723 —
      // ABOVE the run's 0.593.
      //
      // Big, and it has to be, because the fold above is applied to EVERY neck
      // bone. Four segments at 0.46 accumulate to about 1.84 rad — 105 degrees —
      // so a counter of 0.16 left the head hanging nearly straight down and the
      // goose creeping along staring at its own feet.
      //
      // This is the same trick the run uses one call below: runNeck sums to 0.93
      // and runHeadTilt counters it at 2.15. The neck carries the pose, the head
      // is rotated back out of it, and what is left over is the bill's angle.
      // OVER the fold here, not under, and the reason is a rig quirk. The
      // head-to-beak BONE vector points 39 degrees UP at rest — the same offset
      // BILL_DROP exists to correct — so levelling those two bones leaves the
      // bill axis itself pointing 54 degrees at the floor. Walking measures the
      // beak bone 0.022 ABOVE the head bone, and that is what a bill held
      // forward reads as. The counter has to overshoot the fold by about that
      // much to put the crouch in the same place.
      d * 2.25,
    turn * 0.1,
    0.04 * swing * loose - sway * 0.1,
  );

  // The loosest thing on the bird, so it keeps swinging for a beat.
  pose.rotate(
    "tail",
    -lag * 0.12 - leanPitch * 0.5,
    step * 0.1 * g,
    step * 0.07 * g + sway * 0.1,
  );
  pose.rotate("wingL", 0, 0, dbl * 0.04 * g + g * 0.05 + flare + flap);
  pose.rotate("wingR", 0, 0, -dbl * 0.04 * g - g * 0.05 - flare - flap);
}
