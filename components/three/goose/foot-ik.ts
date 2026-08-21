/**
 * Feet that stay where you put them.
 */
import * as THREE from "three";

import { STANCE, STRIDE } from "./goose-walk";


/** How high the foot arcs during the swing at a WALK, in world units. */
export const STEP_LIFT = 0.055;
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
const WALK_CLEARANCE = 0.029;

/** How far the feet tuck up toward the body in mid-air, world units. */
const TUCK = 0.018;
/**
 * How far back the feet swing as they tuck.
 *
 * A goose folds its feet up BEHIND it, and on this rig that is the only place
 * for them to go: standing span is 0.358 against a leg length of 0.359, so the
 * leg is already straight and lifting the foot toward the body just drives the
 * mesh through the belly. The fold has to happen rearward instead.
 */
const TUCK_BACK = 0.075;
/** How quickly the feet reach the tuck, and recover from it. */
const TUCK_RESPONSE = 11;
/**
 * Seconds to ease the feet down after landing. Placing them in one frame moved
 * them 0.11 against 0.019 while walking, and that spike is the visible snap.
 */
const RECOVER = 0.18;
/**
 * Fastest a foot may move, world units per second.
 *
 * A speed limit, not a smoother. Everything here is meant to be continuous,
 * but the phase can step over the end of a swing on a long frame, and the
 * re-plant then lands as a jump — measured at 0.13 in a single frame against
 * 0.036 while walking, with a matching dip of the sole through the lawn.
 *
 * FLOOR, not a limit. It has to sit above whatever the gait legitimately asks
 * for, or it stops being a guard against discontinuities and starts throttling
 * the walk itself.
 *
 * It did exactly that. The note here used to claim "the run peaks near 1.5",
 * and that was measuring the wrong quantity. A swing foot has to cover one
 * stride in one swing, so its speed is stride / ((1 - STANCE) * stride /
 * bodySpeed) — and the stride CANCELS. What is left is bodySpeed / (1 -
 * STANCE), i.e. 2.5x body speed, which depends on nothing else:
 *
 *   walk  0.95 m/s  ->  foot needs 2.37 m/s   (under 4, fine)
 *   run   1.85 m/s  ->  foot needs 4.63 m/s   (over 4 — capped every step)
 *
 * So at a run the swing foot could not finish its step, landed short, and the
 * reachability guard above dragged the PLANTED foot to make up the difference.
 * Measured, that was 0.067 m of slide per stance running against 0.000 walking
 * — the skating this file exists to remove, reintroduced by its own safety
 * net. It was independent of stride length, which is the fingerprint of the
 * cancellation above and the thing that gave it away.
 */
const MIN_FOOT_SPEED = 4;
/**
 * How far above the gait's legitimate demand the cap sits. Enough room for a
 * turn or a shove on top of the swing, without being so loose that a genuine
 * discontinuity slips through.
 */
const FOOT_SPEED_HEADROOM = 1.6;

/**
 * Tightest the leg may fold, as a fraction of its full length.
 *
 * A real knee stops well before the shin meets the thigh, and here the flesh
 * runs out sooner still — the thigh sits inside the body, so a hard fold pushes
 * it out through the belly.
 */
const MIN_FOLD = 0.42;
/**
 * Furthest a foot may sit from the body before it is simply re-planted.
 *
 * A foot only ever moves by walking, so the legitimate offset is about a
 * stride. Anything beyond this means the planner was not running while the
 * body moved — swimming stands it down, and it resumed with both feet still
 * pinned where the goose waded in. Measured 9.4 world units of it against a
 * 0.359 leg: the solver dutifully aimed the leg at a target two ponds away,
 * which is what "the legs are bent and screwed up" looks like from the rig.
 */
const LOST = 1.0;
/**
 * How far ahead to plant, as a fraction of stride. DERIVED.
 */
