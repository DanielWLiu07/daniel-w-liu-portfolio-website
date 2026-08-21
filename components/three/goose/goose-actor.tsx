"use client";

/**
 * The goose you can drive. WASD, or click the ground to send it somewhere.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { GraphNode } from "blender-to-threejs";

import {
  COLLIDERS,
  LAWN_HALF,
  POND,
  pondBed,
  type Collider,
} from "../environment";
import {
  GOOSE_RADIUS,
  penetration,
  resolveCollisions,
  supportHeight,
  NECK_CAPSULES,
  type Resolved,
} from "./collide";
import {
  STEP_LIFT,
  FootPlanner,
  solveTwoBone,
  type TwoBoneSolution,
} from "./foot-ik";
import { LIGHT_MAX_SIZE } from "../pushables";
import { applyWalk, Spring, STANCE, STRIDE } from "./goose-walk";
import { gooseMaterial } from "./goose-shading";
import { assertBones, GOOSE_LIMITS, usePoseDriver } from "./use-pose-driver";

const SRC = "/models/goose-rigged.draco.glb";
/**
 * Self-hosted Draco decoder.
 */
const DRACO = "/draco/";

/**
 * Walk speed. Tied to STRIDE: speed/STRIDE is the step frequency, and a goose
 * that covers ground faster than its legs can cycle has to skate to keep up.
 */
/**
 * Walk and run, as two speeds rather than one with a multiplier.
 */
const SPEED_WALK = 0.95;
const SPEED_RUN = 1.5;
/**
 * How much of its walking speed the goose gives up while crouched. Zero.
 *
 * C is a POSE now, not a gait: it lowers the head and nothing else. It used to
 * halve the speed and shorten the stride too, which made it a third way of
 * moving that had to be reconciled with the walk and the run every time either
 * changed — and it was the source of most of the interaction bugs, the crouched
 * sprint scrabbling at 3.79 steps a second among them.
 *
 * Restoring it is one number, here and in SNEAK_STRIDE.
 */
const SNEAK_SLOW = 0;
/**
 * How much longer the stride gets at full run, as a fraction.
 *
 * Speed is stride times cadence, and which of the two carries the increase is
 * the whole difference between running and scurrying. The old run put 1.39x
 * into cadence and only 1.10x into stride, so it read as the same walk with
 * the legs spun faster. Animals do the opposite — stride grows first and
 * cadence saturates — so the extra speed goes here instead.
 *
 * BOUNDED BY THE LEG, though, which 0.5 was not. This leg measures 0.359 and
 * the hip stands 0.24 above the ground, so the furthest a foot can reach from
 * under its own hip is sqrt((0.9 * 0.359)^2 - 0.24^2) = 0.216 — call it a 0.43
 * stride, and even with the hip on the floor it could not pass 0.65. A 0.75
 * stride is not long, it is impossible, and asking for it does not produce a
 * longer step: the planner's reachability guard drags the planted foot instead,
 * which is skating. Measured slide per stance, once the foot-speed cap in
 * foot-ik had been fixed as well:
 *
 *   stride 0.750 (0.50)   0.0338 m   <- asks for reach the leg does not have
 *   stride 0.650 (0.30)   0.0081 m
 *   stride 0.575 (0.15)   0.0018 m
 *   walk   0.500          0.0000 m
 *
 * 0.30 keeps the run's stride visibly longer than the walk's — 1.30x, which is
 * the thing this constant exists for — while leaving under a centimetre of
 * slide. Going further buys tenths of a millimetre and costs the whole read.
 */
const RUN_STRIDE = 0.6;
/**
 * How far the run drops the duty factor, from the walk's 0.6.
 *
 * ZERO by default, which is the opposite of where this started. Cutting it
 * under 0.5 buys a flight phase and a human-shaped bounding run — and birds do
 * not run like that. Measured avian locomotion is COMPLIANT rather than stiff:
 * they keep contact longer, absorb through a crouched four-segment leg, and
 * hold the body far steadier than a bounding mammal does. "Grounded running" is
 * the whole literature on it. Chasing flight was chasing the wrong animal.
 *
 * Left as a slider because it is a real effect and a sprinting goose does
 * eventually leave the ground; it is just not what makes a goose look like a
 * goose at this speed.
 *
 * At 0.6 the two stances overlap and one foot is always down, so there is no
 * moment to leave the ground in — a bouncing body with nothing to bounce off
 * between steps. 0.6 - 0.18 = 0.42 puts it under 0.5, which opens a flight
 * phase of 1 - 2 * 0.42 = 0.16 of the cycle where neither foot is planted.
 *
 * It also RELIEVES the reach problem rather than adding to it: a foot travels
 * (1 - stance/2) - ... = 0.42 of a stride during a short stance against 0.6 of
 * one during a long stance, so the leg is asked to cover less, not more.
 */
const RUN_DUTY = 0;
/**
 * How much higher the feet arc at a full run, as a multiple of the walk's lift.
 *
 * Measured against the clearance from the swinging foot to the spine, which is
 * the number that decides whether it clips:
 *
 *   walk (lift 1.0x)   0.360
 *   run at 0.7x        0.260
 *   run at 1.0x        0.270
 *   run at 1.5x        0.232
 *
 * Note how little of that is the lift — 0.7 and 1.0 land in the same place. The
 * foot's height is set mostly by GROUND_CLEARANCE and its run-specific bonus,
 * not by this. What actually caused the clipping was the BODY coming down to
 * meet the foot: with crouch 0.055 and bounce 0.1 the hip sat at 0.384 and
 * clearance collapsed to 0.180, half the walk's. Raising the body back to 0.453
 * recovered most of it on its own.
 *
 * So lift is close to free here, and 1.0 is chosen for clearance rather than
 * because a bigger pick-up hurt. Higher was tried and clips: at 1.5, with the
 * body also lowered by the crouch and the bounce, the swinging foot came within
 * 0.180 of the spine against the walk's 0.355 — half the clearance, and inside
 * the body mesh. The foot swings up into a body that has come down to meet it,
 * so lift has to be read together with crouch and bounce, never alone. Large on purpose — the legs ARE the gait and were doing
 * their work almost invisibly — but under the 2.2 first tried, which lifted the
 * foot to 72% of hip height and read as prancing rather than trotting.
 */
const RUN_LIFT = 1.0;

/** Everything about the run that is worth tuning against the picture. */
/**
 * Live water settings.
 *
 * Same reasoning as RunTuning: how deep a goose ought to sit is a judgement
 * about a real bird, and the only way to make that judgement is to move the
 * number and look. The readout gives the waterline as a percentage up the
 * torso, because 0.49 means nothing and "40% up the body" means everything.
 */
export interface WaterTuning {
  /** How deep it floats, world units. */
  float: number;
  /** Depth at the pond's centre — where it stops wading and starts swimming. */
  bed: number;
  /** Top speed afloat. */
  speed: number;
  /** Paddle rate, radians a second. */
  stroke: number;
}

export interface RunTuning {
  /**
   * Hold the running pose while standing still.
   *
   * Tuning the run otherwise means holding shift, running, and dragging a
   * slider at the same time — which is not possible one-handed, and the goose
   * reaches a hedge before you have adjusted anything.
   */
  hold: boolean;
  speed: number;
  headTilt: number;
  bodyPitch: number;
  /** How far the body sinks into each step at a full run, world units. */
  bounce: number;
  /** How far the trunk rocks back through stance at a full run, radians. */
  rock: number;
  /**
   * Extra stride at a full run, as a fraction of the walk's.
   *
   * The single number that decides whether a run is a run. Speed is stride
   * times cadence, so a run that gets its speed from cadence alone is just a
   * walk played fast — which is what this was. Normalised against hip height
   * (~0.45 here) the walk's 0.5 stride is a relative stride of 1.11 and the old
   * run's 0.65 was 1.44, both squarely in walking territory for a bird.
   */
  stride: number;
  /**
   * How far the hips drop at a full run, world units.
   *
   * Pays for the stride. Horizontal reach for a straight leg is
   * sqrt(legLength^2 - hipHeight^2), so it is bought by LOWERING the hips —
   * there is no other source. Running birds do exactly this, taking a more
   * crouched posture as they speed up; here it is also the only way a longer
   * step can be covered without the reach guard dragging the foot.
   */
  crouch: number;
  /**
   * How far the run drops the duty factor below the walk's 0.6.
   *
   * Above 0.5 the two stances overlap and a foot is always down; below it they
   * separate and a flight phase opens between them. That threshold is the line
   * between a fast walk and a trot.
   */
  duty: number;
  /**
   * How much of the waddle the run keeps, 0..1 — the weight transfer.
   *
   * 0 is the old behaviour: no roll at all at a run, which is steady but reads
   * as vibrating rather than stepping. Costs head steadiness as it rises.
   */
  roll: number;
  /** Extra foot lift at a full run, as a multiple of the walk's. */
  lift: number;
  neck: number[];
  /**
   * How hard the upper body refuses to pass the waddle up to the head, 0..1.
   *
   * Not run-specific, unlike everything else here — it matters most at a walk,
   * which is where the waddle is. It lives in this panel anyway because tuning
   * it needs `hold` and `showBones`, which are here, and a second panel holding
   * one slider is worse than a slightly wide one. See headSteady in goose-walk
   * for what it actually does.
   */
  headSteady: number;
}

export const RUN_DEFAULTS: RunTuning = {
  hold: false,
  speed: SPEED_RUN,
  // The run's head is NOT set by this alone — the straightened neck and the
  // body lean carry it down too, and measured, the run sits far lower than the
  // standing 1.14 whatever this is. 1.5 put it at 0.528, under the sneak's
  // 0.623, which inverted the whole point. Raised past the old 2.0 to leave the
  // crouch clear room underneath: walk highest, run nosed over, sneak lowest.
  headTilt: 2.0,
  // Leaning a little further forward than the old 0.46, so the run reads as
  // committed — but only a little, since the lean lowers the head too and that
  // is the budget the sneak needs to stay the lowest pose.
  bodyPitch: 0.12,
  bounce: 0.06,
  rock: 0,
  stride: RUN_STRIDE,
  crouch: 0,
  duty: RUN_DUTY,
  roll: 0.8,
  lift: RUN_LIFT,
  neck: [0.45, 0.34, 0.1, 0.04],
  headSteady: 1,
};
const ACCEL = 9;
const DRAG = 7;
/** Heading spring. Damping below 1 is what lets a hard turn overshoot. */
const TURN_STIFFNESS = 46;
const TURN_DAMPING = 0.62;
/** Stop this far from a clicked target, so it does not jitter on arrival. */
const ARRIVE = 0.22;
/**
 * How far the jaw drops on a honk, radians.
 *
 * Was 0.22 (12.6 deg), tuned against a bill that was a single sealed shell —
 * opening it any further just slid one solid through another, so small was the
 * only setting that looked right. The bill is cut now, hinged on the seam, and
 * measures clean the whole way to 60 deg: the mandible stays within 2mm of the
 * seam and never comes within 5cm of the neck. Geometry is not the limit here,
 * the 65 deg joint limit is.
 *
 * This is the COMMANDED angle, not the angle you see. The pose driver is a
 * spring (stiffness 200, damping 0.9) and the honk envelope decays after 260ms,
 * so the jaw only reaches ~86% of this before it is called back — 0.80 rad
 * commanded measures ~40 deg of actual gape.
 *
 * Positive X opens. That sign is not arbitrary: the mandible hangs forward of
 * the hinge, so a negative rotation swings it UP through the palate.
 */
