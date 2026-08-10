/**
 * Feet that stay where you put them.
 */
import * as THREE from "three";

import { STRIDE } from "./goose-walk";

/** Fraction of the cycle a foot spends on the ground. */
const STANCE = 0.6;
/** How high the foot arcs during the swing, in world units. */
const STEP_LIFT = 0.055;
/** Below this speed the goose is standing, and neither foot should lift. */
const MOVING = 0.12;
/**
 * Plant-height bias. NEGATIVE at rest, which looks wrong and is right.
 */
const GROUND_CLEARANCE = -0.014;
/**
 * Extra clearance at a full run — follower error grows with cadence.
 */
const RUN_CLEARANCE = 0.022;
/**
 * Extra clearance once the legs are cycling. Tuned to standing alone, the walk
 * clipped on 87% of frames; tuned to the walk, the idle goose floated.
 */
const WALK_CLEARANCE = 0.024;

/** How far the feet tuck up toward the body in mid-air, world units. */
const TUCK = 0.045;
/** How quickly the feet reach the tuck, and recover from it. */
const TUCK_RESPONSE = 11;
/**
 * Seconds to ease the feet down after landing. Placing them in one frame moved
 * them 0.11 against 0.019 while walking, and that spike is the visible snap.
 */
const RECOVER = 0.18;
/**
 * How far ahead to plant, as a fraction of stride. DERIVED.
 */
const REACH_AHEAD = 1 - STANCE / 2;

export interface FootState {
  /** Live world position of the foot. */
  readonly pos: THREE.Vector3;
  /** True while the foot is on the ground and owns its position. */
  planted: boolean;
}

export interface FootPlan {
  L: FootState;
  R: FootState;
  /** How far the hips should drop so both legs can reach, world units. */
  hipDrop: number;
}

/**
 * Where a foot rests relative to the body, in the goose's own frame.
 */
export interface FootAnchor {
  x: number;
  z: number;
}

interface Foot {
  pos: THREE.Vector3;
  from: THREE.Vector3;
  to: THREE.Vector3;
  planted: boolean;
  anchor: FootAnchor;
  groundY: number;
  /** Live plant-height bias; grows with gait speed. */
  clearance: number;
}

/**
 * Distance-driven, matching the gait: a foot lifts after a fixed distance no
 * matter how fast it was covered, which is what makes non-skating free.
 */
export class FootPlanner {
  private readonly feet: Record<"L" | "R", Foot>;
  private readonly scratch = {
    fwd: new THREE.Vector3(),
    side: new THREE.Vector3(),
    want: new THREE.Vector3(),
  };
  private wasAirborne = false;
  /** Whether the goose was moving last frame, for the settle-to-stance ease. */
  private wasMoving = false;
  /** Seconds left of the post-landing ease. */
  private recover = 0;
  private lastDt = 1 / 60;

  /** Frame time, for the mid-air tuck. Set before update(). */
  setDelta(dt: number): void {
    if (Number.isFinite(dt) && dt > 0) this.lastDt = Math.min(dt, 0.05);
  }

  constructor(anchors: { L: FootAnchor; R: FootAnchor }, groundY: number) {
    const mk = (anchor: FootAnchor): Foot => ({
      pos: new THREE.Vector3(),
      from: new THREE.Vector3(),
      to: new THREE.Vector3(),
      planted: true,
      anchor,
      groundY,
      clearance: GROUND_CLEARANCE,
    });
    this.feet = { L: mk(anchors.L), R: mk(anchors.R) };
  }

  /** Place both feet under the body. Call once the body position is known. */
  reset(bodyPos: THREE.Vector3, heading: number): void {
    for (const key of ["L", "R"] as const) {
      const f = this.feet[key];
      this.plantSpot(f, bodyPos, heading, 0, f.pos);
      f.from.copy(f.pos);
      f.to.copy(f.pos);
      f.planted = true;
    }
  }

  private plantSpot(
    f: Foot,
    bodyPos: THREE.Vector3,
    heading: number,
    ahead: number,
    out: THREE.Vector3,
  ): void {
    const { fwd, side } = this.scratch;
    // Heading is a Y rotation, so forward is (sin, 0, cos) and right is its
    // perpendicular. Deriving both from the same angle keeps them consistent
    // when the goose spins on the spot.
    fwd.set(Math.sin(heading), 0, Math.cos(heading));
    side.set(Math.cos(heading), 0, -Math.sin(heading));
    // Both the sideways stance and the fore/aft offset come from the rest pose,
    // so a planted foot sits exactly where that leg naturally hangs.
    out
      .set(bodyPos.x, f.groundY + f.clearance, bodyPos.z)
      .addScaledVector(fwd, ahead + f.anchor.z)
      .addScaledVector(side, f.anchor.x);
  }

