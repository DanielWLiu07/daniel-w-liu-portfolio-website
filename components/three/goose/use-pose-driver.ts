"use client";

/**
 * Pose bones by name, in world-oriented terms.
 */
import { useMemo, useRef } from "react";
import * as THREE from "three";

export interface BoneAxes {
  rest: THREE.Quaternion;
  /** World orientation in the REST pose. The reference frame world aiming needs. */
  restWorld: THREE.Quaternion;
  /**
   * Unit vector, in the bone's own frame, pointing at its child.
   */
  aimAxis: THREE.Vector3;
  up: THREE.Vector3;
  right: THREE.Vector3;
  forward: THREE.Vector3;
}

/**
 * Spring stiffness per bone. Low = floppy, high = rigid.
 */
export type Softness = Record<string, number>;

/**
 * Names as the glTF exporter leaves them: Blender's `thigh.L` arrives as
 * `thighL`. A name that does not resolve fails silently — see assertBones.
 */
export const GOOSE_SOFTNESS: Softness = {
  // The neck is the comedy. Loose enough to whip and wobble a beat behind.
  /**
   * Deliberately floppy. Stiffening the neck to steady the head made it worse
   * (0.018 to 0.024): soft amplifies body motion, rigid transmits it.
   */
  neck1: 120,
  neck2: 95,
  neck3: 75,
  neck4: 60,
  head: 45,
  jaw: 200,
  beak: 200,
  // Body carries weight: firmer, but still lagging enough to feel like mass.
  // Hip roll is the primary read of the whole gait, and it is driven at stride
  // frequency like the legs, so it needs the same treatment: at k=220 it was
  // reaching 45% of its asked-for roll and the waddle was half strength.
  hips: 850,
  spine: 380,
  chest: 320,
  root: 260,
  // Was 42, which was too soft to track its own target: the bone lagged so far
  // behind that the error stayed large, pumped in energy every frame and sent
  // it over the top. Stiff enough to follow, loose enough to overshoot.
  tail: 95,
  wingL: 70,
  wingR: 70,
  /**
   * Legs are stiff because of FREQUENCY, not taste.
   */
  thighL: 60000,
  shinL: 60000,
  footL: 45000,
  thighR: 60000,
  shinR: 60000,
  footR: 45000,
};

/**
 * Damping ratio per bone. 1 = critical (never overshoots), <1 = rings.
 */
export type Damping = Record<string, number>;

export const GOOSE_DAMPING: Damping = {
  // Floppier the further from the body — the tip of the neck is the punchline.
  // Nearer critical than before: a ringing neck re-introduces exactly the
  // oscillation the stabiliser exists to remove. Still under 1, so a hard stop
  // still shows a little follow-through.
  neck1: 0.52,
  neck2: 0.44,
  neck3: 0.36,
  neck4: 0.28,
  head: 0.32,
  // 0.42 still overshoots about 23%, which is plenty of flop. At 0.22 it rang
  // for over three seconds after the goose had stopped.
  tail: 0.42,
  wingL: 0.35,
  wingR: 0.35,
  // The body wobbles, but it is carrying the weight, so less.
  hips: 0.62,
  spine: 0.55,
  chest: 0.5,
  root: 0.85,
  // Jaw and legs stay crisp: a ringing jaw reads as chewing, a ringing leg as a
  // rigging bug.
  jaw: 0.9,
  beak: 0.9,
  thighL: 0.9,
  shinL: 0.9,
  footL: 0.85,
  thighR: 0.9,
  shinR: 0.9,
  footR: 0.85,
};

/**
 * Hard stop on deviation from rest, in degrees.
 */
export type Limits = Record<string, number>;

export const GOOSE_LIMITS: Limits = {
  /**
   * Wide, because these are driven by hand from the tuning panel.
   *
   * A limit that fires mid-drag looks exactly like the slider not working: the
   * number changes, the picture does not, and nothing says why. The head in
   * particular spends most of its budget just cancelling the straightened neck
   * it sits on, so the limit has to cover cancellation PLUS the tilt wanted.
   */
  neck1: 150,
  neck2: 150,
  neck3: 155,
  neck4: 155,
  head: 175,
  jaw: 65,
  beak: 30,
  tail: 32,
  hips: 55,
  spine: 70,
  chest: 70,
  root: 22,
  wingL: 45,
  wingR: 45,
  /**
   * Generous: IK bounds these anyway, and this rig RESTS with a straight leg but
   * walks with one bent to ~103 degrees, so large deviation is normal here.
   */
  thighL: 165,
  shinL: 170,
  footL: 130,
  thighR: 165,
  shinR: 170,
  footR: 130,
};