/**
 * Fraction of the stride a foot leads the body by at touchdown.
 *
 * The naive form of this is 1 - stance/2, which is what it was while the duty
 * factor was a constant and is wrong the moment it is not. A stance runs from
 * reachAhead down to reachAhead - stance, so its MIDPOINT sits at
 * reachAhead - stance/2 = 1 - stance ahead of the anchor — and that midpoint
 * grows as the stance shortens. Dropping the duty factor from 0.6 to 0.42 for
 * the run therefore shoved every footfall from 0.40 to 0.58 of a stride ahead
 * of where it used to land: at a 0.8 stride, 46cm out instead of 32cm, well past
 * what the leg can reach. The guard hauled them back in every frame and the feet
 * tangled.
 *
 * Anchoring the MIDPOINT instead keeps the footfalls exactly where they have
 * always been and lets the duty factor change only what it should — how long a
 * foot stays down, and therefore whether the stances overlap or leave a gap.
 */
/**
 * Where the middle of a stance sits, as a fraction of a stride ahead of the
 * foot's rest anchor.
 *
 * Was 1 - STANCE = 0.4, which is not where it belongs and is the reason the
 * body could never be made to sink at mid-stance. MEASURED at that value: the
 * foot touches down 0.39 of a stride AHEAD of the hip and lifts off only 0.18
 * behind it, so it spends 68% of the contact in front and passes underneath at
 * 0.68 of the way through. The leg simply is not under the body in the middle
 * of its own stance.
 *
 * 0.295 splits that travel evenly — touchdown and liftoff the same distance
 * either side of the hip — so mid-stance is where the leg is actually loaded.
 * Every attempt to time the bounce against "mid-stance" was working from a
 * definition the geometry did not honour.
 */
const STANCE_MID = 0.295;
const reachAhead = (stance: number) => STANCE_MID + stance / 2;

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
  /** Where it was last frame, for the speed limit. */
  prev: THREE.Vector3;
  from: THREE.Vector3;
  to: THREE.Vector3;
  planted: boolean;
  anchor: FootAnchor;
  groundY: number;
  /** Live plant-height bias; grows with gait speed. */
  clearance: number;
  /** Airborne offset from the body. Smoothed instead of the world position. */
  tuck: THREE.Vector3;
}

/**
 * Distance-driven, matching the gait: a foot lifts after a fixed distance no
 * matter how fast it was covered, which is what makes non-skating free.
 */
export class FootPlanner {
  /**
   * Fraction of the cycle each foot spends on the ground, THIS frame.
   *
   * Above 0.5 the two stances overlap and something is always down — a walk, or
   * the "grounded running" birds use at moderate speed. Below 0.5 they no longer
   * meet and a FLIGHT PHASE opens between them, where neither foot is on the
   * ground. That gap is the difference between a fast walk and a trot: without
   * it there is no moment to leave the floor in, however hard the body bounces.
   *
   * Held here rather than as a module constant so the run can shorten it while
   * the walk keeps its overlap. Everything downstream — where a foot lands, how
   * long it swings, how fast it has to travel — reads it from here.
   */
  stance = STANCE;
  /**
   * How high the swinging foot arcs, THIS frame.
   *
   * The single most under-powered number in the gait. At the walk's 0.055 the
   * foot clears the ground by five centimetres on a goose whose hip is
   * forty-five up — barely a shuffle, and invisible at any distance. With no
   * visible leg action the only thing left moving is the body, which is exactly
   * why a faster gait read as the body vibrating rather than as the goose
   * striding.
   *
   * A trot is not distinguished from a walk by how much the BODY moves. It is
   * distinguished by the legs picking up — high, deliberate, springy. That is
   * the signature, and it was missing entirely.
   */
  lift = STEP_LIFT;
  /**
   * Worst reach-guard drag since the last read, world units. 0 means the legs
   * are covering the stride honestly. See the guard in step().
   */
  dragged = 0;
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
  /** Body speed this update, for the foot-speed cap. */
  private speed = 0;
  /** Live stride length, set each update. */
  private stride = STRIDE;
  /**
   * Foot height when standing on flat ground. Kept separate from the live
   * groundY, which follows the pond bed — the mid-air tuck needs the offset
   * the foot has FROM THE BODY, and that does not change with the terrain.
   */
  private readonly restGround: number;