  /**
   * @param maxOffset how far a planted foot may sit from where that leg
   *   naturally hangs before the leg would be over-extended.
   */
  update(
    bodyPos: THREE.Vector3,
    heading: number,
    speed: number,
    distance: number,
    maxOffset = Infinity,
    airborne = false,
    vertical = 0,
    run = 0,
  ): FootPlan {
    const cycling = Math.max(0, Math.min(1, speed / 0.95));
    const clearance =
      GROUND_CLEARANCE +
      cycling * WALK_CLEARANCE +
      Math.max(0, Math.min(1, run)) * RUN_CLEARANCE;
    const cycle = distance / STRIDE;
    const moving = speed > MOVING;

    /**
     * In the air there is no ground to own. Left alone the body leaves and the
     * targets stay on the grass, so the IK stretches the legs down after them.
     */
    if (airborne) {
      for (const key of ["L", "R"] as const) {
        const f = this.feet[key];
        f.planted = false;
        this.plantSpot(f, bodyPos, heading, 0, this.scratch.want);
        const k = Math.min(1, TUCK_RESPONSE * this.lastDt);
        f.pos.x += (this.scratch.want.x - f.pos.x) * k;
        f.pos.z += (this.scratch.want.z - f.pos.z) * k;
        // Tucked while climbing, reaching down while dropping. The reach is
        // the cue that tells you a landing is coming before it happens.
        const rise = Math.max(0, vertical);
        const fall = Math.max(0, -vertical);
        const lift = TUCK * (0.35 + rise * 1.5) - fall * TUCK * 1.1;
        f.pos.y += (bodyPos.y + f.groundY + lift - f.pos.y) * k;
        f.from.copy(f.pos);
        f.to.copy(f.pos);
      }
      this.wasAirborne = true;
      return { L: this.feet.L, R: this.feet.R, hipDrop: 0 };
    }

    if (this.wasAirborne) {
      // Landed. Aim both feet at where the body actually is — but travel there
      // over RECOVER seconds rather than teleporting, which is what made the
      // touchdown frame jump.
      this.wasAirborne = false;
      this.recover = RECOVER;
      for (const key of ["L", "R"] as const) {
        const f = this.feet[key];
        f.from.copy(f.pos);
        this.plantSpot(f, bodyPos, heading, 0, f.to);
        f.planted = true;
      }
    }
    /**
     * Coming to a stop settles into a stance; it does not freeze the pose.
     *
     * Holding the feet wherever they happen to be is fine if both are down and
     * wrong if one was mid-swing — it stays lifted and tucked under the body
     * indefinitely, which reads as the foot being inside the goose. Walking
     * into a wall is the usual way to hit it, because the goose stops at
     * whatever point in the stride the wall happens to arrive.
     */
    if (!moving && this.wasMoving) {
      this.wasMoving = false;
      this.recover = RECOVER;
      for (const key of ["L", "R"] as const) {
        const f = this.feet[key];
        f.from.copy(f.pos);
        this.plantSpot(f, bodyPos, heading, 0, f.to);
        f.planted = true;
      }
    }
    if (moving) this.wasMoving = true;

    if (this.recover > 0) {
      this.recover = Math.max(0, this.recover - this.lastDt);
      const t = 1 - this.recover / RECOVER;
      // Ease out: fast at first, settling as it arrives, like weight coming
      // onto a foot rather than a foot being placed.
      const e = 1 - (1 - t) * (1 - t);
      for (const key of ["L", "R"] as const) {
        const f = this.feet[key];
        f.pos.lerpVectors(f.from, f.to, e);
      }
      return { L: this.feet.L, R: this.feet.R, hipDrop: 0 };
    }

    for (const key of ["L", "R"] as const) {
      const f = this.feet[key];
      f.clearance = clearance;
      // Right foot half a cycle behind the left.
      const phase = mod1(cycle + (key === "R" ? 0.5 : 0));

      if (!moving) {
        // Settled. Hold the stance rather than re-planting, or a stationary
        // goose shuffles on the spot.
        f.planted = true;
        continue;
      }

      if (phase < STANCE) {
        if (!f.planted) {
          // Just landed. Freeze exactly where the swing ended, so there is no
          // jump between the last swing frame and the first stance frame.
          f.planted = true;
          f.pos.copy(f.to);
        }
        // Planted: position is untouched. This single omission is what stops
        // the skating — the foot simply does not move while the body does.
        //
        // Except when it cannot be honoured. Turning on the spot, stopping
        // hard, or being shoved all strand a planted foot somewhere the leg
        // can no longer reach, and a leg stretched past straight does not fail
        // gracefully — it drags, which looks exactly like the skating this
        // whole file exists to remove. Clamping to the reachable boundary
        // trades a small, occasional, deliberate slide for never breaking.
      } else {
        const t = (phase - STANCE) / (1 - STANCE);
        if (f.planted) {
          f.planted = false;
          f.from.copy(f.pos);
          this.plantSpot(f, bodyPos, heading, STRIDE * REACH_AHEAD, f.to);
        }
        // Ease in and out of the swing; a linear foot looks mechanical.
        const e = t * t * (3 - 2 * t);
        f.pos.lerpVectors(f.from, f.to, e);
        // Arc over the ground. sin gives zero lift at both ends for free.
        f.pos.y = f.groundY + f.clearance + Math.sin(Math.PI * t) * STEP_LIFT;
      }

      // Reachability guard, for BOTH phases.
      //
      // Stance strands a foot when the goose turns, stops or is shoved. Swing
      // strands it a different way: the landing spot is chosen assuming the
      // body will keep walking, so if it slows or stops mid-step the foot is
      // left reaching for ground the goose never arrives at. Either way a leg
      // stretched past straight drags, which is the skating this file exists
      // to remove — so clamp to the reachable circle and accept a small,
      // deliberate slide instead of a broken one. Only X and Z: the lift arc
      // is fine as it is.
      this.plantSpot(f, bodyPos, heading, 0, this.scratch.want);
      const dx = f.pos.x - this.scratch.want.x;
      const dz = f.pos.z - this.scratch.want.z;
      const off = Math.hypot(dx, dz);
      if (off > maxOffset && off > 1e-6) {
        const k = maxOffset / off;
        f.pos.x = this.scratch.want.x + dx * k;
        f.pos.z = this.scratch.want.z + dz * k;
      }
    }

    return {
      L: this.feet.L,
      R: this.feet.R,
      hipDrop: 0,
    };
  }
}

