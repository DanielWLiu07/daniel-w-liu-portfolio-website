"use client";

/**
 * The goose you can drive. WASD, or click the ground to send it somewhere.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { GraphNode } from "blender-to-threejs";

import { COLLIDERS, LAWN_HALF, type Collider } from "../environment";
import {
  GOOSE_RADIUS,
  penetration,
  resolveCollisions,
  NECK_CAPSULES,
  type Resolved,
} from "./collide";
import { FootPlanner, solveTwoBone, type TwoBoneSolution } from "./foot-ik";
import { applyWalk, Spring } from "./goose-walk";
import { gooseMaterial } from "./goose-shading";
import { assertBones, usePoseDriver } from "./use-pose-driver";

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
const SPEED_RUN = 1.45;

/** Everything about the run that is worth tuning against the picture. */
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
  neck: number[];
}

export const RUN_DEFAULTS: RunTuning = {
  hold: false,
  speed: SPEED_RUN,
  headTilt: 2.0,
  bodyPitch: 0.46,
  neck: [0.45, 0.34, 0.1, 0.04],
};
const ACCEL = 9;
const DRAG = 7;
/** Heading spring. Damping below 1 is what lets a hard turn overshoot. */
const TURN_STIFFNESS = 46;
const TURN_DAMPING = 0.62;
/** Stop this far from a clicked target, so it does not jitter on arrival. */
const ARRIVE = 0.22;
/**
 * How far the jaw drops on a honk, radians. Deliberately small.
 */
const JAW_OPEN = 0.22;
/**
 * How far to lower the body, in WORLD units, so the legs are bent enough to
 * step.
 */
const CROUCH = 0.008;
/**
 * Lengthen the leg bones at load.
 */
const LEG_STRETCH = 1.28;
/**
 * Jump. Height is chosen first and the launch speed derived from it, because
 * "how high does it get" is the thing anyone actually has an opinion about;
 * an initial velocity is a number you tune blind until the arc looks right.
 *   v = sqrt(2 * g * h)
 */
// Clears the 0.7 hedges and the 0.6 wall with margin. At 0.62 the goose
// topped out below every one of them, so height-aware collision made no
// visible difference — it was still stopped, just for the right reason.
const JUMP_HEIGHT = 0.95;
const JUMP_GRAVITY = 11.5;
const JUMP_SPEED = Math.sqrt(2 * JUMP_GRAVITY * JUMP_HEIGHT);
/**
 * Anticipation before the push, in seconds.
 */
const ANTICIPATION = 0.07;
/** Ground level for the body. The lawn is flat, so this is a constant. */
const GROUND_Y = 0;