const JAW_OPEN = 0.8;
/**
 * How far the UPPER bill lifts on a honk, radians.
 *
 * Birds are not hinged like us. A goose has cranial kinesis: the upper mandible
 * rotates up at the craniofacial joint as the lower drops, so the gape opens
 * from both sides. Dropping the jaw alone reads as a puppet with a hinged chin.
 *
 * Much smaller than the jaw's travel, which is also how the real thing works —
 * the lower mandible does most of it. 0.3 of the jaw at 0.8 is 0.24 rad, or
 * 13.8 degrees, inside the beak joint's 30 degree limit.
 *
 * Negative X, because positive X is what swings the LOWER mandible down: the
 * two mandibles rotate in opposite senses about the same axis, which is the
 * whole point.
 */
const BEAK_LIFT = 0.24;
/**
 * How far to lower the body, in WORLD units, so the legs are bent enough to
 * step.
 */
const CROUCH = 0.008;
/**
 * How far the body drops into the sneak, world units. Zero — the NECK crouches.
 *
 * A goose lowering itself does it with the neck, not the knees. It is a
 * long-necked animal with short legs, and the whole range of motion it has for
 * getting its head down lives above the shoulders. Dropping the hips as well
 * read as a squat rather than a stalk.
 *
 * It also spent a resource this rig does not have. Hip height IS leg reach
 * here — the leg measures 0.359 and spans 0.358 standing, so it is already
 * straight — and every millimetre down came out of the stride the feet could
 * still cover. At 0.17 the right foot was 7mm UNDER the lawn at the bottom of a
 * step; 0.11 cleared it, but only by shortening the step to pay for it.
 *
 * At zero that entire problem is gone: no reach budget to blow, no punch-through
 * to guard against, and the crouch costs the walk cycle nothing.
 */
const DUCK_DROP = 0;
/**
 * How much of the stride the crouch gives up.
 *
 * Once required — it was buying back the leg reach DUCK_DROP was spending — and
 * now purely for character, which is why it is much smaller than the 0.42 that
 * was needed to keep the feet out of the lawn. A creeping animal takes short
 * close steps, and that reads even with the body at full height.
 */
const SNEAK_STRIDE = 0;
/**
 * Lengthen the leg bones at load.
 */
const LEG_STRETCH = 1.28;
/**
 * How far OUT the knee is pushed, as a fraction of straight-backward.
 *
 * This rig rests with the leg 99.7% straight, which means there is no bend
 * plane to measure a pole from — and the fallback took the pole as plain
 * body-backward, the same vector for both legs (see the console warning at
 * load). A knee bending straight back from a hip tucked under the torso swings
 * the thigh THROUGH the body, which is the leg clipping you can see on any
 * step: the leg never reads as a separate limb, it drags a lobe of belly with
 * it.
 *
 * A real bird's leg bows out around its body, so the pole gets a lateral
 * component and each leg gets its own. Backward still dominates — this is a
 * bow, not a splay, and at 1.0 the goose stands like a cowboy.
 */
const KNEE_OUT = 0.55;
/**
 * Jump. Height is chosen first and the launch speed derived from it, because
 * "how high does it get" is the thing anyone actually has an opinion about;
 * an initial velocity is a number you tune blind until the arc looks right.
 *   v = sqrt(2 * g * h)
 */
/**
 * Height alone does not clear an obstacle — it has to be cleared for long
 * enough to get ACROSS it.
 *
 * The old pair, 0.95 and 11.5, was picked against the obstacle tops and
 * cleared nothing at all. Measured against every collider in the scene, not
 * one was jumpable:
 *
 *   obstacle     top   span   time above it   reach at a run
 *   hedge tall   1.10  1.48   never — the apex was below it
 *   hedge mid    0.90  1.48   0.19 s          0.35 m
 *   hedge low    0.70  1.48   0.42 s          0.77 m
 *   stone wall   0.60  1.18   0.49 s          0.91 m
 *
 * `span` is what actually has to be crossed: the box's depth plus a goose
 * radius at each end, because collision tests the goose's CENTRE against a box
 * grown by its radius. Reach is that time-above multiplied by ground speed. The
 * goose was topping the low hedge by a comfortable 0.25 m and still landing on
 * it, every time, because 0.77 m does not cross 1.48 m. The comment that used
 * to sit here claimed these cleared "with margin", which was measuring the
 * wrong quantity.
 *
 * So the pair is solved instead, against every collider at once: the smallest
 * apex, and the shortest hang for that apex, that gets across all four at a
 * run — and across none of them at a walk, so a run-up is worth taking.
 *
 *   obstacle     span   reach at a run   margin
 *   hedge tall   1.48   1.67 m           13%
 *   hedge mid    1.48   1.89 m           27%
 *   hedge low    1.48   2.08 m           41%
 *   stone wall   1.18   2.18 m           84%
 *
 * The margin is the point of solving rather than eyeballing. The first pass
 * landed the tall hedge on exactly 1.48 against a 1.48 span — arithmetically a
 * clear, and in practice a clip, because letting go of the key mid-air lets
 * drag eat the horizontal speed the reach assumed. 13% is enough to survive
 * that; a bare pass is not.
 *
 * Rerun the solve if the scenery changes — a new hedge silently breaks this.
 *
 * Gravity is well under the 11.5 it was, which is what buys the hang time
 * without an absurd apex. A goose is a heavy bird that gets over a fence by
 * half-flying, not by hopping, so the wings beat through it — see the airborne
 * flap in goose-walk, which exists because 1.44 s of hang with the wings held
 * still reads as a bird stuck to the ceiling.
 */
const JUMP_HEIGHT = 1.35;
const JUMP_GRAVITY = 9.81;
/**
 * The launch, modelled as a leg EXTENSION rather than a change of velocity.
 *
 * Two things were wrong with what came before, in two goes.
 *
 * First it multiplied horizontal speed by 2.3 on the launch frame: an infinite
 * acceleration, a factor rather than an impulse, and a resulting 4.25 m/s that
 * a bird which tops out at 1.85 on the ground has no way to produce. Replacing
 * that with a fixed forward push, delivered over a real extension time, fixed
 * the physics.
 *
 * It did not fix the FEEL, because the remaining problem was not the size of
 * the push but that there was one at all. A launch that fires the goose along
 * its heading is the game moving it, not the player — the jump plays out the
 * same way whatever you do with the keys. So the horizontal push is gone
 * completely. A jump now takes the momentum the goose already had, adds a
 * purely vertical impulse, and hands the arc over to AIR_ACCEL.
 *
 * That is also the more honest physics: the leg extension is along the leg,
 * and a goose crouched to jump has its legs under it, not behind it. Reach
 * over an obstacle is something you fly, not something you are given.
 */
const LAUNCH_TIME = 0.09;
/**
 * Steering while airborne, as an ACCELERATION rather than a grip on the ground.
 *
 * This used to be a fraction of the ground handling, which conflated two
 * unrelated things. On the ground the goose chases a target velocity: `vel` is
 * lerped toward `want`, whose magnitude is the walk or run speed. Scaling that
 * lerp down for the air scales BOTH halves — how fast you can steer, and how
 * hard the goose is dragged back to walking pace. There was no setting that
 * worked: turn it up and the leap decayed to a walk mid-flight, turn it down
 * and the jump took the controls away.
 *
 * Nothing aloft pulls the goose toward a ground speed, so the target has no
 * business being there. What a bird has in the air is a force it can point,
 * which is an acceleration applied along whatever is being asked for, on top of
 * the arc it is already on. Hold nothing and the arc is untouched; hold a
 * direction and it bends.
 *
 * ACCEL and BRAKE are separate on purpose — it is the split every platformer
 * with good air handling makes. Steering into open air and killing momentum you
 * already have are different requests, and one number cannot serve both: enough
 * acceleration to feel responsive turns into a drift you cannot cancel, and
 * enough braking to stop dead makes the arc feel sticky. Braking is the
 * stronger of the two, so a jump is always recoverable.
 *
 * The first pass at this was 2.5, which is far too timid — the games people
 * praise for air handling give close to full control up there. ACCEL now
 * matches the ground's, so steering aloft is as responsive as on the grass.
 */
const AIR_ACCEL = 9;
const AIR_BRAKE = 14;
/**
 * The floor under the air-speed cap, for a jump made from a standstill.
 *
 * The cap itself is not a constant — it is whatever the goose was doing when
 * it left the ground, captured at launch. A fixed 3.6 was the last of the
 * leap: with a run of 1.85, holding a direction in the air accelerated the
 * goose to nearly double its ground speed, so every jump surged forward. Air
 * control is for pointing momentum somewhere, not for manufacturing it.
 *
 * Keeping what you had means a jump preserves the run that set it up and
 * steering redirects that, which is what a normal jump does.
 */
const AIR_SPEED_MIN = 0.7;
/**
 * How much of its turning authority the goose keeps in the air.
 *
 * Low, because there is nothing to pivot against — and because the heading
 * spring is deliberately underdamped, so leaving it at full strength lets any
 * quick change of direction aloft turn into a spin.
 */
const AIR_TURN = 0.3;

const JUMP_SPEED = Math.sqrt(2 * JUMP_GRAVITY * JUMP_HEIGHT);
/**
 * Anticipation before the push, in seconds.
 */
const ANTICIPATION = 0.11;
/**
 * How close the BILL has to be to something to take hold of it.
 *
 * Measured from the bill rather than the body, because that is what the player
 * is aiming: the goose reaches for things with its head, and a body-centred
 * grab radius picks up whatever is nearest the feet instead of what is in
 * front of the face.
 *
 * And measured to the crate's SURFACE, not its centre. A crate is 0.7 across,
 * so walking up to one leaves the bill touching it while still being most of a
 * metre from the middle — a centre test just refuses to pick up something the
 * goose is visibly nose-to-nose with.
 */
const GRAB_REACH = 0.24;
/**
 * Biggest half-extent the bill will take hold of. Shared with Pushables, where
 * the same threshold decides what is light enough to kick rather than be
 * blocked by — the two rules are the same question asked twice.
 */
const GRAB_MAX_SIZE = LIGHT_MAX_SIZE;
/** How far beyond the bill tip a carried prop rides. */
const BILL_LEAD = 0.1;
/**
 * Angle from the head-to-beak BONE vector down to the actual bill axis.
 *
 * These are not the same direction and it is not close. In the source blend the
 * head bone sits at (0, -0.4503, 1.691) and the beak bone at (0, -0.5084,
 * 1.7385): the beak bone is above and ahead of the skull bone, so the vector
 * between them points 39.3 degrees UP. The bill itself points DOWN — the upper
 * mandible runs at -8.8 degrees from its base to the tip and the gape line at
 * -21.8, so the axis sound leaves along is about -15.
 *
 * That is a 54 degree error, which is why anything aimed with the bone vector
 * fires over the goose's head instead of out of its mouth.
 *
 * Applied as a rotation about the lateral axis rather than as a fixed world
 * direction, so it still follows the head: both vectors are rigid to the skull,
 * so the angle between them is constant no matter where the goose is looking.
 */
const BILL_DROP = 0.948;
/**
 * Where the MOUTH is, as an offset from the beak bone.
 *
 * `beak` is not it and never was: that is the prop-carry point, built by walking
 * BILL_LEAD along the head-to-beak bone vector, and since that vector points 39
 * degrees up (see BILL_DROP) the carry point lands ABOVE the bill rather than at
 * the end of it. In the blend it works out at (0, -0.6222, 1.8316) while the
 * mouth is at (0, -0.6818, 1.7163) — 0.115 too high and short.
 *
 * The mouth is the MIDPOINT of the gape, halfway from the jaw hinge (0,
 * -0.5787, 1.7566) to the bill tip (0, -0.726, 1.699). 70% along was the first
 * try and it sat out toward the tip rather than at the opening — the marks
 * fanned from a point ahead of the gap the mandibles actually make, so the
 * opening was not the centre of them. Halfway is where the bill parts widest.
 *
 * As an offset from the beak bone that is 1.923 times the head-to-beak bone
 * distance, in a direction 43.5 degrees down from that bone vector.
 *
 * Expressed as a MULTIPLE of the bone distance rather than as a world length,
 * so it survives the fit scale the actor applies without knowing what it is.
 */