  /**
   * Where the gait wants a foot, fore and aft of the body, at this phase.
   *
   * The same trajectory the cycle below walks through, expressed as a function
   * of phase alone so a foot can be dropped onto it from anywhere — which is
   * what landing needs. In stance the foot holds still while the body advances
   * past it, so its offset shrinks from the plant-ahead point at the same rate
   * the goose moves; in swing it eases forward to the next plant.
   */
  private gaitAhead(phase: number): number {
    if (phase < this.stance)
      return this.stride * (reachAhead(this.stance) - phase);
    const t = (phase - this.stance) / (1 - this.stance);
    const e = t * t * (3 - 2 * t);
    const a0 = this.stride * (reachAhead(this.stance) - this.stance);
    const a1 = this.stride * reachAhead(this.stance);
    return a0 + (a1 - a0) * e;
  }

  /** Frame time, for the mid-air tuck. Set before update(). */
  setDelta(dt: number): void {
    if (Number.isFinite(dt) && dt > 0) this.lastDt = Math.min(dt, 0.05);
  }

  constructor(anchors: { L: FootAnchor; R: FootAnchor }, groundY: number) {
    const mk = (anchor: FootAnchor): Foot => ({
      pos: new THREE.Vector3(),
      prev: new THREE.Vector3(),
      from: new THREE.Vector3(),
      to: new THREE.Vector3(),
      planted: true,
      anchor,
      groundY,
      clearance: GROUND_CLEARANCE,
      tuck: new THREE.Vector3(),
    });
    this.feet = { L: mk(anchors.L), R: mk(anchors.R) };
    this.restGround = groundY;
  }

  /**
   * World height of the ground under the goose. Follows the pond bed, so a
   * goose wading out into deepening water keeps its legs extended and walks
   * down the slope, instead of the body sinking onto feet still planted on
   * the lawn behind it.
   */
  setGround(y: number): void {
    /**
     * Carry the feet with the ground, including ones already planted.
     *
     * groundY only reaches a foot through plantSpot(), which runs when a step
     * lands — so on a slope the standing foot keeps the height it was planted
     * at while the body keeps descending. Wading in, the body sank onto feet
     * still standing at the old depth, the leg compressed, and the next step
     * dropped all at once to catch up. Shifting the stored positions by the
     * same delta keeps a planted foot on the bed between steps.
     */
    const d = y - this.feet.L.groundY;
    if (d !== 0) {
      for (const key of ["L", "R"] as const) {
        const f = this.feet[key];
        f.pos.y += d;
        f.from.y += d;
        f.to.y += d;
        f.prev.y += d;
      }
    }
    this.feet.L.groundY = y;
    this.feet.R.groundY = y;
  }