/** Anything unlisted still gets a stop; an unbounded bone is a future bug. */
const DEFAULT_LIMIT = 40;

/**
 * How far each bone droops when limp, in DEGREES.
 */
export type Heaviness = Record<string, number>;

export const GOOSE_SAG_DEGREES: Heaviness = {
  // Degrees of droop below the keyframe when fully limp. Grows down the chain:
  // the head is the weight everything else is holding up.
  // Much less gravity sag: the head's weight pulling the neck around is one of
  // the things that was moving it. Some remains, or it reads as a mannequin.
  neck1: 3,
  neck2: 4,
  neck3: 5,
  neck4: 6,
  head: 7,
  tail: 8,
  wingL: 6,
  wingR: 6,
  jaw: 2,
  beak: 1,
  // The torso barely gives. Letting it sag makes the goose look ill.
  hips: 0.8,
  spine: 1.2,
  chest: 1.5,
  root: 0,
  // Load-bearing. Weight on a supporting limb reads as a collapse.
  thighL: 0.6,
  shinL: 0.6,
  footL: 1,
  thighR: 0.6,
  shinR: 0.6,
  footR: 1,
};

/** Gravity, world units per second squared. */
const GRAVITY = -9.81;

/**
 * Warn about bones that were asked for but not found.
 */
export function assertBones(
  bones: Record<string, THREE.Object3D | undefined>,
  skeletonRoot?: THREE.Object3D,
): void {
  if (process.env.NODE_ENV === "production") return;
  const missing = Object.entries(bones)
    .filter(([, b]) => !b)
    .map(([n]) => n);
  if (!missing.length) return;
  const available: string[] = [];
  skeletonRoot?.traverse((o) => {
    if ((o as THREE.Bone).isBone) available.push(o.name);
  });
  console.warn(
    `[goose] ${missing.length} bone(s) not found: ${missing.join(", ")}\n` +
      `these will silently not animate. skeleton has: ${available.join(", ") || "(none)"}`,
  );
}

export interface PoseDriver {
  /** Restore every bone to its rest pose. Call once at the top of a frame. */
  reset(): void;
  /**
   * Ease every bone toward the pose built this frame. Call once at the END.
   * Without this the targets are written straight to the bones and the rig is
   * as stiff as it was before.
   */
  commit(dt: number): void;
  /**
   * Compose a rotation onto a bone, in WORLD-oriented terms.
   * pitch = nose down/up, yaw = turn left/right, roll = tilt.
   */
  rotate(name: string, pitch: number, yaw: number, roll?: number): void;
  /** Offset a bone from its rest POSITION, in the parent's units. */
  translate(name: string, x: number, y: number, z: number): void;
  has(name: string): boolean;
  /**
   * Degrees between rest and what the bone is being ASKED for. Tuning only.
   */
  targetDeviation(name: string): number;
  /**
   * Degrees between rest and where the bone actually IS. The ratio against
   * targetDeviation says whether a bone is tracking, flopping or running away.
   */
  restDeviation(name: string): number;
  debugAim(name: string): { aimAxis: number[]; restAimWorld: number[] } | null;
  /**
   * Point a bone's axis along a world direction, REPLACING its target.
   */
  aimWorld(name: string, dir: THREE.Vector3): void;
  /** 0 = pure keyframe, 1 = full physics. Blends the whole rig. */
  setFlop(amount: number): void;
  flopAmount(): number;
}