/** Shared world up. Allocated once; this is read every frame. */
const UP = new THREE.Vector3(0, 1, 0);

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
  /** Run head-tilt coefficient. See WalkInput.runHeadTilt. */
  headTilt?: number;
  /** Live pose readout, throttled: beak angle plus where the head sits. */
  onBeakAngle?: (deg: number, ahead: number, above: number) => void;
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
    /** Seconds since the beak angle was last reported. */
    beakTick: 0,
  });

  /**
   * Leg geometry, measured off the rig rather than typed in.
   */
  const legRig = useRef<{
    upper: number;
    lower: number;
    pole: THREE.Vector3;
    groundY: number;
  } | null>(null);

  const planner = useRef<FootPlanner | null>(null);
  const hitResult = useRef<Resolved>({ x: 0, z: 0, hit: false });
  const headPush = useRef({ x: 0, z: 0 });
  const solidScratch = useRef<Collider[]>([]);
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
  }, [bones, pose]);

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
    const wantRun = Boolean(k.ShiftLeft || k.ShiftRight);
    st.run += ((wantRun ? 1 : 0) - st.run) * Math.min(1, 6 * dt);
    const runSpeed = tuning?.speed ?? SPEED_RUN;
    const speedNow = SPEED_WALK + (runSpeed - SPEED_WALK) * st.run;

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
    const rate = want.lengthSq() > 0 ? ACCEL : DRAG;
    st.vel.x += (want.x - st.vel.x) * Math.min(1, rate * dt);
    st.vel.z += (want.z - st.vel.z) * Math.min(1, rate * dt);

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

    const speed = Math.hypot(st.vel.x, st.vel.z);
    if (speed > 1e-3) {
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
       * Static scenery PLUS whatever crates are currently in the way.
       */
      const solid = crates?.current?.length
        ? ((solidScratch.current.length = 0),
          solidScratch.current.push(...COLLIDERS, ...crates.current),
          solidScratch.current)
        : COLLIDERS;
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
        );
        if (r0.hit) corrected = true;
        px = r0.x;
        pz = r0.z;
        for (const o of neckOffsets.current) {
          if (!penetration(px + o.dx, pz + o.dz, o.r, solid, headPush.current))
            continue;
          corrected = true;
          px += headPush.current.x;
          pz += headPush.current.z;
        }
      }
      const r = { x: px, z: pz, hit: corrected };
      if (r.hit) {
        const pushX = r.x - wantX;
        const pushZ = r.z - wantZ;
        g.position.x = r.x;
        g.position.z = r.z;
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
      st.distance += Math.hypot(g.position.x - fromX, g.position.z - fromZ);

      // Turn toward travel, by the SHORT way round — without the wrap the goose
      // spins the long way whenever the heading crosses +/-PI.
      const wanted = Math.atan2(st.vel.x, st.vel.z);
      let diff = wanted - st.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      // Spring the heading rather than lerping it. A lerp can only ease IN to
      // the new direction; a spring carries angular momentum, so a sharp change
      // of direction swings a few degrees past and comes back. That tiny
      // overshoot is most of what makes the turn look like a body pivoting
      // rather than a transform being interpolated.
      const c = 2 * TURN_DAMPING * Math.sqrt(TURN_STIFFNESS);
      st.headingVel += diff * TURN_STIFFNESS * dt;
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
    const wantJump = Boolean(k.Space);
    if (wantJump && !st.jumpHeld && !st.airborne && st.crouchT <= 0) {
      // Crouch first, launch when it finishes.
      st.crouchT = ANTICIPATION;
    }
    st.jumpHeld = wantJump;

    if (st.crouchT > 0) {
      st.crouchT -= dt;
      if (st.crouchT <= 0) {
        st.crouchT = 0;
        st.vy = JUMP_SPEED;
        st.airborne = true;
      }
    }

    if (st.airborne) {
      st.vy -= JUMP_GRAVITY * dt;
      g.position.y += st.vy * dt;
      if (g.position.y <= GROUND_Y) {
        // Land. Convert whatever downward speed is left into a squash, so a
        // longer fall hits harder — the impact reads as weight rather than as
        // a fixed canned bounce.
        g.position.y = GROUND_Y;
        st.landed = Math.min(1, Math.abs(st.vy) / JUMP_SPEED);
        st.vy = 0;
        st.airborne = false;
      }
    } else {
      g.position.y = GROUND_Y;
      st.landed *= Math.exp(-9 * dt);
    }

    // Honk: fast open, slower close. A symmetric oscillation reads as chewing.
    const wantJaw = honk ? 1 : 0;
    st.jaw += (wantJaw - st.jaw) * Math.min(1, (honk ? 22 : 9) * dt);

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
        legRig.current = { upper, lower, pole, groundY: plantY };
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
    const rig = legRig.current;
    // Live hip height above the ground, so reach accounts for the crouch, the
    // bob and any lean rather than assuming the rest pose.
    let hipHeight = 0.16;
    if (rig && bones.thighL) {
      bones.thighL.updateWorldMatrix(true, false);
      hipHeight = Math.max(
        0.02,
        bones.thighL.getWorldPosition(scratch.hipW).y - rig.groundY,
      );
    }
    const plan =
      rig && planner.current
        ? planner.current.update(
            g.position,
            st.heading,
            speed,
            st.distance,
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
          )
        : null;

    // 0..1 over the anticipation window, so the dip eases in rather than
    // snapping to full crouch on the first frame.
    const crouchAmount = st.crouchT > 0 ? 1 - st.crouchT / ANTICIPATION : 0;

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

    applyWalk(pose, {
      distance: st.distance,
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
      bounce: bounce - (plan ? CROUCH / (fit || 1) : 0),
      legs: !plan,
      crouch: crouchAmount,
      airborne: st.airborne,
      vertical: THREE.MathUtils.clamp(st.vy / JUMP_SPEED, -1, 1),
      landImpact: st.landed,
      // Only counts as running if it is actually moving that fast — holding
      // shift while stationary should not restyle a standing goose.
      run: tuning?.hold ? 1 : st.run * Math.min(1, speed / runSpeed),
      runHeadTilt: tuning?.headTilt ?? headTilt,
      runNeck: tuning?.neck,
      runBodyPitch: tuning?.bodyPitch,
      honk: st.jaw,
    });

    // --- foot IK -------------------------------------------------------------
    if (rig && plan) {
      const { hipW, footW, aim, poleW } = scratch;
      // The pole is stored in the goose's own frame, so it has to be turned to
      // face wherever the goose is facing before it means anything in world.
      poleW.copy(rig.pole).applyAxisAngle(UP, st.heading);

      for (const [side, thigh, shin, foot] of [
        ["L", "thighL", "shinL", "footL"],
        ["R", "thighR", "shinR", "footR"],
      ] as const) {
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
        if (flat > 1e-5) onBeakAngle((Math.atan2(dy, flat) * 180) / Math.PI, ahead, above);
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
