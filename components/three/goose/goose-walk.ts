/**
 * The waddle, generated rather than keyframed.
 */
import type { PoseDriver } from "./use-pose-driver";

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
  /** Cumulative distance travelled, in world units. */
  distance: number;
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
  /**
   * 0..1 honk envelope. Drives POSTURE, not the mouth: head thrown up and
   * forward, which works on a model whose bill cannot open.
   */
  honk?: number;
  /**
   * 0 = walking, 1 = running.
   */
  run?: number;
  /**
   * Set false when foot IK owns the legs — the two cannot both run, or the leg
   * is pulled between two different answers.
   */
  legs?: boolean;
}

export function applyWalk(
  pose: PoseDriver,
  {
    distance,
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
    vertical = 0,
    landImpact = 0,
    run = 0,
    runHeadTilt = 2.0,
    honk = 0,
  }: WalkInput,
): void {
  const p = (distance / STRIDE) * TAU;
  const step = Math.sin(p);
  const dbl = Math.sin(p * 2);
  const g = Math.max(0, Math.min(1, gait));

  // Folded into the poses below rather than applied in a second pass:
  // rotate() composes, so posing a bone twice stacks both rotations.
  const air = airborne ? 1 : 0;
  const rising = Math.max(0, vertical);
  const falling = Math.max(0, -vertical);
  // Wings out on takeoff, wider on the way down.
  const flare = air * 0.62 + crouch * 0.22 + falling * 0.3;
  const airPitch = (rising * -0.16 + falling * 0.2) * Math.max(air, crouch);
  const fold = crouch * 0.16 + landImpact * 0.2;
  const r = Math.max(0, Math.min(1, run)) * g;
  // Extreme, not a lean — a half-measure just reads as walking faster.
  const runPitch = r * 0.46;

  // Roll is the whole gait; the yaw swings the body toward the planted foot.
  pose.rotate("hips", 0, step * 0.07 * g, step * 0.28 * g);
  // Lean rides on spine/chest, not hips: the thighs are children of hips, so
  // leaning there lifts the feet off the grass.
  pose.rotate(
    "spine",
    dbl * 0.02 * g +
      leanPitch * 0.55 +
      airPitch * 0.55 +
      fold * 0.5 +
      runPitch * 0.55,
    step * -0.03 * g,
    step * -0.05 * g + leanRoll * 0.55,
  );
  pose.rotate(
    "chest",
    dbl * 0.025 * g +
      leanPitch * 0.45 +
      airPitch * 0.45 +
      fold * 0.4 +
      runPitch * 0.45,
    step * -0.02 * g,
    step * -0.06 * g + leanRoll * 0.45,
  );

  // Twice the step rate — one rise per footfall — offset so it never sinks
  // below rest. `bounce` is the springy squash on top.
  pose.translate("root", 0, (1 - Math.cos(p * 2)) * 0.5 * 0.02 * g + bounce, 0);

  // Legs, half a cycle apart. Names have no dot — the exporter flattens
  // `thigh.L` to `thighL`, and an unresolved name animates nothing.
  if (legs) {
    pose.rotate("thighL", step * 0.5 * g, 0, 0);
    pose.rotate("thighR", -step * 0.5 * g, 0, 0);
    // Knee folds only on the lift, so the swinging leg clears the ground.
    pose.rotate("shinL", -Math.max(0, step) * 0.6 * g, 0, 0);
    pose.rotate("shinR", -Math.max(0, -step) * 0.6 * g, 0, 0);
    pose.rotate("footL", (-step * 0.22 + Math.max(0, step) * 0.45) * g, 0, 0);
    pose.rotate("footR", (step * 0.22 + Math.max(0, -step) * 0.45) * g, 0, 0);
  }

  // Idle drift so a standing goose is not a statue.
  const idle = Math.sin(time * 0.8) * 0.012;
  const breath = Math.sin(time * 1.6) * 0.006;
  for (const [i, bone] of ["neck1", "neck2", "neck3", "neck4"].entries()) {
    const k = 1 - i * 0.2;
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
      dbl * 0.016 * g * k * (1 - r * 0.8) +
        idle * k * (1 - r) +
        lag * 0.13 * trail +
        r * (RUN_NECK[i] ?? 0) -
        // Neck stretches up on a honk, base leading.
        honk * 0.12 * (1.2 - trail * 0.4),
      // yaw
      turn * 0.05 * k,
      // roll
      step * -0.028 * g * k - sway * 0.1 * trail,
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
    dbl * -0.035 * g * (1 - r * 0.8) +
      breath -
      lag * 0.18 -
      r * runHeadTilt -
      honk * 0.5,
    turn * 0.1,
    step * 0.04 * g - sway * 0.1,
  );

  // The loosest thing on the bird, so it keeps swinging for a beat.
  pose.rotate(
    "tail",
    -lag * 0.12 - leanPitch * 0.5,
    step * 0.1 * g,
    step * 0.07 * g + sway * 0.1,
  );
  pose.rotate("wingL", 0, 0, dbl * 0.04 * g + g * 0.05 + flare);
  pose.rotate("wingR", 0, 0, -dbl * 0.04 * g - g * 0.05 - flare);
}