export function usePoseDriver(
  bones: Record<string, THREE.Object3D | undefined>,
  softness: Softness = GOOSE_SOFTNESS,
  damping: Damping = GOOSE_DAMPING,
  limits: Limits = GOOSE_LIMITS,
  heaviness: Heaviness = GOOSE_SAG_DEGREES,
): PoseDriver {
  const axes = useRef(new Map<string, BoneAxes>());
  const restPos = useRef(new Map<string, THREE.Vector3>());
  /** Where each bone is being ASKED to go this frame. */
  const target = useRef(new Map<string, THREE.Quaternion>());
  /** Angular velocity per bone, in its own local frame. Drives the overshoot. */
  const angVel = useRef(new Map<string, THREE.Vector3>());
  /** World position last frame, per bone. Finite-differenced into velocity. */
  const prevWorld = useRef(new Map<string, THREE.Vector3>());
  /** World velocity last frame, per bone. Differenced again into acceleration. */
  const prevVel = useRef(new Map<string, THREE.Vector3>());
  /** Joint-to-centre-of-mass arm, in REST pose, in the bone's local frame. */
  const comArm = useRef(new Map<string, THREE.Vector3>());
  /** Solved physics gain per bone — see GOOSE_SAG_DEGREES for the derivation. */
  const physGain = useRef(new Map<string, number>());
  /** Angular acceleration from gravity + inertia, local frame, this frame. */
  const physAccel = useRef(new Map<string, THREE.Vector3>());
  /**
   * Global 0..1 scale on the physics. One dial from "puppet" to "dead weight",
   * which is what makes this an ACTIVE ragdoll rather than a ragdoll: the same
   * rig covers a goose walking about and a goose that has been knocked over,
   * and it can be driven per-frame to blend between them.
   */
  const flop = useRef(1);

  // Re-derive whenever the set of bones changes identity, not every render.
  const key = Object.entries(bones)
    .map(([n, b]) => `${n}:${b?.uuid ?? "-"}`)
    .join(",");
  const capturedFor = useRef<string | null>(null);

  /**
   * Capture lazily inside the frame loop, never in a useMemo.
   */
  const capture = () => {
    if (capturedFor.current === key) return;
    const nextAxes = new Map<string, BoneAxes>();
    const nextPos = new Map<string, THREE.Vector3>();
    const nextArm = new Map<string, THREE.Vector3>();
    const nextGain = new Map<string, number>();
    const inv = new THREE.Quaternion();
    let ready = true;
    for (const [name, bone] of Object.entries(bones)) {
      if (!bone) continue;
      // Force the chain up to the root to be current before reading it.
      bone.updateWorldMatrix(true, false);
      bone.getWorldQuaternion(inv);
      if (!Number.isFinite(inv.x) || inv.lengthSq() < 1e-8) {
        ready = false;
        break;
      }
      inv.invert();
      nextAxes.set(name, {
        rest: bone.quaternion.clone(),
        restWorld: inv.clone().invert(),
        aimAxis: new THREE.Vector3(0, 1, 0),
        up: new THREE.Vector3(0, 1, 0).applyQuaternion(inv).normalize(),
        right: new THREE.Vector3(1, 0, 0).applyQuaternion(inv).normalize(),
        forward: new THREE.Vector3(0, 0, 1).applyQuaternion(inv).normalize(),
      });
      nextPos.set(name, bone.position.clone());

      /**
       * Joint-to-centre-of-mass arm, in the REST pose, kept in the bone's local
       * frame so it rotates with the bone. Half way to the first child is close
       * enough; leaves borrow their offset from the parent.
       */
      const childBone = bone.children.find((c) => (c as THREE.Bone).isBone);
      const arm = new THREE.Vector3();
      if (childBone) {
        childBone.updateWorldMatrix(true, false);
        const here = new THREE.Vector3();
        const there = new THREE.Vector3();
        bone.getWorldPosition(here);
        childBone.getWorldPosition(there);
        arm.copy(there).sub(here).multiplyScalar(0.5);
        // World -> local. `inv` is already the inverted world quaternion.
        arm.applyQuaternion(inv);
      } else {
        // Local +Y runs along the bone on this rig, so the arm points that way.
        arm.set(0, Math.max(1e-3, bone.position.length()) * 0.5, 0);
      }
      nextArm.set(name, arm);
      // The arm points from the joint toward the child, so once normalised it
      // IS this bone's aim axis, in the bone's own frame. One measurement, two
      // uses: the pendulum lever and the direction the bone considers forward.
      const entry = nextAxes.get(name);
      if (entry && arm.lengthSq() > 1e-12) entry.aimAxis.copy(arm).normalize();

      // Solve the gain that turns raw pendulum physics into the sag actually
      // asked for: gain = k * sag * |r| / |g|.
      const armLen = Math.max(1e-4, arm.length());
      const sagRad = ((heaviness[name] ?? 0) * Math.PI) / 180;
      const k = softness[name] ?? 200;
      nextGain.set(
        name,
        Math.min(1, (k * sagRad * armLen) / Math.abs(GRAVITY)),
      );
    }
    if (!ready) return;
    axes.current = nextAxes;
    restPos.current = nextPos;
    comArm.current = nextArm;
    physGain.current = nextGain;
    capturedFor.current = key;
  };

  return useMemo(() => {
    const q = new THREE.Quaternion();
    const tmp = new THREE.Quaternion();
    const aimTo = new THREE.Vector3();
    const aimFrom = new THREE.Vector3();
    const aimDelta = new THREE.Quaternion();
    const aimParent = new THREE.Quaternion();

    return {
      has: (name) => Boolean(bones[name]),

      reset() {
        capture();
        for (const [name, bone] of Object.entries(bones)) {
          if (!bone) continue;
          const a = axes.current.get(name);
          // The TARGET resets to rest; the bone itself is left where the spring
          // put it last frame, which is what carries momentum across frames.
          if (a) {
            let t = target.current.get(name);
            if (!t) {
              t = new THREE.Quaternion();
              target.current.set(name, t);
            }
            t.copy(a.rest);
          }
          const p = restPos.current.get(name);
          if (p) bone.position.copy(p);
        }
      },

      commit(dt) {
        if (!(dt > 0) || !Number.isFinite(dt)) return;

        // --- gravity and inertia, once per frame ----------------------------
        // Not per sub-step: these come from finite differences of world
        // position, which only change once per frame anyway. Recomputing them
        // eight times would cost eight times as much and change nothing.
        {
          const wp = new THREE.Vector3();
          const vel = new THREE.Vector3();
          const acc = new THREE.Vector3();
          const armW = new THREE.Vector3();
          const drive = new THREE.Vector3();
          const alpha = new THREE.Vector3();
          const wq = new THREE.Quaternion();

          for (const [name, bone] of Object.entries(bones)) {
            if (!bone) continue;
            const arm = comArm.current.get(name);
            if (!arm) continue;
            const weight = (physGain.current.get(name) ?? 0) * flop.current;
            let a = physAccel.current.get(name);
            if (!a) {
              a = new THREE.Vector3();
              physAccel.current.set(name, a);
            }
            if (weight <= 0) {
              a.set(0, 0, 0);
              continue;
            }

            // Matrices are one frame stale here, which is exactly what a finite
            // difference wants — and it avoids a full world-matrix rebuild
            // mid-frame just to measure where things were.
            bone.getWorldPosition(wp);
            bone.getWorldQuaternion(wq);

            const last = prevWorld.current.get(name);
            const lastV = prevVel.current.get(name);
            if (!last) {
              prevWorld.current.set(name, wp.clone());
              prevVel.current.set(name, new THREE.Vector3());
              a.set(0, 0, 0);
              continue;
            }
            vel.copy(wp).sub(last).divideScalar(dt);
            if (lastV) acc.copy(vel).sub(lastV).divideScalar(dt);
            else acc.set(0, 0, 0);
            last.copy(wp);
            lastV?.copy(vel);

            // A teleport, a tab regaining focus or a single stalled frame all
            // produce an acceleration spike of essentially unbounded size. The
            // joint limits would catch the result, but the bone would visibly
            // snap to its stop first, so cap the cause rather than the symptom.
            const mag = acc.length();
            if (!Number.isFinite(mag)) acc.set(0, 0, 0);
            else if (mag > 60) acc.multiplyScalar(60 / mag);

            // alpha = (r x (g - a)) / |r|^2, in world space.
            armW.copy(arm).applyQuaternion(wq);
            const armLenSq = armW.lengthSq();
            if (armLenSq < 1e-8) {
              a.set(0, 0, 0);
              continue;
            }
            drive.set(-acc.x, GRAVITY - acc.y, -acc.z);
            alpha.copy(armW).cross(drive).divideScalar(armLenSq);
            // Into the bone's own frame, because that is where w lives.
            alpha.applyQuaternion(wq.invert());
            alpha.multiplyScalar(weight);
            if (!Number.isFinite(alpha.x + alpha.y + alpha.z))
              alpha.set(0, 0, 0);
            a.copy(alpha);
          }
        }

        const err = new THREE.Quaternion();
        const axis = new THREE.Vector3();
        const spin = new THREE.Quaternion();
        const clamped = new THREE.Quaternion();

        /**
         * Sub-step at 240 Hz so stiffness and frame rate stay independent.
         */
        // 240 Hz. The legs run at k=20000 (natural frequency 141 rad/s) to keep
        // up with the IK, and semi-implicit Euler needs h*omega < 2 to stay
        // stable — 120 Hz left only a 1.7x margin, which is not enough headroom
        // for a stiffness anyone might raise later. Doubling the rate costs
        // eighty cheap iterations a frame and buys a 3.4x margin.
        const steps = Math.max(1, Math.min(16, Math.ceil(dt * 240)));
        const h = dt / steps;

        for (let s = 0; s < steps; s++)
          for (const [name, bone] of Object.entries(bones)) {
            if (!bone) continue;
            const t = target.current.get(name);
            if (!t) continue;

            const k = softness[name] ?? 200;
            // c = 2*zeta*sqrt(k). zeta below 1 is what lets the bone swing PAST
            // the pose and ring back, which is the whole point of the exercise.
            const c = 2 * (damping[name] ?? 0.8) * Math.sqrt(k);

            let w = angVel.current.get(name);
            if (!w) {
              w = new THREE.Vector3();
              angVel.current.set(name, w);
            }

            // Rotation from where the bone IS to where it is asked to be,
            // expressed as an axis-angle error — the P term of the controller.
            //
            // multiply, NOT premultiply. This has to match how the correction is
            // applied further down. `bone.quaternion.multiply(spin)` composes in
            // the bone's LOCAL frame, so the error must be the local one,
            // q^-1 * t. premultiply gives t * q^-1, the error in the PARENT
            // frame, and mixing the two means every correction is applied about
            // the wrong axis.
            //
            // It looks harmless because bones whose rest rotation is near
            // identity behave either way — the two frames coincide. Bones with a
            // large rest rotation do not: on this rig the tail, wings and hips
            // spiralled outward until they hit their joint stops and parked
            // there, while the neck and spine tracked perfectly. A bug that only
            // touches some bones reads as bad tuning on those bones, which is
            // where the time goes.
            err.copy(bone.quaternion).invert().multiply(t);
            if (err.w < 0) err.set(-err.x, -err.y, -err.z, -err.w); // short way round
            const sinHalf = Math.sqrt(Math.max(0, 1 - err.w * err.w));
            const angle = 2 * Math.atan2(sinHalf, err.w);
            if (sinHalf > 1e-6) {
              axis.set(err.x, err.y, err.z).multiplyScalar(1 / sinHalf);
            } else {
              axis.set(0, 0, 0);
            }

            w.addScaledVector(axis, angle * k * h);
            // Physics pushes, muscle pulls back. The bone's resting place is
            // wherever those two balance, which is why a heavy head settles
            // slightly below its keyframe instead of exactly on it.
            const pa = physAccel.current.get(name);
            if (pa) w.addScaledVector(pa, h);
            // Exponential decay rather than (1 - c*dt). The linear form goes
            // NEGATIVE once c*dt > 1 — it flips the velocity instead of damping
            // it — and the old code papered over that with a max(0, ...) that
            // silently killed all momentum on a slow frame. exp() is correct for
            // every dt and costs nothing here.
            w.multiplyScalar(Math.exp(-c * h));
            if (!Number.isFinite(w.x + w.y + w.z)) w.set(0, 0, 0);

            const step = w.length() * h;
            if (step > 1e-7) {
              spin.setFromAxisAngle(axis.copy(w).normalize(), step);
              bone.quaternion.multiply(spin).normalize();
            }

            // --- joint stop ---------------------------------------------------
            // Applied to the RESULT rather than to the velocity, so no amount of
            // accumulated momentum can carry a bone past its range even on a
            // stalled frame.
            const a = axes.current.get(name);
            if (!a) continue;
            const limit = ((limits[name] ?? DEFAULT_LIMIT) * Math.PI) / 180;
            const dot = Math.min(1, Math.abs(a.rest.dot(bone.quaternion)));
            const dev = 2 * Math.acos(dot);
            if (dev > limit && dev > 1e-6) {
              // Snapshot BEFORE touching bone.quaternion. Writing this as
              // `bone.quaternion.copy(rest).slerp(clamped.copy(bone.quaternion))`
              // reads fine and is wrong: the receiver is evaluated before the
              // argument, so copy() has already overwritten the pose that the
              // argument then reads. Every clamped bone snapped to rest, kept its
              // momentum, swung straight back out and flickered against the stop.
              clamped.copy(bone.quaternion);
              // Pull back along the arc from rest, which keeps the direction of
              // the swing and only removes the excess.
              bone.quaternion
                .copy(a.rest)
                .slerp(clamped, limit / dev)
                .normalize();
              // Bleed most of the momentum, as hitting a stop would. Not all of
              // it: a fully inelastic stop makes the bone stick to its limit and
              // look jammed rather than caught.
              w.multiplyScalar(-0.15);
            }
          }
      },

      rotate(name, pitch, yaw, roll = 0) {
        const a = axes.current.get(name);
        const t = target.current.get(name);
        if (!a || !t) return;
        if (!Number.isFinite(pitch + yaw + roll)) return;
        // Applied about the bone-local images of the WORLD axes, so the caller
        // never has to know how this particular bone was oriented.
        q.setFromAxisAngle(a.right, pitch);
        if (yaw) q.multiply(tmp.setFromAxisAngle(a.up, yaw));
        if (roll) q.multiply(tmp.setFromAxisAngle(a.forward, roll));
        // Builds the TARGET. commit() is what moves the bone toward it.
        t.multiply(q);
      },

      targetDeviation(name) {
        const a = axes.current.get(name);
        const t = target.current.get(name);
        if (!a || !t) return 0;
        const d = Math.min(1, Math.abs(a.rest.dot(t)));
        return (2 * Math.acos(d) * 180) / Math.PI;
      },

      debugAim(name) {
        const a = axes.current.get(name);
        const bone = bones[name];
        if (!a || !bone) return null;
        const f = new THREE.Vector3()
          .copy(a.aimAxis)
          .applyQuaternion(a.restWorld);
        return { aimAxis: a.aimAxis.toArray(), restAimWorld: f.toArray() };
      },

      aimWorld(name, dir) {
        const a = axes.current.get(name);
        const t = target.current.get(name);
        const bone = bones[name];
        if (!a || !t || !bone || !bone.parent) return;
        if (!Number.isFinite(dir.x + dir.y + dir.z) || dir.lengthSq() < 1e-10)
          return;

        /**
         * Solved entirely in the PARENT's frame — never mix frames here.
         */
        bone.parent.getWorldQuaternion(aimParent);
        aimTo.copy(dir).applyQuaternion(aimParent.invert()).normalize();
        // Where this bone's axis points, in the parent's frame, when at rest.
        aimFrom.copy(a.aimAxis).applyQuaternion(a.rest).normalize();
        // Minimal rotation carrying one to the other. Roll about the bone stays
        // whatever the rest pose had, which is what you want for a limb: the
        // solve decides where it points, not how it is twisted.
        aimDelta.setFromUnitVectors(aimFrom, aimTo);
        t.copy(aimDelta).multiply(a.rest);
        if (!Number.isFinite(t.x + t.y + t.z + t.w)) t.copy(a.rest);
      },

      setFlop(amount) {
        if (!Number.isFinite(amount)) return;
        flop.current = Math.max(0, Math.min(1, amount));
      },

      flopAmount: () => flop.current,

      restDeviation(name) {
        const a = axes.current.get(name);
        const bone = bones[name];
        if (!a || !bone) return 0;
        const d = Math.min(1, Math.abs(a.rest.dot(bone.quaternion)));
        return (2 * Math.acos(d) * 180) / Math.PI;
      },

      translate(name, x, y, z) {
        const bone = bones[name];
        const p = restPos.current.get(name);
        if (!bone || !p) return;
        bone.position.set(p.x + x, p.y + y, p.z + z);
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