const MOUTH_DROP = 0.7595;
const MOUTH_SPAN = 1.923;
/**
 * How far in front the bill must be pointing for a grab to count.
 *
 * A radius alone lets the goose scoop up something beside or behind its own
 * head, which feels arbitrary — you aim a bill, so the grab should respect
 * where it is aimed. 0.2 is generous enough not to be fussy.
 */
const GRAB_AIM = 0.2;
/**
 * How fast the collision resolver may move the goose sideways, RELATIVE to how
 * fast it is going, plus a floor for when it is barely moving.
 *
 * A correction only has to outpace the motion that caused it. Tying the cap to
 * the goose's own speed says exactly that, and it is what separates the two
 * cases the resolver cannot otherwise tell apart: walking into a hedge is
 * penetration caused by moving, and gets fixed as fast as it is made; falling
 * off a ledge is a resting overlap that was always there — the body overhangs
 * the lip while the goose stands on it, which is what a bird does — and only
 * becomes visible to the resolver on the way down. Ejecting that at full speed
 * is the nudge.
 */
const PUSH_SPEED_GAIN = 1.4;
const PUSH_SPEED_FLOOR = 0.8;
/** Ground level for the body. The lawn is flat, so this is a constant. */
const GROUND_Y = 0;
/**
 * How deep the goose floats, in world units.
 *
 * Set from the rig against a real bird, not by eye. A goose on water sits IN
 * it: the waterline crosses roughly 40% up the torso, the belly is fully under
 * and the back rides clear. Measured here, the torso spans 0.466 from y 0.097
 * to 0.563 — so at the old 0.21 the whole torso was still 0.09 ABOVE the
 * surface and the goose hovered on the pond with only its legs wet.
 *
 * 0.006 = 0.097 - drop + 0.40 * 0.466  =>  drop = 0.277 further down.
 */
const FLOAT_DEPTH = 0.49;
/** Swimming is a shade slower than walking, not a crawl. */
const SWIM_SPEED = 1.05;
/**
 * What shift does afloat.
 *
 * It used to do nothing at all: speed blended to SWIM_SPEED as `swim` came up,
 * and that expression had no `run` term in it, so holding shift on the pond
 * changed neither speed nor stroke. The key looked broken, because it was.
 *
 * Only the SPEED comes back, not the pose. The running stretch — body pitched
 * flat, neck out ahead — is a land posture and goose-walk deliberately cuts it
 * on water (`r` is scaled by 1 - sw). A goose in a hurry on a pond does not
 * change shape, it paddles harder, so that is what this drives: 1.55x the
 * cruise, and the same multiple on the stroke rate, because a bird moving half
 * again as fast on the same lazy paddle is skating.
 */
const SWIM_RUN = 1.55;
/** How fast the goose transitions in and out of the water. */
const SWIM_BLEND = 3.2;
/** How much of the rig's free swing is taken out at full float. */
const SWIM_SETTLE = 0.55;
/**
 * Swimming momentum. This is what makes it a glide rather than a walk.
 *
 * On land the goose is pushing against the ground: it reaches speed almost at
 * once and stops almost at once. In water it is displacing a fluid — slow to
 * build, and it keeps going long after you let go. Same gait code, completely
 * different feel, and none of it is in the pose.
 */
const SWIM_ACCEL = 3.0;
const SWIM_DRAG = 0.85;
/**
 * Stroke rate afloat, in radians a second, and how quickly the legs take up
 * and abandon the stroke.
 */
const STROKE_RATE = 5.4;
const STROKE_EASE = 4;

export const WATER_DEFAULTS: WaterTuning = {
  float: FLOAT_DEPTH,
  bed: POND.depth,
  speed: SWIM_SPEED,
  stroke: STROKE_RATE,
};
/**
 * Turning afloat. Only a little softer than on land — the pivot itself was
 * already right, and dropping the stiffness far enough to feel "heavy" just
 * made the goose unsteerable. All this removes is the snap at the end.
 */
const SWIM_TURN_STIFFNESS = 38;
const SWIM_TURN_DAMPING = 0.88;

/** Shared world up. Allocated once; this is read every frame. */
const UP = new THREE.Vector3(0, 1, 0);
/** Body-local +x. The axis the knee bows along; see KNEE_OUT. */
const BODY_RIGHT = new THREE.Vector3(1, 0, 0);
/** Scratch for the dev telemetry below. Module scope so the frame loop is
 *  allocation-free even in development, where the profiling happens. */
const telemetryQ = new THREE.Quaternion();
const telemetryV = new THREE.Vector3();


/**
 * As exported, NOT as authored. Blender's `.L`/`.R` suffixes do not survive the
 * glTF exporter — `thigh.L` on the armature is `thighL` in the file — and a
 * name that does not resolve fails silently, so the leg simply never animates.
 */
const BONE_NAMES = [
  "root",
  "hips",
  "spine",
  "chest",
  "neck1",
  "neck2",
  "neck3",
  "neck4",
  "head",
  "jaw",
  "beak",
  "tail",
  "wingL",
  "wingR",
  "thighL",
  "shinL",
  "footL",
  "thighR",
  "shinR",
  "footR",
];

export interface GooseActorProps {
  /** Click target on the ground, or null for keyboard control. */
  target: THREE.Vector3 | null;
  onArrive?: () => void;
  honk?: boolean;
  onMove?: (pos: THREE.Vector3, heading: number) => void;
  /**
   * Hands back the graph the material was compiled from — the object itself,
   * not a copy — so a graph view cannot drift from what is on the mesh.
   */
  onGraph?: (out: GraphNode) => void;
  /** Live crate footprints, so the goose cannot walk through them. */
  crates?: React.RefObject<Collider[]>;
  /** Live run-gait tuning. See the sliders on the play page. */
  tuning?: RunTuning;
  /** Live water settings. Falls back to the constants when absent. */
  water?: WaterTuning;
  /** Measured waterline, for the tuner readout. */
  onWater?: (v: { waterline: number; swim: number }) => void;
  /** Written each frame with the bill's world position. */
  beak?: React.RefObject<THREE.Vector3>;
  /** Index of the crate in the bill, or null. Written on grab and release. */
  grabbed?: React.RefObject<number | null>;
  /** Written each frame with the bill's facing, for carried props. */
  beakYaw?: React.RefObject<number>;
  /**
   * Written each frame with the head-to-bill direction, normalised.
   *
   * beakYaw is only the horizontal part, which is all a carried prop needs.
   * Anything that has to come OUT of the mouth needs the pitch too — the goose
   * tips its bill up at a run and down in a sneak, and a honk that ignores that
   * fires sideways out of the face.
   */
  beakDir?: React.RefObject<THREE.Vector3>;
  /**
   * Written each frame with the world position of the MOUTH.
   *
   * Distinct from `beak`, which is the prop-carry point and sits above the bill.
   * Anything emitted by the goose starts here.
   */
  beakMouth?: React.RefObject<THREE.Vector3>;
  /**
   * Written each frame with what is currently within grabbing reach.
   *
   * `has` false means nothing is — which is a real answer and the common one,
   * since most of the props in the scene are too big for a bill.
   */
  grabHint?: React.RefObject<{
    has: boolean;
    x: number;
    y: number;
    z: number;
  }>;
  /** Called when the grab state changes, for the HUD. */
  onGrab?: (holding: boolean) => void;
  /** Handed the live bone map once resolved, for the skeleton overlay. */
  onBones?: (bones: Record<string, THREE.Object3D | undefined>) => void;
  /** Run head-tilt coefficient. See WalkInput.runHeadTilt. */
  headTilt?: number;
  /** Live pose readout, throttled: beak angle, head placement, and which
   * bones are pinned against their joint limits. */
  onBeakAngle?: (
    deg: number,
    ahead: number,
    above: number,
    clamped: string[],
    /** Worst reach-guard drag, world units. Non-zero means over-striding. */
    drag: number,
  ) => void;
}