  /** Place both feet under the body. Call once the body position is known. */
  reset(bodyPos: THREE.Vector3, heading: number): void {
    for (const key of ["L", "R"] as const) {
      const f = this.feet[key];
      this.plantSpot(f, bodyPos, heading, 0, f.pos);
      // prev too, or the speed limiter spends the next frames dragging the
      // foot back toward wherever it used to be — which defeats the reset.
      f.prev.copy(f.pos);
      f.from.copy(f.pos);
      f.to.copy(f.pos);
      f.planted = true;
      f.tuck.set(0, 0, 0);
    }
    this.wasAirborne = false;
    this.recover = 0;
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
    /** Gait phase in whole steps, accumulated. NOT distance. */
    phase: number,
    maxOffset = Infinity,
    airborne = false,
    vertical = 0,
    run = 0,
    stride = STRIDE,
  ): FootPlan {
    this.speed = speed;
    const cycling = Math.max(0, Math.min(1, speed / 0.95));
    const clearance =
      GROUND_CLEARANCE +
      cycling * WALK_CLEARANCE +
      Math.max(0, Math.min(1, run)) * RUN_CLEARANCE;
    const cycle = phase;
    this.stride = stride;
    const moving = speed > MOVING;

    /**
     * In the air there is no ground to own. Left alone the body leaves and the
     * targets stay on the grass, so the IK stretches the legs down after them.
     */
    if (airborne) {
      for (const key of ["L", "R"] as const) {
        const f = this.feet[key];
        const rise = Math.max(0, vertical);
        const fall = Math.max(0, -vertical);
        this.plantSpot(
          f,
          bodyPos,
          heading,
          -TUCK_BACK * rise,
          this.scratch.want,
        );
        const restY = bodyPos.y + this.restGround;
        /**
         * The foot rides the body exactly, and only its OFFSET from the body
         * is smoothed.
         *
         * Smoothing the world position instead means chasing a target that is
         * itself falling at 4 m/s, and a first-order filter trailing a ramp
         * keeps a standing error of v/rate — here 3.95/11, about 0.36, which
         * is further than the leg is long. The foot gets left behind in the
         * air, the body drops past it, and the leg folds up into the belly.
         * Measured 0.112 of the leg mesh inside the torso at touchdown.
         */
        // First airborne frame: adopt wherever the foot already is as the
        // starting offset, so leaving the ground does not pop.
        if (!this.wasAirborne) {
          f.tuck.set(
            f.pos.x - this.scratch.want.x,
            f.pos.y - restY,
            f.pos.z - this.scratch.want.z,
          );
        }
        f.planted = false;
        // Tucked while climbing, reaching down while dropping. The reach is
        // the cue that tells you a landing is coming before it happens.
        const lift = TUCK * (0.35 + rise * 1.5) - fall * TUCK * 1.1;
        const k = Math.min(1, TUCK_RESPONSE * this.lastDt);
        f.tuck.x -= f.tuck.x * k;
        f.tuck.z -= f.tuck.z * k;
        f.tuck.y += (lift - f.tuck.y) * k;
        f.pos.set(
          this.scratch.want.x + f.tuck.x,
          restY + f.tuck.y,
          this.scratch.want.z + f.tuck.z,
        );
        f.from.copy(f.pos);
        f.to.copy(f.pos);
        // The speed cap keeps a PLANTED foot from teleporting. In freefall the
        // foot is meant to move as fast as the body does, and clamping it is
        // the same lag by another route.
        f.prev.copy(f.pos);
      }
      this.wasAirborne = true;
      return this.limit();
    }

    // Re-plant anything that has been left behind. Cheap, and it means no
    // caller can strand a foot by not calling update() for a while.
    for (const key of ["L", "R"] as const) {
      const f = this.feet[key];
      if (Math.hypot(f.pos.x - bodyPos.x, f.pos.z - bodyPos.z) <= LOST)
        continue;
      this.plantSpot(f, bodyPos, heading, 0, f.pos);
      f.prev.copy(f.pos);
      f.from.copy(f.pos);
      f.to.copy(f.pos);
      f.planted = true;
    }

    if (this.wasAirborne) {
      /**
       * Landed. Rejoin the CYCLE, not the stance.
       *
       * This used to aim both feet at ahead = 0 — the neutral stance, both feet
       * level under the body — and mark them planted. The recovery lerp then
       * ran with the gait skipped, so the feet converged side by side, and the
       * moment recovery ended the cycle resumed and snapped them back out to
       * wherever the phase said they belonged. Landing mid-stride, that is one
       * foot forward and one back arriving in a single frame: the stumble.
       *
       * It was intermittent for a reason. The size of the snap is however far
       * the phase happens to be from neutral at touchdown, so landing near a
       * foot-crossing looked fine and landing mid-stride looked broken.
       *
       * Dropping each foot onto its own place in the cycle instead means
       * recovery finishes where the gait was going to continue from.
       *
       * Measured against the gait's own wanted position — absolute foot speed
       * cannot tell a stumble from a stride, since a running swing legitimately
       * hits 7.4 m/s — the worst landing error goes 0.747 m to 0.650 against a
       * 0.285 m steady-running baseline. Better, and not a cure: the feet still
       * depart the cycle by about 2.3x normal while recovery carries them from
       * where they were tucked out to the stride. That distance is real and
       * this does not remove it.
       */
      this.wasAirborne = false;
      this.recover = RECOVER;
      for (const key of ["L", "R"] as const) {
        const f = this.feet[key];
        const p = mod1(cycle + (key === "R" ? 0.5 : 0));
        f.from.copy(f.pos);
        this.plantSpot(f, bodyPos, heading, this.gaitAhead(p), f.to);
        f.planted = p < this.stance;
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
      return this.limit();
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

      if (phase < this.stance) {
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
        const t = (phase - this.stance) / (1 - this.stance);
        if (f.planted) {
          f.planted = false;
          f.from.copy(f.pos);
          this.plantSpot(
            f,
            bodyPos,
            heading,
            this.stride * reachAhead(this.stance),
            f.to,
          );
        }
        // Ease in and out of the swing; a linear foot looks mechanical.
        const e = t * t * (3 - 2 * t);
        f.pos.lerpVectors(f.from, f.to, e);
        // Arc over the ground. sin gives zero lift at both ends for free.
        f.pos.y = f.groundY + f.clearance + Math.sin(Math.PI * t) * this.lift;
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
        /**
         * How far the foot was dragged, this frame, in world units.
         *
         * Published because it is the ONLY honest signal that a stride has been
         * asked for that the legs cannot cover. Over-stride and nothing throws
         * or clamps visibly — the foot just gets pulled toward the body every
         * frame, which is skating, and skating is very hard to see at speed and
         * very obvious once you know to look. Anyone lengthening the stride
         * needs this number in front of them.
         */
        this.dragged = Math.max(this.dragged, off - maxOffset);
      }
    }

    return this.limit();
  }

  /** Read and clear the worst drag seen since the last call. */
  takeDrag(): number {
    const d = this.dragged;
    this.dragged = 0;
    return d;
  }

  /** Speed-limit both feet, whatever produced the movement. */
  private limit(): FootPlan {
    for (const key of ["L", "R"] as const) {
      const f = this.feet[key];
      const dx = f.pos.x - f.prev.x;
      const dy = f.pos.y - f.prev.y;
      const dz = f.pos.z - f.prev.z;
      const step = Math.hypot(dx, dy, dz);
      // Scales with what the gait actually needs — see MIN_FOOT_SPEED.
      const cap =
        Math.max(
          MIN_FOOT_SPEED,
          (this.speed / (1 - this.stance)) * FOOT_SPEED_HEADROOM,
        ) * this.lastDt;
      if (step > cap && step > 1e-6) {
        const k = cap / step;
        f.pos.set(f.prev.x + dx * k, f.prev.y + dy * k, f.prev.z + dz * k);
      }
      f.prev.copy(f.pos);
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

  /**
   * Clamp into the annulus the leg can actually reach.
   *
   * The lower bound is a KNEE LIMIT, not just a degenerate-case guard. Left at
   * |upper - lower| it is effectively zero for near-equal bones, so the leg can
   * fold completely flat and the knee travels straight up through the belly —
   * measured, the leg mesh pushed 0.23 into the body during a jump, where
   * standing it overlaps by 0.004.
   *
   * The epsilon still matters at the other end: fully extended gives a knee
   * angle of exactly 0 or pi, where the bend plane is undefined and the joint
   * can flip between frames.
   */
  const min = Math.max(
    Math.abs(upperLen - lowerLen) + 1e-4,
    (upperLen + lowerLen) * MIN_FOLD,
  );
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