function mod1(v: number): number {
  const r = v % 1;
  return r < 0 ? r + 1 : r;
}

export interface TwoBoneSolution {
  knee: THREE.Vector3;
  /** True if the target was out of reach and the leg had to be straightened. */
  stretched: boolean;
}

const _dir = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _proj = new THREE.Vector3();

/**
 * Closed-form two-bone IK, law of cosines. CCD and FABRIK solve this too but
 * iterate, and converge differently frame to frame — a knee that shivers.
 */
export function solveTwoBone(
  hip: THREE.Vector3,
  target: THREE.Vector3,
  upperLen: number,
  lowerLen: number,
  poleDir: THREE.Vector3,
  out: TwoBoneSolution,
): TwoBoneSolution {
  _dir.copy(target).sub(hip);
  let d = _dir.length();

  // Clamp into the annulus the leg can actually reach. Without the epsilon a
  // fully extended leg gives a knee angle of exactly 0 or pi, where the bend
  // plane is undefined and the joint can flip between frames.
  const min = Math.abs(upperLen - lowerLen) + 1e-4;
  const max = upperLen + lowerLen - 1e-4;
  out.stretched = d > max;
  if (d < 1e-6) {
    // Degenerate: target sits on the hip. Point straight down and bail.
    out.knee.set(hip.x, hip.y - upperLen, hip.z);
    return out;
  }
  _dir.divideScalar(d);
  d = Math.min(max, Math.max(min, d));

  // Angle at the hip between the hip->target line and the hip->knee bone.
  const cosHip =
    (upperLen * upperLen + d * d - lowerLen * lowerLen) / (2 * upperLen * d);
  const hipAngle = Math.acos(Math.min(1, Math.max(-1, cosHip)));

  // The knee lies on a circle around the hip->target axis; the pole picks which
  // point on it. Only the component perpendicular to the axis matters.
  _proj.copy(_dir).multiplyScalar(poleDir.dot(_dir));
  _pole.copy(poleDir).sub(_proj);
  if (_pole.lengthSq() < 1e-8) {
    // Pole parallel to the leg — no preferred plane. Any perpendicular will do
    // and world up is the least surprising.
    _pole.set(0, 1, 0).sub(_proj.copy(_dir).multiplyScalar(_dir.y));
    if (_pole.lengthSq() < 1e-8) _pole.set(1, 0, 0);
  }
  _pole.normalize();

  out.knee
    .copy(hip)
    .addScaledVector(_dir, Math.cos(hipAngle) * upperLen)
    .addScaledVector(_pole, Math.sin(hipAngle) * upperLen);
  return out;
}