export default function GooseActor({
  target,
  onArrive,
  honk,
  onMove,
  onGraph,
  headTilt = 2.0,
  onBeakAngle,
  crates,
  tuning,
  water,
  onWater,
  beak,
  beakYaw,
  beakDir,
  beakMouth,
  grabHint,
  grabbed,
  onGrab,
  onBones,
}: GooseActorProps) {
  const group = useRef<THREE.Group>(null);
  const { scene } = useGLTF(SRC, DRACO);
  const { camera } = useThree();

  const shownGraph = useRef<ReturnType<typeof gooseMaterial>["graph"] | null>(
    null,
  );

  const root = useMemo(() => {
    // One graph material per source material, cached: several meshes share
    // PaletteMaterial001, and compiling per mesh would build the same TSL tree
    // (and re-upload the same atlas) a dozen times.
    const byMaterial = new Map<string, THREE.Material>();
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.frustumCulled = false;
      /**
       * Keep the ORIGINAL material, and always derive from that.
       */
      const origs = (m.userData.originalMaterials ??= Array.isArray(m.material)
        ? m.material.slice()
        : [m.material]) as THREE.Material[];
      let slot = 0;

      const swap = (current: THREE.Material) => {
        const src = (origs[slot++] ?? current) as THREE.MeshStandardMaterial;
        const map = src.map ?? null;
        const key = `${src.uuid}`;
        const hit = byMaterial.get(key);
        if (hit) return hit;
        const built = gooseMaterial(
          map,
          src.color?.clone() ?? new THREE.Color(0xffffff),
        );
        built.material.name = src.name;
        shownGraph.current ??= built.graph;
        byMaterial.set(key, built.material);
        return built.material;
      };
      m.material = Array.isArray(m.material)
        ? m.material.map(swap)
        : swap(m.material);
    });
    /**
     * Lengthen the legs — ONCE.
     */
    if (!scene.userData.legsStretched) {
      scene.userData.legsStretched = true;
      for (const n of ["shinL", "footL", "shinR", "footR"]) {
        scene.getObjectByName(n)?.position.multiplyScalar(LEG_STRETCH);
      }
    }

    return scene;
  }, [scene]);

  const bones = useMemo(() => {
    const map: Record<string, THREE.Object3D | undefined> = {};
    for (const n of BONE_NAMES) {
      // Try the exported name, then the dotted Blender form, so the rig keeps
      // working whichever convention a future re-export happens to produce.
      map[n] =
        root.getObjectByName(n) ??
        root.getObjectByName(n.replace(/([LR])$/, ".$1"));
    }
    assertBones(map, root);
    return map;
  }, [root]);

  const pose = usePoseDriver(bones);

  /**
   * Normalise the export to a fixed on-screen height.
   */
  const fit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    return 1.3 / (size.y || 1);
  }, [root]);

  const keys = useRef<Record<string, boolean>>({});
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      // Arrow keys and space scroll the page otherwise, which is jarring when
      // you are trying to drive something.
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
          e.code,
        )
      )
        e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };
    const blur = () => {
      keys.current = {};
    };
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    // Without this a key held while the tab loses focus stays "down" forever.
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  /**
   * Springs, not physics.
   */
  const springs = useMemo(
    () => ({
      lag: new Spring(70, 12),
      sway: new Spring(70, 12),
      leanPitch: new Spring(52, 5.2),
      leanRoll: new Spring(46, 4.8),
      bounce: new Spring(80, 6.5),
    }),
    [],
  );

  const state = useRef({
    prevVel: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    heading: 0,
    /** Angular velocity of the heading. Lets turns overshoot and settle. */
    headingVel: 0,
    distance: 0,
    time: 0,
    turn: 0,
    jaw: 0,
    /** 0..1 crouch, eased from the C key. Held through walking. */
    duck: 0,
    /** Seconds left of the leg extension. See LAUNCH_TIME. */
    launchT: 0,
    /** Eased 0..1 airborne, for the pose. See airBlend in goose-walk. */
    airBlend: 0,
    /** Dev only: how far the resolver moved the goose this frame. */
    pushMag: 0,
    /** Fastest the goose may travel horizontally this jump. See AIR_SPEED_MIN. */
    airCap: 0,
    /** Vertical velocity. Non-zero only while airborne. */
    vy: 0,
    airborne: false,
    /** Space held last frame, so a held key does not bunny-hop. */
    jumpHeld: false,
    /** Counts down after landing, for the squash. */
    landed: 0,
    /** Seconds left of the pre-jump crouch. */
    crouchT: 0,
    /** 0..1 walk-to-run blend. */
    run: 0,
    /** 0..1 land-to-water blend. */
    swim: 0,
    /** Whether the foot IK was stood down last frame, so it can re-plant. */
    ikOff: false,
    /** Gait phase in whole steps. Accumulated, never divided. */
    phase: 0,
    /** Seconds since the last waterline readout. */
    waterTick: 0,
    /** Paddle phase, radians. Own clock — see the stroke block in the loop. */
    stroke: 0,
    /** 0..1 coast-to-stroke blend. */
    paddling: 0,
    /** Seconds since the beak angle was last reported. */
    beakTick: 0,
    /** Grab key held last frame, so holding it does not drop and re-grab. */
    grabHeld: false,
  });

  /**
   * Leg geometry, measured off the rig rather than typed in.
   */
  const legRig = useRef<{
    upper: number;
    lower: number;
    pole: THREE.Vector3;
    groundY: number;
    /** +1 or -1 along body-local x, per leg. See KNEE_OUT. */
    outward: { L: number; R: number };
  } | null>(null);

  const planner = useRef<FootPlanner | null>(null);
  const hitResult = useRef<Resolved>({ x: 0, z: 0, hit: false });
  const headPush = useRef({ x: 0, z: 0 });
  /** Torso vertical extent, relative to the body. Measured once. */
  const torso = useRef<{ low: number; span: number } | null>(null);
  const solidScratch = useRef<Collider[]>([]);
  /** Which box the goose is standing on, so falling off it does not shove it. */
  const standingOn = useRef<{ box: Collider | null }>({ box: null });
  /**
   * The last box it actually stood on, held until it lands somewhere else.
   *
   * `standingOn` is cleared by supportHeight on the very frame the goose walks
   * past the edge — which is the frame the exemption starts to matter, so using
   * it directly exempts nothing. This one remembers.
   */
  const leftBehind = useRef<Collider | null>(null);
  const neckOffsets = useRef<
    { dx: number; dz: number; y: number; r: number }[]
  >([]);
  const ikSolution = useRef<TwoBoneSolution>({
    knee: new THREE.Vector3(),
    stretched: false,
  });

  const scratch = useMemo(
    () => ({
      want: new THREE.Vector3(),
      hipW: new THREE.Vector3(),
      headNow: new THREE.Vector3(),
      capA: new THREE.Vector3(),
      capB: new THREE.Vector3(),
      beakNow: new THREE.Vector3(),
      /** Lateral axis for tipping the bone vector onto the bill axis. */
      billLat: new THREE.Vector3(),
      /** Beak bone toward the mouth. */
      mouthDir: new THREE.Vector3(),
      footW: new THREE.Vector3(),
      aim: new THREE.Vector3(),
      poleW: new THREE.Vector3(),
      fwd: new THREE.Vector3(),
      right: new THREE.Vector3(),
      toTarget: new THREE.Vector3(),
    }),
    [],
  );

  useEffect(() => {
    const g = shownGraph.current;
    if (g) onGraph?.(g.out);
  }, [root, onGraph]);

  useEffect(() => {
    onBones?.(bones);
  }, [bones, onBones]);

  // Dev handle: the PD controllers can only be verified by watching a bone LAG
  // its target over successive frames, which needs access to the live bones.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as Record<string, unknown>).__gooseBones = bones;
    // Probes need to skin vertices on the CPU to find where the SOLE actually
    // is — the ankle bone can sit above the grass while the foot mesh below it
    // does not, and only the vertices know that.
    (window as unknown as Record<string, unknown>).__THREE = THREE;
    // Bound ONCE here, not rebuilt inside the frame loop. These used to be
    // reassigned every frame, which allocated four closures per frame purely so
    // a probe could call them — real garbage for no benefit.
    const w = window as unknown as Record<string, unknown>;
    w.__poseTarget = (n: string) => pose.targetDeviation(n);
    w.__poseActual = (n: string) => pose.restDeviation(n);
    w.__setFlop = (v: number) => pose.setFlop(v);
    w.__aimDbg = (n: string) => pose.debugAim(n);
    w.__gooseState = () => state.current;
    w.__crates = () => crates?.current ?? [];
  }, [bones, pose, crates]);

  useFrame((_, delta) => {
    const t0 = process.env.NODE_ENV !== "production" ? performance.now() : 0;
    const dt = Math.min(delta, 0.05);
    const g = group.current;
    if (!g) return;
    const st = state.current;
    st.time += dt;

    const { want, fwd, right, toTarget } = scratch;
    want.set(0, 0, 0);

    // Camera-relative WASD, flattened to the ground plane so looking down does
    // not shrink the movement.
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    // cross(forward, up) IS world-right for a camera looking down -Z. Negating
    // it made D strafe left and A strafe right, and because the goose turns to
    // face its velocity it then looked like the model was facing backwards.
    right.crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();

    const k = keys.current;
    if (k.KeyW || k.ArrowUp) want.add(fwd);
    if (k.KeyS || k.ArrowDown) want.sub(fwd);
    if (k.KeyA || k.ArrowLeft) want.sub(right);
    if (k.KeyD || k.ArrowRight) want.add(right);

    // Shift to run. Eased rather than switched, so the posture change reads as
    // the goose leaning into it instead of snapping between two rigs.
    /**
     * Duck is its own key now, and it does NOT fade out as you move.
     *
     * It used to be derived from shift at low speed — whatever fraction of the
     * run blend the run was not using. Complementary and tidy, and it made a
     * crouch you could only hold standing still: step off and the goose stood
     * straight up, because moving was the thing that cancelled it. A sneak is
     * a way of MOVING, so it cannot be defined as the absence of movement.
     *
     * The two COMBINE rather than cancel. Shift is the engine and C is the
     * posture, so holding both is a fast sneak: still folded down low, just
     * covering ground. Letting duck win outright made shift+C a slow walk,
     * which is neither of the things the keys say they do.
     */
    const wantDuck = Boolean(k.KeyC);
    st.duck += ((wantDuck ? 1 : 0) - st.duck) * Math.min(1, 8 * dt);
    const wantRun = Boolean(k.ShiftLeft || k.ShiftRight);
    st.run += ((wantRun ? 1 : 0) - st.run) * Math.min(1, 6 * dt);
    // In the pond? Blended, so wading in and out is a transition rather than a
    // switch — the goose settles into the water over about a third of a second.
    /**
     * How much of the goose's weight the water is taking.
     *
     * Not an in-or-out test. The goose sinks until it either floats or its
     * feet find the bottom, so near the bank it stands in the shallows and
     * only reaches full float once the bed drops below FLOAT_DEPTH. That is
     * the same bowl the water shader draws its depth gradient from, which is
     * why the two cannot disagree — a goose at full float over water painted
     * as ankle-deep is the tell that they were tuned separately.
     */
    const floatDepth = water?.float ?? FLOAT_DEPTH;
    const bed = pondBed(g.position.x, g.position.z, water?.bed ?? POND.depth);
    const buoyed = Math.min(1, bed / floatDepth);
    st.swim += (buoyed - st.swim) * Math.min(1, SWIM_BLEND * dt);

    // One number for the gait and the foot planner both, or the legs and the
    // body disagree about how long a step is. Needed before the movement
    // below, which advances the phase through it.
    /**
     * Shortened by the crouch, and that is a REQUIREMENT rather than a flourish.
     *
     * Hip height is leg reach on this rig — the leg measures 0.359 and spans
     * 0.358 standing, so it is straight already. Dropping the hips spends the
     * only slack there is, and if a full stride still has to be covered the foot
     * cannot reach its plant and punches through the lawn instead. That is what
     * DUCK_DROP was gated on standing still to avoid.
     *
     * Taking the step down with the body buys the reach back, and it is what a
     * creeping animal does anyway: short, close steps.
     */
    const strideNow =
      STRIDE *
      (1 + st.run * (tuning?.stride ?? RUN_STRIDE)) *
      // Only while actually creeping. Shortening the step at full running speed
      // does not slow the goose down, it spins the legs faster: 1.85 m/s over a
      // 0.4875 stride is 3.79 steps a second against a normal run's 2.85, which
      // reads as scrabbling rather than as a low fast gait. The run's own stride
      // is what keeps a crouched sprint to a trot.
      (1 - SNEAK_STRIDE * st.duck * (1 - st.run));
    const runSpeed = tuning?.speed ?? SPEED_RUN;
    const walkSpeed =
      (SPEED_WALK + (runSpeed - SPEED_WALK) * st.run) *
      // The crouch tax is paid off by the run: creeping is slow, sprint-crouching
      // is not. At full run this cancels entirely and only the posture remains.
      (1 - SNEAK_SLOW * st.duck * (1 - st.run));
    // Shift afloat pushes the paddle, not the posture — see SWIM_RUN.
    const swimSpeed =
      (water?.speed ?? SWIM_SPEED) * (1 + (SWIM_RUN - 1) * st.run);
    const speedNow = walkSpeed + (swimSpeed - walkSpeed) * st.swim;

    const manual = want.lengthSq() > 0;
    if (manual) {
      want.normalize().multiplyScalar(speedNow);
    } else if (target) {
      // Click-to-move. Ease down on approach so it settles instead of
      // overshooting and oscillating around the point.
      toTarget.copy(target).sub(g.position);
      toTarget.y = 0;
      const dist = toTarget.length();
      if (dist <= ARRIVE) {
        onArrive?.();
      } else {
        want
          .copy(toTarget)
          .normalize()
          .multiplyScalar(speedNow * Math.min(1, dist / 1.2));
      }
    }

    // Accelerate toward the wanted velocity; drag brings it back to rest.
    // Both are blended toward the water values, so wading in changes how the
    // goose MOVES and not merely how it is posed.
    const accelNow = ACCEL + (SWIM_ACCEL - ACCEL) * st.swim;
    const dragNow = DRAG + (SWIM_DRAG - DRAG) * st.swim;
    const rate = want.lengthSq() > 0 ? accelNow : dragNow;

    /**
     * The paddle runs on its own clock, not on distance travelled.
     *
     * On land the gait is distance-driven so the feet cannot skate: a foot on
     * the ground has to move with the ground. In water that reasoning is gone,
     * and it actively hurts — distance-driven legs keep paddling all through a
     * glide and stall the moment the goose is pushing against something. What
     * a swimming bird actually does is stroke while it wants to go somewhere
     * and hold still while it coasts, so that is what drives it.
     */
    const wantsThrust = want.lengthSq() > 0 ? 1 : 0;
    st.paddling += (wantsThrust - st.paddling) * Math.min(1, STROKE_EASE * dt);
    st.stroke +=
      st.paddling *
      (water?.stroke ?? STROKE_RATE) *
      (1 + (SWIM_RUN - 1) * st.run) *
      dt;
    if (st.airborne) {
      /**
       * Aloft: push, do not chase. See AIR_ACCEL.
       *
       * `want` carries a ground speed in its magnitude, which means nothing up
       * here, so only its DIRECTION is used. With no input the velocity is left
       * exactly as it is, which is what makes the arc ballistic and the leap
       * survive to the far side of a hedge.
       */
      const wantLen = Math.hypot(want.x, want.z);
      if (wantLen > 1e-6) {
        // Asking against the way it is already going is a brake, not a turn.
        const into = want.x * st.vel.x + want.z * st.vel.z;
        const step = ((into < 0 ? AIR_BRAKE : AIR_ACCEL) * dt) / wantLen;
        st.vel.x += want.x * step;
        st.vel.z += want.z * step;
        const cap = st.airCap > 0 ? st.airCap : AIR_SPEED_MIN;
        const air = Math.hypot(st.vel.x, st.vel.z);
        if (air > cap) {
          const k = cap / air;
          st.vel.x *= k;
          st.vel.z *= k;
        }
      }
    } else {
      st.vel.x += (want.x - st.vel.x) * Math.min(1, rate * dt);
      st.vel.z += (want.z - st.vel.z) * Math.min(1, rate * dt);
    }

    // Acceleration in the goose's OWN frame, so "forward" means forward for the
    // bird regardless of which way the camera is pointing.
    // Floor dt before dividing. R3F reports delta = 0 on the first frame, and
    // (0 - 0) / 0 is NaN, not zero — which is how a stationary goose on frame
    // one ended up destroying itself.
    const safeDt = Math.max(dt, 1 / 240);
    const ax = (st.vel.x - st.prevVel.x) / safeDt;
    const az = (st.vel.z - st.prevVel.z) / safeDt;
    st.prevVel.copy(st.vel);
    const sinH = Math.sin(st.heading);
    const cosH = Math.cos(st.heading);
    const accelFwd = THREE.MathUtils.clamp((ax * sinH + az * cosH) / 12, -1, 1);
    const accelSide = THREE.MathUtils.clamp(
      (ax * cosH - az * sinH) / 12,
      -1,
      1,
    );
    const lag = springs.lag.step(accelFwd, dt);
    const sway = springs.sway.step(accelSide, dt);
    // Whole-body attitude. Braking pitches the chest DOWN over the feet and
    // accelerating rocks it back, so the sign is inverted against accelFwd.
    const leanPitch = springs.leanPitch.step(-accelFwd * 0.3, dt);
    const leanRoll = springs.leanRoll.step(-accelSide * 0.26, dt);
    // Squash on any hard change of pace, in either direction.
    // Squash on any hard change of pace, and harder on landing. Tucked in the
    // air, because legs dangling at full stretch read as a dropped puppet.
    const bounce = springs.bounce.step(
      -Math.abs(accelFwd) * 0.022 -
        st.landed * 0.06 -
        (st.crouchT > 0 ? 0.075 : 0) +
        (st.airborne ? 0.035 : 0),
      dt,
    );

    /**
     * Static scenery PLUS whatever crates are currently in the way.
     *
     * Hoisted out of the movement branch below because the jump needs it too:
     * what you can stand on has to be known every frame, including the frames
     * where the goose is not moving horizontally at all.
     */
    const solid = crates?.current?.length
      ? ((solidScratch.current.length = 0),
        solidScratch.current.push(...COLLIDERS, ...crates.current),
        solidScratch.current)
      : COLLIDERS;

    st.pushMag = 0;
    const speed = Math.hypot(st.vel.x, st.vel.z);
    // Coasting through the air with no input: keep the heading you had. There
    // is no intent to follow and the velocity may be too small to have a
    // direction worth reading.
    const holdHeading = st.airborne && want.lengthSq() === 0;
    if (speed > 1e-3 && !holdHeading) {
      // Where it started this frame, kept as scalars: the slide below rewrites
      // st.vel, so it cannot be used afterwards to reconstruct this.
      const fromX = g.position.x;
      const fromZ = g.position.z;
      g.position.x += st.vel.x * dt;
      g.position.z += st.vel.z * dt;

      /**
       * Resolve against the scenery, then LEARN from it.
       */
      const wantX = g.position.x;
      const wantZ = g.position.z;
      /**
       * Resolve the body AND the neck together, iterating to convergence.
       */
      let px = wantX;
      let pz = wantZ;
      // Track this separately. resolveCollisions reports whether THAT call
      // found an overlap, so reading it after the final pass reports the state
      // AFTER everything was fixed — which is false by design, and throws the
      // whole correction away.
      let corrected = false;
      for (let pass = 0; pass < 3; pass++) {
        const r0 = resolveCollisions(
          px,
          pz,
          GOOSE_RADIUS,
          solid,
          LAWN_HALF,
          hitResult.current,
          // The height, without which nothing can ever be jumped over. Both
          // resolvers take a y and skip anything whose top is below it, and
          // both were being called without one — so the default of -Infinity
          // meant every collider blocked the goose at every altitude, mid-air
          // included. The neck offsets even carry a measured y that was
          // computed every frame and then never passed.
          g.position.y,
          // Dropping off a ledge: the box just left is not an obstacle. Its
          // overhang was there the whole time the goose stood on it.
          st.airborne && st.vy <= 0 ? leftBehind.current : null,
        );
        if (r0.hit) corrected = true;
        px = r0.x;
        pz = r0.z;
        for (const o of neckOffsets.current) {
          if (
            !penetration(
              px + o.dx,
              pz + o.dz,
              o.r,
              solid,
              headPush.current,
              o.y,
              st.airborne && st.vy <= 0 ? leftBehind.current : null,
            )
          )
            continue;
          corrected = true;
          px += headPush.current.x;
          pz += headPush.current.z;
        }
      }
      const r = { x: px, z: pz, hit: corrected };
      if (r.hit) {
        let pushX = r.x - wantX;
        let pushZ = r.z - wantZ;
        /**
         * Rate-limit the correction. It is a position fix, not a teleport.
         *
         * Walking into scenery needs a correction no bigger than the step that
         * caused it — 0.031 m a frame at a full run — so this never binds on
         * the ground. Falling off a ledge is a different shape entirely: the
         * goose stands with its body overhanging the edge, which is fine and
         * what a bird does, and the moment it drops below the top the resolver
         * discovers the whole overhang at once and fixes it in a single frame.
         * Measured walking off a hedge, that was 17.49 m/s of sideways motion
         * against a 0.95 m/s walk — the nudge you can see.
         *
         * Capping it against the goose's own speed keeps scenery just as solid —
         * nothing can outrun a fix that scales with it — while spreading that
         * discovered overlap over several frames, so the goose slides off the
         * lip instead of being flicked off it.
         */
        const pushLen = Math.hypot(pushX, pushZ);
        const pushCap =
          Math.max(PUSH_SPEED_FLOOR, speed * PUSH_SPEED_GAIN) * dt;
        if (pushLen > pushCap && pushLen > 1e-9) {
          const k = pushCap / pushLen;
          pushX *= k;
          pushZ *= k;
        }
        g.position.x = wantX + pushX;
        g.position.z = wantZ + pushZ;
        if (process.env.NODE_ENV !== "production") st.pushMag = Math.hypot(pushX, pushZ);
        const len = Math.hypot(pushX, pushZ);
        if (len > 1e-6) {
          const nx = pushX / len;
          const nz = pushZ / len;
          const into = st.vel.x * nx + st.vel.z * nz;
          if (into < 0) {
            st.vel.x -= nx * into;
            st.vel.z -= nz * into;
          }
        }
      }

      // Distance travelled for real, after collision — not distance intended.
      // This is what keeps the legs from pumping while the goose is jammed
      // against a hedge: no ground covered, no gait phase advanced.
      const moved = Math.hypot(g.position.x - fromX, g.position.z - fromZ);
      st.distance += moved;
      /**
       * The gait phase ACCUMULATES; it is never distance divided by stride.
       *
       * Dividing works only while the stride is a constant. The moment it
       * varies — which is the whole point of the run lengthening it — the same
       * accumulated distance over a changed divisor lands on a completely
       * different phase, and the legs snap there between one frame and the
       * next. At 12m travelled, easing the stride from 0.50 to 0.79 moves the
       * phase by nine whole steps. That is the skid on the walk-run change.
       */
      /**
       * Only while there is ground under it.
       *
       * Same rule as the line above about being jammed against a hedge — no
       * ground covered, no gait phase advanced — and being airborne is the
       * same situation for the same reason: the legs are tucked, nothing is
       * stepping, so nothing should be cycling. It travels far enough for this
       * to matter. A running jump covers 2.13 m in the air, which is 3.27
       * steps' worth of phase, so the cycle came down 27% into a step that
       * never happened and the feet had to scramble to that pose on touchdown.
       * That is the stumble on landing.
       */
      if (!st.airborne) st.phase += moved / Math.max(1e-3, strideNow);

      /**
       * Turn toward travel, by the SHORT way round — without the wrap the
       * goose spins the long way whenever the heading crosses +/-PI.
       *
       * Afloat it turns toward where it is TRYING to go instead of where
       * momentum is carrying it. Steering off velocity is right on land,
       * where the two are near enough the same thing, but in water velocity
       * now lags the stick badly on purpose, and steering off it inherits
       * that lag twice over. A paddling bird pivots with its feet regardless
       * of which way it is drifting, so the intent is the better target.
       */
      /**
       * Aloft, steer by INTENT too — for the same reason as afloat, and one
       * more.
       *
       * The heading chases the direction of travel, which is fine on grass
       * where velocity and intent agree. In the air they need not: steering is
       * an acceleration now, so the velocity vector can swing hard, and air
       * braking can take horizontal speed close to zero — at which point
       * atan2(vel) is not a direction at all, it is noise. An underdamped
       * spring chasing noise is a goose spinning on the spot several times a
       * second, which is exactly what it looked like.
       */
      const steering =
        want.lengthSq() > 0 ? Math.max(st.swim, st.airborne ? 1 : 0) : 0;
      const wanted = Math.atan2(
        st.vel.x + (want.x - st.vel.x) * steering,
        st.vel.z + (want.z - st.vel.z) * steering,
      );
      let diff = wanted - st.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      // Spring the heading rather than lerping it. A lerp can only ease IN to
      // the new direction; a spring carries angular momentum, so a sharp change
      // of direction swings a few degrees past and comes back. That tiny
      // overshoot is most of what makes the turn look like a body pivoting
      // rather than a transform being interpolated.
      // A boat turns about its own length, not on a heel.
      /**
       * And turn lazily up there. A bird in the air pivots with its whole body
       * against nothing; it does not snap round to face a new drift the way it
       * can when a foot is planted.
       */
      const ts =
        (TURN_STIFFNESS + (SWIM_TURN_STIFFNESS - TURN_STIFFNESS) * st.swim) *
        (st.airborne ? AIR_TURN : 1);
      const td = TURN_DAMPING + (SWIM_TURN_DAMPING - TURN_DAMPING) * st.swim;
      const c = 2 * td * Math.sqrt(ts);
      st.headingVel += diff * ts * dt;
      st.headingVel *= Math.exp(-c * dt);
      if (!Number.isFinite(st.headingVel)) st.headingVel = 0;
      const turnStep = st.headingVel * dt;
      st.heading += turnStep;
      st.turn = THREE.MathUtils.clamp(st.headingVel / 3, -1, 1);
    } else {
      // Bleed off the spin instead of dropping it, or the goose stops mid-turn.
      st.headingVel *= Math.exp(-6 * dt);
      st.heading += st.headingVel * dt;
      st.turn += (0 - st.turn) * Math.min(1, 5 * dt);
    }
    g.rotation.y = st.heading;

    // --- jump ----------------------------------------------------------------
    // Edge-triggered: a held Space should not machine-gun jumps, and checking
    // the transition rather than the state is the whole of that.
    // Cannot leap off water.
    const wantJump = Boolean(k.Space) && st.swim < 0.5;
    if (wantJump && !st.jumpHeld && !st.airborne && st.crouchT <= 0) {
      // Crouch first, launch when it finishes.
      st.crouchT = ANTICIPATION;
    }
    st.jumpHeld = wantJump;

    if (st.crouchT > 0) {
      st.crouchT -= dt;
      if (st.crouchT <= 0) {
        st.crouchT = 0;
        // The crouch is done; the legs start extending.
        st.launchT = LAUNCH_TIME;
        st.airborne = true;
        // Whatever it was carrying is all it gets to carry.
        st.airCap = Math.max(
          AIR_SPEED_MIN,
          Math.hypot(st.vel.x, st.vel.z),
        );
      }
    }

    /**
     * What is underfoot: a crate or hedge top if the goose is over one, the
     * lawn otherwise. Afloat there is nothing to stand on at all.
     */
    const support =
      st.swim > 0.5
        ? GROUND_Y
        : supportHeight(
            g.position.x,
            g.position.z,
            solid,
            GROUND_Y,
            // Half a goose of overhang. Enough that landing on a crate is a
            // move you can actually land, and small enough that the goose is
            // never standing on visibly nothing.
            GOOSE_RADIUS * 0.5,
            standingOn.current,
          );
    /**
     * Remember it; do NOT clear it merely because there is no box underfoot.
     *
     * Clearing on "no support" disarmed this one frame before it was needed.
     * Support is sampled here, but `airborne` is not set until the block below,
     * so on the exact frame the goose walks past the edge it still counts as
     * grounded — the exemption was wiped, and the next frame it fell with none.
     * Which is why the shove survived two attempts at removing it.
     *
     * It is cleared on landing instead, where "the box I stepped off" stops
     * meaning anything.
     */
    if (standingOn.current.box) leftBehind.current = standingOn.current.box;

    if (st.launchT > 0) {
      /**
       * The legs extending — a real push over a real time, straight up.
       *
       * Gravity is already pulling during the extension, so the upward
       * acceleration carries it: (v + g*T) / T leaves the body at v when the
       * legs finish, which is the speed the apex was solved for.
       *
       * Nothing horizontal happens here. Whatever the goose was already doing
       * carries into the arc untouched, and where it goes from there is the
       * player's business — see AIR_ACCEL.
       */
      const step = Math.min(dt, st.launchT);
      st.launchT -= dt;
      st.vy += ((JUMP_SPEED + JUMP_GRAVITY * LAUNCH_TIME) / LAUNCH_TIME) * step;
    }

    if (st.airborne) {
      st.vy -= JUMP_GRAVITY * dt;
      g.position.y += st.vy * dt;
      // Only while DESCENDING. Rising through a crate's top would otherwise
      // stick the goose to the underside of a box it is jumping past.
      if (st.vy <= 0 && g.position.y <= support) {
        // Land. Convert whatever downward speed is left into a squash, so a
        // longer fall hits harder — the impact reads as weight rather than as
        // a fixed canned bounce.
        g.position.y = support;
        st.landed = Math.min(1, Math.abs(st.vy) / JUMP_SPEED);
        st.vy = 0;
        st.airborne = false;
        st.launchT = 0;
        // Down again: whatever it stepped off is just scenery once more.
        leftBehind.current = null;
      }
    } else if (g.position.y > support + 1e-3 && st.swim < 0.5) {
      /**
       * Walked off an edge. Fall, rather than teleporting down.
       *
       * Reachable because `support` is sampled where the goose IS, and it
       * moves horizontally before this runs — so stepping off a crate drops
       * the support out from under it mid-stride.
       */
      st.airborne = true;
      st.vy = 0;
      st.airCap = Math.max(AIR_SPEED_MIN, Math.hypot(st.vel.x, st.vel.z));
    } else {
      // Floats when swimming, stands otherwise, with a slow bob on the water.
      const bob = Math.sin(st.time * 1.4) * 0.012 * st.swim;
      g.position.y = support - floatDepth * st.swim + bob;
      st.landed *= Math.exp(-9 * dt);
    }

    // Ease the airborne pose in and out. 7/s is about a seventh of a second,
    // long enough that the wings open rather than bang, short enough that the
    // goose is in its air pose well before the top of a jump.
    st.airBlend += ((st.airborne ? 1 : 0) - st.airBlend) * Math.min(1, 7 * dt);

    /**
     * Honk: open NOW, ease shut. A symmetric oscillation reads as chewing.
     *
     * The command goes to 1 on the frame the key lands rather than ramping at
     * 22/s, because it is not the thing shaping the motion — the jaw spring is.
     * Two lags in series (a 45ms envelope feeding a 156ms spring) is what made
     * the old honk feel like a yawn; the envelope was the half that carried no
     * character, so it is gone and the spring does the whole attack.
     *
     * Release still ramps, and still slower than the attack — that asymmetry
     * IS the honk. But 9/s was a 111ms time constant on top of a 260ms hold,
     * which together made the mouth linger open for over half a second. At 26/s
     * the constant is 38ms and the mouth is shut again inside 120ms.
     */
    if (honk) st.jaw = 1;
    else st.jaw += (0 - st.jaw) * Math.min(1, 26 * dt);

    /**
     * Torso extent, once. Needed to report the waterline as a fraction of the
     * body rather than as a raw depth, which is the only form the number is
     * judgeable in.
     *
     * Bucketed by dominant bone, not by material: the material that paints the
     * body paints the neck with it, and a span that includes the neck makes
     * the goose look 7% submerged when its whole torso is in the air.
     */
    if (!torso.current) {
      const spine = new Set(["hips", "spine", "chest", "tail"]);
      const v = new THREE.Vector3();
      let lo = Infinity;
      let hi = -Infinity;
      root.traverse((n) => {
        const m = n as THREE.SkinnedMesh;
        if (!m.isSkinnedMesh || !m.geometry.attributes.skinIndex) return;
        const si = m.geometry.attributes.skinIndex;
        const sw = m.geometry.attributes.skinWeight;
        for (let i = 0; i < m.geometry.attributes.position.count; i++) {
          let best = -1;
          let bw = -1;
          for (let k = 0; k < 4; k++) {
            const w = sw.getComponent(i, k);
            if (w > bw) {
              bw = w;
              best = si.getComponent(i, k);
            }
          }
          if (!spine.has(m.skeleton.bones[best]?.name ?? "")) continue;
          v.fromBufferAttribute(m.geometry.attributes.position, i);
          m.applyBoneTransform(i, v);
          m.localToWorld(v);
          if (v.y < lo) lo = v.y;
          if (v.y > hi) hi = v.y;
        }
      });
      if (Number.isFinite(lo) && hi > lo) {
        // Relative to the body, so it stays valid as the goose rises and sinks.
        torso.current = { low: lo - g.position.y, span: hi - lo };
      }
    }
    // Throttled like the pose readout: this drives React state, and a setState
    // per frame re-renders the page sixty times a second to move one label.
    if (onWater && torso.current) {
      st.waterTick += dt;
      if (st.waterTick > 0.15) {
        st.waterTick = 0;
        const low = g.position.y + torso.current.low;
        onWater({
          waterline: Math.max(
            0,
            Math.min(1, (POND.surface - low) / torso.current.span),
          ),
          swim: st.swim,
        });
      }
    }

    // --- leg rig calibration, once, inside the frame loop -------------------
    // Same reason the pose driver captures lazily: world matrices are not
    // trustworthy during render, and a pole vector derived from a stale matrix
    // points somewhere arbitrary, which inverts the knee.
    if (!legRig.current && bones.thighL && bones.shinL && bones.footL) {
      const hip = new THREE.Vector3();
      const knee = new THREE.Vector3();
      const foot = new THREE.Vector3();
      bones.thighL.updateWorldMatrix(true, false);
      bones.shinL.updateWorldMatrix(true, false);
      bones.footL.updateWorldMatrix(true, false);
      bones.thighL.getWorldPosition(hip);
      bones.shinL.getWorldPosition(knee);
      bones.footL.getWorldPosition(foot);

      const upper = hip.distanceTo(knee);
      const lower = knee.distanceTo(foot);
      const span = hip.distanceTo(foot);
      if (upper > 1e-4 && lower > 1e-4) {
        // Pole = the part of hip->knee that is off the hip->foot line. That IS
        // the bend direction, by definition, in whatever pose the rig rests in.
        const axis = foot.clone().sub(hip).normalize();
        const toKnee = knee.clone().sub(hip);
        const pole = toKnee.sub(axis.clone().multiplyScalar(toKnee.dot(axis)));
        /**
         * A straight leg has no bend to read a pole from.
         */
        const straightness = span / (upper + lower);
        if (straightness > 0.97 || pole.lengthSq() < 1e-6) {
          pole.set(0, 0, -1);
          if (process.env.NODE_ENV !== "production") {
            console.info(
              `[goose] rest leg is ${(straightness * 100).toFixed(1)}% extended — ` +
                "pole taken as body-backward rather than measured",
            );
          }
        }
        pole.normalize();
        // Both feet, measured. Heading is zero on the first frame, so world and
        // body-local coincide here; anything else would need de-rotating.
        const footR = new THREE.Vector3();
        bones.footR?.updateWorldMatrix(true, false);
        bones.footR?.getWorldPosition(footR);
        /**
         * Plant height, corrected for the leg stretch.
         */
        /**
         * How far the stretch pushed the ankle DOWN — the vertical drop, not
         * the leg's length.
         */
        const added = (hip.y - foot.y) * (1 - 1 / LEG_STRETCH);
        const plantY = foot.y + added;
        /**
         * Which way is OUT, per leg, measured rather than assumed.
         *
         * Heading is zero on this frame, so world x IS body-local x here — the
         * same fact the foot anchors below rely on. A rig exported mirrored
         * would flip these, which is exactly why they are read off the feet
         * instead of hard-coded to +1 and -1.
         */
        const outL = Math.sign(foot.x - g.position.x) || 1;
        legRig.current = {
          upper,
          lower,
          pole,
          groundY: plantY,
          outward: { L: outL, R: -outL },
        };
        if (process.env.NODE_ENV !== "production") {
          (window as unknown as Record<string, unknown>).__legRig = {
            upper,
            lower,
            pole: pole.toArray(),
            restBend: toKnee.length(),
            span: foot.distanceTo(hip),
            groundY: plantY,
            straightness: foot.distanceTo(hip) / (upper + lower),
          };
        }
        planner.current = new FootPlanner(
          {
            L: { x: foot.x - g.position.x, z: foot.z - g.position.z },
            R: { x: footR.x - g.position.x, z: footR.z - g.position.z },
          },
          // The CORRECTED plant height, not the raw rest position — the
          // planner and the IK have to agree on where the ground is, and this
          // was quietly passing the uncorrected one while legRig had the fix.
          plantY,
        );
        planner.current.reset(g.position, st.heading);
      }
    }

    if (process.env.NODE_ENV !== "production" && planner.current) {
      (window as unknown as Record<string, unknown>).__plan = planner.current;
    }
    planner.current?.setDelta(dt);
    // Duty factor for this frame. The walk keeps its overlap; the run opens a
    // flight phase. Everything downstream of the planner reads it from there.
    const stanceNow = STANCE - (tuning?.duty ?? RUN_DUTY) * st.run;
    if (planner.current) {
      planner.current.stance = stanceNow;
      // Feet pick up as the goose speeds up. See `lift` on the planner: this is
      // what makes a run read as striding rather than as a body bobbing along.
      planner.current.lift = STEP_LIFT * (1 + st.run * (tuning?.lift ?? RUN_LIFT));
    }
    const rig = legRig.current;
    // Live hip height above the ground, so reach accounts for the crouch, the
    // bob and any lean rather than assuming the rest pose.
    let hipHeight = 0.16;
    if (rig && bones.thighL) {
      bones.thighL.updateWorldMatrix(true, false);
      /**
       * Above the surface being STOOD ON, not above the lawn.
       *
       * rig.groundY is the rest plant height, which was the only floor there
       * was until the goose could land on things. Up on a crate the hip is a
       * whole crate higher, so this read 0.94 instead of 0.24 — and it feeds
       * maxOffset, which is how far a planted foot may sit from under the hip
       * before the leg over-extends. sqrt(reach^2 - hipHeight^2) with a
       * hipHeight larger than the leg goes imaginary, clamps to the 1e-4
       * floor, and hands the planner a 0.010 budget instead of 0.215. The
       * legs pin themselves under the body and the goose slides along the
       * crate with no stride at all.
       *
       * Same expression the planner's ground uses, for the same reason: the
       * body's actual height is the one thing both can agree on.
       */
      hipHeight = Math.max(
        0.02,
        bones.thighL.getWorldPosition(scratch.hipW).y -
          (rig.groundY + (g.position.y - GROUND_Y)),
      );
    }
    // Afloat there is no ground to plant on, so the planner stands down and
    // the gait drives the legs directly as a paddle.
    // Coming back to the legs after a swim, the planner has been frozen for
    // seconds while the body travelled. Re-plant before the first solve rather
    // than letting it aim at where the goose waded in.
    /**
     * The IK keeps working right through the wade, and only stands down once
     * the goose is properly afloat.
     *
     * Handing the legs over at the waterline was the mistake: that is exactly
     * where you are looking, and the switch from planted feet to a paddle is a
     * visible jump however well each side behaves on its own. Down here the
     * legs are half a body under an opaque surface, so the swap happens where
     * there is nothing to see.
     */
    const ikOn = Boolean(rig) && Boolean(planner.current) && st.swim <= 0.92;
    // Feet stand on the bed, not on the lawn. Without this the body sinks
    // while the feet stay up on the grass, which is the leg folding you see as
    // the feet teleporting into the water.
    if (ikOn && planner.current && legRig.current) {
      // The SAME number that sinks the body, not the bed depth it is chasing.
      // The body follows a lagged blend and the bed is instantaneous, so
      // driving the feet from the bed leaves the two disagreeing by whatever
      // the lag is worth — measured as the leg compressing to 0.222 against a
      // standing 0.47 on the way out.
      // Read the body's ACTUAL height rather than recomputing the sink from
      // swim. Both were derived from the same intent and still disagreed —
      // the body dropped 0.250 while the ground command dropped 0.153, so the
      // leg quietly compressed by 10cm on the way in. One of them has to be
      // the source of truth, and it should be the one you can see.
      planner.current.setGround(
        legRig.current.groundY + (g.position.y - GROUND_Y),
      );
    }
    if (ikOn && st.ikOff && planner.current) {
      planner.current.reset(g.position, st.heading);
    }
    st.ikOff = !ikOn;

    const plan =
      rig && ikOn && planner.current
        ? planner.current.update(
            g.position,
            st.heading,
            speed,
            st.phase,
            // Horizontal reach left over once the leg has spanned the hip height:
            // sqrt(L^2 - h^2), kept at 90% so the knee never locks dead straight
            // (the bend plane is undefined there and the joint can flip).
            Math.sqrt(
              Math.max(
                1e-4,
                (rig.upper + rig.lower) *
                  0.9 *
                  ((rig.upper + rig.lower) * 0.9) -
                  hipHeight * hipHeight,
              ),
            ),
            st.airborne,
            THREE.MathUtils.clamp(st.vy / JUMP_SPEED, -1, 1),
            st.run,
            strideNow,
          )
        : null;

    /**
     * How loaded the legs are, measured off the planted feet.
     *
     * The fore-aft distance from the hip to whichever foot is down, which passes
     * through zero exactly as that foot goes underneath — mid-stance, by
     * definition rather than by a schedule. 1 there, falling to 0 at the ends of
     * the contact and 0 outright while both feet are in the air. The body sinks
     * because a leg is beneath it taking weight and rises as that leg runs out
     * from under it: cause, not coincidence, so it cannot drift out of step with
     * the planner the way an independently-authored wave repeatedly did.
     *
     * NOT a spring integrator, though that was tried and is the textbook model.
     * A spring-loaded inverted pendulum needs an ENERGY SOURCE — real legs do
     * work at push-off — and a spring that only stores and returns has none.
     * Undamped it took the surplus from each imperfectly-matched stance and grew
     * to 1.7 metres of travel with the feet a foot underground; damped enough to
     * be stable, it bled out to 2mm within a second. Getting a limit cycle out of
     * it means adding a push-off impulse tuned against the damping, which is
     * worth doing and is not a small change. This measures the same quantity the
     * spring would have computed, without needing to be kept alive.
     */
    let legLoad = 0;
    if (plan) {
      const fx = Math.sin(st.heading);
      const fz = Math.cos(st.heading);
      const hipW = scratch.hipW;
      if (bones.thighL) bones.thighL.getWorldPosition(hipW);
      else hipW.copy(g.position);
      const half = Math.max(1e-3, strideNow * stanceNow * 0.5);
      for (const f of [plan.L, plan.R]) {
        if (!f.planted) continue;
        const ahead = (f.pos.x - hipW.x) * fx + (f.pos.z - hipW.z) * fz;
        legLoad = Math.max(legLoad, 1 - Math.min(1, Math.abs(ahead) / half));
      }
    }

    // 0..1 over the anticipation window, so the dip eases in rather than
    // snapping to full crouch on the first frame.
    const crouchAmount = st.crouchT > 0 ? 1 - st.crouchT / ANTICIPATION : 0;

    /**
     * The sneak.
     *
     * Held on C, eased so it does not pop, and held through walking so you can
     * creep up on something. Not available afloat; there is nothing to crouch
     * against out there.
     */
    const duckAmount = st.duck * (1 - st.swim);

    /**
     * Where the neck sits RELATIVE to the body, sampled along each bone.
     */
    neckOffsets.current.length = 0;
    if (bones.chest) {
      const { capA, capB, headNow } = scratch;
      for (const cap of NECK_CAPSULES) {
        const a = bones[cap.from];
        const bEnd = bones[cap.to];
        if (!a || !bEnd) continue;
        a.updateWorldMatrix(true, false);
        bEnd.updateWorldMatrix(true, false);
        a.getWorldPosition(capA);
        bEnd.getWorldPosition(capB);
        for (let sIdx = 0; sIdx < cap.samples; sIdx++) {
          const t = cap.samples === 1 ? 0 : sIdx / (cap.samples - 1);
          headNow.lerpVectors(capA, capB, t);
          neckOffsets.current.push({
            dx: headNow.x - g.position.x,
            dz: headNow.z - g.position.z,
            y: headNow.y,
            r: cap.radius,
          });
        }
      }
    }

    /**
     * Grab and release, on the rising edge of E.
     *
     * Nearest to the BILL, not to the body — and only things actually in front
     * of the goose, so backing into a crate does not scoop it up.
     */
    /**
     * Publish the point a carried prop should occupy: ahead of the bill TIP.
     *
     * The beak bone is the base of the bill, tucked back against the head, so
     * anchoring there buries the prop in the neck — and the neck moves, so it
     * grinds through it. Extending along head->beak puts it out in front of
     * the face where a goose would actually hold something.
     */
    if (bones.beak && bones.head && beak?.current) {
      const { headNow, beakNow } = scratch;
      bones.beak.updateWorldMatrix(true, false);
      bones.head.updateWorldMatrix(true, false);
      bones.beak.getWorldPosition(beakNow);
      bones.head.getWorldPosition(headNow);
      beakNow.sub(headNow);
      const len = beakNow.length() || 1;
      beak.current
        .copy(headNow)
        .addScaledVector(beakNow, (len + BILL_LEAD) / len);
      if (beakYaw) beakYaw.current = Math.atan2(beakNow.x, beakNow.z);
      if (beakDir || beakMouth) {
        const lat = scratch.billLat.crossVectors(UP, beakNow);
        const ll = lat.length();
        // Degenerate only if the bird is looking straight up, where there is no
        // lateral axis to tip about and the bone vector is as good as anything.
        const ok = ll > 1e-4;
        if (ok) lat.divideScalar(ll);
        if (beakDir) {
          beakDir.current.copy(beakNow).divideScalar(len);
          if (ok) beakDir.current.applyAxisAngle(lat, BILL_DROP);
        }
        if (beakMouth) {
          const m = scratch.mouthDir.copy(beakNow).divideScalar(len);
          if (ok) m.applyAxisAngle(lat, MOUTH_DROP);
          // From the beak BONE, which is headNow + the delta we just measured.
          beakMouth.current
            .copy(headNow)
            .add(beakNow)
            .addScaledVector(m, MOUTH_SPAN * len);
        }
      }
    }
    /**
     * What the bill is lined up with, recomputed EVERY frame.
     *
     * The same search as before, just no longer buried inside the keypress. It
     * only ever ran on the frame E went down, which is enough to pick something
     * up and useless for telling you that you could — and "which things can I
     * even take" is most of what a player needs to know. Running it continuously
     * is what lets the world answer that before you commit to a button.
     */
    let candidate = -1;
    if (beak?.current && crates?.current?.length && grabbed?.current == null) {
      const bp = beak.current;
      let bestD = GRAB_REACH;
      const fx = Math.sin(st.heading);
      const fz = Math.cos(st.heading);
      // The hip the legs actually hang from, in world space.
      const hipW = scratch.hipW;
      if (bones.thighL) bones.thighL.getWorldPosition(hipW);
      else hipW.copy(g.position);
      crates.current.forEach((c, i) => {
        // hx is 0 for light props (they are not solid) and 0 for whatever is
        // already carried, so size cannot come from the collider. The grab
        // radius is generous enough to cover a light prop's own extent.
        if (c.hx > GRAB_MAX_SIZE) return; // solid and too big for a bill
        const nx = Math.min(Math.max(bp.x, c.x - c.hx), c.x + c.hx);
        const nz = Math.min(Math.max(bp.z, c.z - c.hz), c.z + c.hz);
        const d = Math.hypot(bp.x - nx, bp.z - nz);
        if (d >= bestD) return;
        // Must be roughly where the bill is pointing, not merely nearby.
        const ax = c.x - bp.x;
        const az = c.z - bp.z;
        const alen = Math.hypot(ax, az);
        if (alen > 1e-4 && (ax * fx + az * fz) / alen < GRAB_AIM) return;
        bestD = d;
        candidate = i;
      });
    }
    if (grabHint?.current) {
      const h = grabHint.current;
      h.has = candidate >= 0;
      if (candidate >= 0) {
        const c = crates!.current![candidate];
        h.x = c.x;
        h.y = c.top;
        h.z = c.z;
      }
    }

    const wantGrab = Boolean(k.KeyE);
    if (wantGrab && !st.grabHeld && grabbed) {
      if (grabbed.current !== null) {
        grabbed.current = null;
        onGrab?.(false);
      } else if (candidate >= 0) {
        grabbed.current = candidate;
        onGrab?.(true);
      }
    }
    st.grabHeld = wantGrab;

    /**
     * Settle the rig on the water.
     *
     * The head hangs on the softest joint in the goose and swings about 14 deg
     * on its own — measured on LAND, where it disappears into the waddle and
     * the footfalls. Afloat there is nothing else moving, so the same swing is
     * the only jerky thing on screen and reads as the goose shaking its head.
     * A gliding bird really is steadier than a walking one, so the physics
     * blend eases off rather than the pose being fought with a counter-turn.
     */
    pose.setFlop(1 - st.swim * SWIM_SETTLE);

    pose.reset();
    // Jaw goes through the driver like every other bone.
    //
    // It used to be posed by hand, composing a local-X Euler onto the captured
    // rest quaternion. The bone moved and the numbers looked right, but the
    // bill got LONGER instead of hinging open — local X on this bone runs along
    // the mandible, so "pitch" slid it forward rather than swinging it down.
    // That is the same wrong-axis mistake the driver exists to prevent, and the
    // jaw was the last bone still opting out of it.
    pose.rotate("jaw", st.jaw * JAW_OPEN, 0, 0);
    pose.rotate("beak", -st.jaw * BEAK_LIFT, 0, 0);

    applyWalk(pose, {
      phase: st.phase,
      stance: stanceNow,
      runRoll: tuning?.roll ?? 0.45,
      load: legLoad,
      // Held, the pose shows at full strength with the goose standing still.
      gait: tuning?.hold ? 1 : Math.min(1, speed / SPEED_WALK),
      time: st.time,
      turn: st.turn,
      lag,
      sway,
      leanPitch,
      leanRoll,
      // Crouch is in world units; the root bone lives inside the fit-scaled
      // group, so it has to be converted before it means anything there.
      /**
       * Running ducks the body lower on top of the standing crouch — but only
       * a little, because hip height is leg reach. At 0.05 the run looked
       * right and the feet punched through the lawn on 39% of frames: a
       * shorter leg cannot cover the same stride, and the shortfall comes out
       * as the foot sinking. The duck that reads on screen mostly comes from
       * the neck and body angle, not from the hips dropping.
       */
      // Unit conversion for BOTH crouches lives here: the root bone sits
      // inside the fit-scaled group, so a world distance means nothing there
      // until it is divided through.
      bounce:
        bounce -
          (plan
            ? (CROUCH +
                DUCK_DROP * duckAmount +
                // Buys the horizontal reach the longer running stride needs.
                // Reach for a straight leg is sqrt(L^2 - h^2), so it comes from
                // lowering h and nowhere else — and a crouched posture at speed
                // is what running birds actually adopt.
                (tuning?.crouch ?? 0.05) * st.run) /
              (fit || 1)
            : 0),
      // Afloat there is no ground to solve against, so the IK stands down and
      // the gait drives the legs directly as a paddle.
      legs: !plan || st.swim > 0.92,
      swim: st.swim,
      stroke: st.stroke,
      paddling: st.paddling,
      crouch: crouchAmount,
      airborne: st.airborne,
      airBlend: st.airBlend,
      vertical: THREE.MathUtils.clamp(st.vy / JUMP_SPEED, -1, 1),
      landImpact: st.landed,
      // The run posture only counts once it is actually moving that fast.
      /**
       * Full run, crouch or not. The crouch used to damp this whole input, which
       * fixed a real clash in the wrong place: only the NECK and HEAD terms
       * conflict with the crouch, and killing the run wholesale threw out the
       * forward lean with them, so a crouched sprint ran bolt upright. The split
       * now happens inside applyWalk, where the two poses actually collide.
       */
      run: tuning?.hold ? 1 : st.run * Math.min(1, speed / runSpeed),
      // ...and whatever is left of the shift key at low speed becomes the
      // sneak instead. One key, two poses, and they hand over as the goose
      // speeds up rather than fighting for the same bones.
      duck: duckAmount,
      runHeadTilt: tuning?.headTilt ?? headTilt,
      runNeck: tuning?.neck,
      runBodyPitch: tuning?.bodyPitch,
      runCompress: tuning?.bounce,
      runRock: tuning?.rock,
      headSteady: tuning?.headSteady,
      // The rates the head stabiliser compensates against. Both are derived,
      // never assumed: `speed / strideNow` is steps a second by definition, and
      // the stroke advances in radians so its cycle rate is that over TAU.
      stepHz: speed / Math.max(1e-3, strideNow),
      strokeHz:
        ((water?.stroke ?? STROKE_RATE) * (1 + (SWIM_RUN - 1) * st.run)) /
        (Math.PI * 2),
      // Something in the bill weighs the head down a little.
      carrying:
        grabbed?.current !== null && grabbed?.current !== undefined ? 1 : 0,
    });

    // --- foot IK -------------------------------------------------------------
    if (rig && plan) {
      const { hipW, footW, aim, poleW } = scratch;

      for (const [side, thigh, shin, foot] of [
        ["L", "thighL", "shinL", "footL"],
        ["R", "thighR", "shinR", "footR"],
      ] as const) {
        /**
         * Per leg, because "out" is a different direction for each one.
         *
         * Still stored in the goose's own frame, so it has to be turned to
         * face wherever the goose is facing before it means anything in world.
         */
        poleW
          .copy(rig.pole)
          .addScaledVector(BODY_RIGHT, rig.outward[side] * KNEE_OUT)
          .normalize()
          .applyAxisAngle(UP, st.heading);
        const hipBone = bones[thigh];
        if (!hipBone) continue;
        hipBone.updateWorldMatrix(true, false);
        hipBone.getWorldPosition(hipW);
        footW.copy(plan[side].pos);

        const sol = solveTwoBone(
          hipW,
          footW,
          rig.upper,
          rig.lower,
          poleW,
          ikSolution.current,
        );
        // Opt-in, because this allocates: three arrays per leg per frame is
        // 360 short-lived objects a second handed to the GC for nothing unless
        // someone is actually reading them.
        if (
          process.env.NODE_ENV !== "production" &&
          (window as unknown as Record<string, unknown>).__ikDebug
        ) {
          const dbg = ((window as unknown as Record<string, unknown>).__ik ??=
            {}) as Record<string, unknown>;
          dbg[side] = {
            need: hipW.distanceTo(footW),
            reach: rig.upper + rig.lower,
            stretched: sol.stretched,
            planted: plan[side].planted,
            hip: hipW.toArray(),
            knee: sol.knee.toArray(),
            target: footW.toArray(),
          };
        }
        // Thigh points at the solved knee, shin carries on to the foot.
        pose.aimWorld(thigh, aim.copy(sol.knee).sub(hipW));
        pose.aimWorld(shin, aim.copy(footW).sub(sol.knee));
        /**
         * Foot flat to the ground, and slightly toe-up.
         */
        /**
         * Toes up. NOT level, and not aimed flat either.
         */
        pose.aimWorld(
          foot,
          aim.set(Math.sin(st.heading), 0.4, Math.cos(st.heading)),
        );
      }
    }
    pose.commit(dt);

    /**
     * Dev telemetry, read after commit() so the bones are where they ended up
     * rather than where they were asked to go.
     *
     * Everything about this rig is tuned against measurements — head sweep,
     * stride length, jump reach — and every one of those needs the real numbers
     * out of the running app, not out of a re-simulation that might drift from
     * it. Same guard and same shape as __plan and __legRig above.
     */
    if (process.env.NODE_ENV !== "production") {
      // The live collider list, by reference — crates move, and a test that
      // assumes where they started is testing the wrong geometry.
      (window as unknown as Record<string, unknown>).__solid = solid;
      (window as unknown as Record<string, unknown>).__goose = {
        x: g.position.x,
        y: g.position.y,
        z: g.position.z,
        vx: st.vel.x,
        vz: st.vel.z,
        speed: Math.hypot(st.vel.x, st.vel.z),
        heading: st.heading,
        swim: st.swim,
        run: st.run,
        stroke: st.stroke,
        paddling: st.paddling,
        airborne: st.airborne,
        vy: st.vy,
        phase: st.phase,
        stride: strideNow,
        // The momentum springs. The head stabiliser deliberately does NOT
        // cancel these — they are what makes the neck feel attached to a body
        // with mass — so anything measuring head motion needs them visible to
        // tell momentum apart from a gait wobble.
        lag,
        sway,
        pushMag: st.pushMag,
        // The steering signal. goose-walk feeds it straight into neck and head
        // yaw so the goose looks into a turn — which is right, and makes it a
        // suspect the moment the head yaws while running in a straight line.
        turn: st.turn,
        headingVel: st.headingVel,
        // Where the head actually IS. "The head moves side to side" is a claim
        // about position, and an orientation reading cannot settle it: with the
        // beak pitched up at a run, body roll leaks into any azimuth measured
        // off the head's facing.
        headPos: bones.head
          ? bones.head.getWorldPosition(telemetryV).toArray()
          : null,
        /**
         * World-space head orientation, as a RAW QUATERNION.
         *
         * Not Euler angles. The head sits at roughly 57 degrees of world pitch
         * and swings from there, which is close enough to the YXZ singularity
         * that the decomposition flips: a first pass at this reported 95
         * degrees of head roll during a run, for a head that physically cannot
         * roll past its 175-degree joint limit, let alone do it twice a second.
         * Whoever consumes this should compare quaternions directly — the angle
         * between two of them is well defined everywhere, and Euler is not.
         */
        headQ: bones.head
          ? bones.head.getWorldQuaternion(telemetryQ).toArray()
          : null,
      };
    }

    onMove?.(g.position, st.heading);

    // Report the beak's angle a few times a second, so the tilt slider can show
    // degrees rather than an abstract coefficient. Throttled because this is a
    // React state update and the frame loop is not.
    if (onBeakAngle && bones.head && bones.beak) {
      st.beakTick += dt;
      if (st.beakTick > 0.15) {
        st.beakTick = 0;
        const { headNow, beakNow, capA } = scratch;
        bones.head.getWorldPosition(headNow);
        bones.beak.getWorldPosition(beakNow);
        const dy = beakNow.y - headNow.y;
        const flat = Math.hypot(beakNow.x - headNow.x, beakNow.z - headNow.z);
        const hips = bones.hips;
        let ahead = 0;
        let above = 0;
        if (hips) {
          hips.getWorldPosition(capA);
          ahead = Math.hypot(headNow.x - capA.x, headNow.z - capA.z);
          above = headNow.y - capA.y;
        }
        // Anything sitting on its stop is ignoring further input from the
        // sliders, which is worth saying out loud.
        const clamped: string[] = [];
        for (const n of [
          "neck1",
          "neck2",
          "neck3",
          "neck4",
          "head",
          "spine",
          "chest",
        ]) {
          const lim = GOOSE_LIMITS[n];
          if (lim && pose.restDeviation(n) > lim * 0.97) clamped.push(n);
        }
        if (flat > 1e-5) {
          onBeakAngle(
            (Math.atan2(dy, flat) * 180) / Math.PI,
            ahead,
            above,
            clamped,
            planner.current?.takeDrag() ?? 0,
          );
        }
      }
    }

    if (process.env.NODE_ENV !== "production") {
      const w = window as unknown as Record<string, number[]>;
      (w.__cost ??= []).push(performance.now() - t0);
      if (w.__cost.length > 400) w.__cost.shift();
    }
  });

  return (
    <group ref={group}>
      <group scale={fit}>
        <primitive object={root} />
      </group>
    </group>
  );
}

useGLTF.preload(SRC, DRACO);
