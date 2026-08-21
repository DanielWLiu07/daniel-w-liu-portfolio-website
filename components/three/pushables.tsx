"use client";

/**
 * Crates the goose can shove around.
 */
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { compileMaterial, graph } from "blender-to-threejs";

import type { Collider } from "./environment";

export interface Pushable {
  position: [number, number, number];
  /** Half-extent of the box. */
  size: number;
  rotation?: number;
  color?: [number, number, number];
}

interface Body {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** Vertical velocity. Only non-zero while a dropped prop is falling. */
  vy: number;
  /** Unit vector from the grip point down to the centre, while carried. */
  tilt: THREE.Vector3;
  /** Seconds left of the pickup ease before the prop locks to the bill. */
  attach: number;
  spin: number;
  angle: number;
  size: number;
}

/**
 * Biggest half-extent that counts as light.
 *
 * Light things are kicked, heavy things are solid — and the same threshold
 * decides what the bill can pick up, because the two rules are really one:
 * whether the goose can push it around with its face.
 *
 * Without this the goose was stopped dead 0.44 away by a 0.09 prop, standing
 * half a metre from something the size of an egg with a visible gap.
 */
export const LIGHT_MAX_SIZE = 0.16;

/** Gravity for dropped props, world units per second squared. */
const GRAVITY = 11;
/** How much of the impact speed a prop keeps on each bounce. */
const BOUNCE = 0.32;
/** Below this landing speed it stops bouncing and settles. */
const SETTLE = 0.35;

/**
 * How far a carried prop sits BEYOND the bill anchor, plus its own size.
 *
 * This used to pull the prop 0.12 back TOWARD the goose, left over from when
 * crates were dragged along the ground. From a bill anchor that is backwards:
 * it pulls the prop into the neck, and the neck moves, so it grinds through
 * it. Measured, a 0.09 prop sat 0.083 from neck4 — overlapping.
 */
const BILL_CLEAR = 0.06;
/**
 * Seconds spent closing on the bill when first grabbed.
 *
 * Short enough to read as the prop snapping to the mouth rather than flying to
 * it. Not zero: a single-frame jump from the ground to head height reads as a
 * glitch, and three frames reads as fast. After this the GRIP POINT is exact
 * and the rest of the prop hangs off it.
 */
const ATTACH_TIME = 0.05;
/**
 * How much of the prop's own size the grip is offset from its centre.
 *
 * The bill holds an edge, not the middle, so the centre of mass hangs below
 * the grip and the prop swings from it — which is what makes a carried thing
 * look carried rather than welded to the face.
 */
const GRIP_ARM = 1.15;
/** Damping on the swing. Too little and it never settles. */
const SWING_DAMP = 4.5;
/**
 * How far off straight-down the prop may swing, in radians.
 *
 * Unclamped it reached fully horizontal — a 90 degree flail that reads as the
 * prop being flung around rather than hanging from a bill. A real grip has
 * friction and the bill has a jaw; this stands in for both.
 */
const MAX_SWING = 0.6;

/** How close the goose has to be to shove something, beyond the crate's size. */
const REACH = 0.42;
/** Ground friction. Crates should stop soon after you stop pushing. */
const FRICTION = 3.6;
const SPIN_FRICTION = 4.2;
const PUSH = 7.5;

export interface PushablesProps {
  items: Pushable[];
  /** Index of the crate currently in the goose's bill, or null. */
  grabbed?: React.RefObject<number | null>;
  /**
   * Where a carried prop should sit — just in FRONT of the bill tip, not at
   * the beak bone, which sits back inside the head and drags the prop through
   * the neck.
   */
  beak?: React.RefObject<THREE.Vector3>;
  /** Which way the bill points, so a carried prop turns with the head. */
  beakYaw?: React.RefObject<number>;
  /**
   * Written every frame with each crate's live footprint, so the goose can be
   * BLOCKED by the same boxes it shoves. Published rather than recomputed:
   * crates move, and a collision list built once would be wrong the moment one
   * did.
   */
  colliders?: React.RefObject<Collider[]>;
  /** Live goose position. Read every frame, never a React dependency. */
  goose: React.RefObject<THREE.Vector3>;
  /** Keeps crates on the green. */
  bounds?: number;
}

export default function Pushables({
  items,
  goose,
  colliders,
  grabbed,
  beak,
  beakYaw,
  bounds = 24,
}: PushablesProps) {
  const meshes = useRef<(THREE.Mesh | null)[]>([]);

  const materials = useMemo(
    () =>
      items.map((it) => {
        const g = graph();
        const [r, gr, b] = it.color ?? [0.6, 0.45, 0.3];
        return compileMaterial(g.rgb(r, gr, b));
      }),
    [items],
  );

  const bodies = useRef<Body[]>(
    items.map((it) => ({
      pos: new THREE.Vector3(...it.position),
      vel: new THREE.Vector3(),
      vy: 0,
      tilt: new THREE.Vector3(0, -1, 0),
      attach: 0,
      spin: 0,
      angle: it.rotation ?? 0,
      size: it.size,
    })),
  );

  const carry = useMemo(
    () => ({
      grip: new THREE.Vector3(),
      hang: new THREE.Vector3(),
      up: new THREE.Vector3(),
      spinQ: new THREE.Quaternion(),
      tiltQ: new THREE.Quaternion(),
      UP: new THREE.Vector3(0, 1, 0),
    }),
    [],
  );

  const scratch = useMemo(
    () => ({ away: new THREE.Vector3(), sep: new THREE.Vector3() }),
    [],
  );

  // Dev handle: crate positions are the only way to verify pushing actually
  // happened rather than the goose merely walking past. In an effect, not
  // during render — writing to a hook value on the render path is exactly the
  // thing that makes a component behave differently on a re-render.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as Record<string, unknown>).__crates = bodies.current;
  }, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    if (!(dt > 0)) return;
    const g = goose.current;
    const list = bodies.current;
    const { away, sep } = scratch;
    const { grip, hang, up, spinQ, tiltQ, UP } = carry;

    for (let i = 0; i < list.length; i++) {
      const b = list[i];

      /**
       * Carried crates follow the bill instead of being simulated.
       *
       * Eased rather than snapped, so picking something up looks like the goose
       * closing its bill on it. The velocity is kept up to date from the actual
       * movement, so letting go throws the crate at whatever speed the head was
       * already travelling — which is most of the fun.
       */
      if (grabbed?.current === i && beak?.current) {
        const bp = beak.current;
        // Ease only for the first moment, then lock on.
        b.attach = Math.min(ATTACH_TIME, b.attach + dt);
        const k = b.attach >= ATTACH_TIME ? 1 : Math.min(1, dt / ATTACH_TIME);
        const px = b.pos.x;
        const pz = b.pos.z;
        // Held clear of the head, along the line from the body out to the bill.
        const gx = goose.current?.x ?? bp.x;
        const gz = goose.current?.z ?? bp.z;
        const away = Math.hypot(bp.x - gx, bp.z - gz) || 1;
        const lead = BILL_CLEAR + b.size;
        const tx = bp.x + ((bp.x - gx) / away) * lead;
        const tz = bp.z + ((bp.z - gz) / away) * lead;
        /**
         * The grip is exact; the prop is a pendulum hanging off it.
         *
         * Free-fall the centre of mass, then project it back onto the sphere of
         * radius `arm` around the grip and remove the radial velocity — a rigid
         * rod, solved by position rather than by force, so it cannot explode
         * however hard the head is thrown about.
         */
        const arm = b.size * GRIP_ARM;
        const target = grip.set(tx, Math.max(b.size, bp.y), tz);
        if (b.attach < ATTACH_TIME) {
          // Closing on it: ease the whole prop in, no swing yet.
          b.pos.lerp(target, k);
          b.vel.set(0, 0, 0);
        } else {
          b.vel.y -= GRAVITY * dt;
          b.pos.addScaledVector(b.vel, dt);
          hang.copy(b.pos).sub(target);
          const len = hang.length();
          if (len < 1e-5) hang.set(0, -arm, 0);
          else hang.multiplyScalar(arm / len);
          // Keep it below the grip and inside the swing cone.
          const flat = Math.hypot(hang.x, hang.z);
          const maxFlat = arm * Math.sin(MAX_SWING);
          if (flat > maxFlat && flat > 1e-6) {
            const squeeze = maxFlat / flat;
            hang.x *= squeeze;
            hang.z *= squeeze;
          }
          hang.y = -Math.sqrt(
            Math.max(0, arm * arm - hang.x * hang.x - hang.z * hang.z),
          );
          b.pos.copy(target).add(hang);
          // Remove motion along the rod; a rigid arm cannot stretch.
          const radial = b.vel.dot(hang) / (arm * arm);
          b.vel.addScaledVector(hang, -radial);
          b.vel.multiplyScalar(Math.exp(-SWING_DAMP * dt));
        }
        // Face the way the bill faces, and tip with the swing.
        if (beakYaw) {
          let d = beakYaw.current - b.angle;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          b.angle += d * Math.min(1, 12 * dt);
        }
        b.tilt.copy(b.pos).sub(target).normalize();
        void px;
        void pz;
        const m0 = meshes.current[i];
        if (m0) {
          m0.position.copy(b.pos);
          // Hang from the grip: the prop's own up-axis points back at the bill.
          spinQ.setFromAxisAngle(UP, b.angle);
          tiltQ.setFromUnitVectors(UP, up.copy(b.tilt).negate());
          m0.quaternion.copy(tiltQ).multiply(spinQ);
        }
        // Not a collider while carried, or the goose shoulders its own cargo.
        if (colliders?.current) {
          const c = (colliders.current[i] ??= {
            x: 0,
            z: 0,
            hx: 0,
            hz: 0,
            top: 0,
          });
          c.hx = 0;
          c.hz = 0;
          c.top = -1;
        }
        continue;
      }

      /**
       * Dropped props fall, bounce and settle.
       *
       * This used to lower them at a constant 4 units/s and stop dead on
       * contact, which is a lift descending rather than a thing being dropped —
       * no acceleration on the way down and no acknowledgement of the landing.
       * Gravity plus a lossy bounce costs three lines and reads completely
       * differently.
       */
      b.attach = 0;

      if (b.pos.y > b.size + 1e-4 || b.vy !== 0) {
        b.vy -= GRAVITY * dt;
        b.pos.y += b.vy * dt;
        if (b.pos.y <= b.size) {
          b.pos.y = b.size;
          if (-b.vy > SETTLE) {
            b.vy = -b.vy * BOUNCE;
            // A bounce scuffs it sideways and sets it spinning.
            b.spin += (b.vel.x - b.vel.z) * 0.4;
          } else {
            b.vy = 0;
          }
        }
      }

      // --- the goose shoves it -------------------------------------------
      if (g) {
        away.set(b.pos.x - g.x, 0, b.pos.z - g.z);
        const d = away.length();
        const contact = b.size + REACH;
        /**
         * From BESIDE it, never from on top of it.
         *
         * This test threw the height away — `away` zeroes y — so it only ever
         * asked how far the goose was horizontally. Standing on a crate is a
         * horizontal distance of about zero, which is not "no contact", it is
         * the STRONGEST possible contact: strength scales with 1 - d/contact.
         * So the moment the goose landed on a crate it shoved it out from under
         * itself at full force, which is why you cannot stand or walk on one.
         *
         * A goose above a crate's top face is standing on it or clearing it;
         * either way it is not barging it. Below that, it is beside it, and
         * shoving is exactly right.
         */
        const topY = b.size * 2;
        const beside = g.y < topY - 1e-3;
        if (beside && d < contact && d > 1e-4) {
          away.multiplyScalar(1 / d);
          /**
           * Lighter things go further. The impulse is the same kick; dividing
           * by size stands in for mass, so an egg-sized prop skitters away and
           * a crate barely shifts — which is the difference between the two
           * being legible at all.
           */
          const mass = Math.max(0.25, b.size / 0.35);
          const strength = ((1 - d / contact) * PUSH) / mass;
          b.vel.addScaledVector(away, strength * dt);
          // Light props also hop, so a kick reads as a kick.
          if (b.size <= LIGHT_MAX_SIZE) b.vy += strength * dt * 0.5;
          // Off-centre contact spins it. Without this crates slide like they
          // are on rails, which reads as scenery rather than as objects.
          const offset = away.x * 0.6 - away.z * 0.6;
          b.spin += offset * strength * 0.5 * dt;
        }
      }

      // --- crate vs crate -------------------------------------------------
      // Cheap positional separation, no impulse exchange. With four boxes the
      // difference is invisible, and it cannot explode the way a badly tuned
      // impulse solver can.
      for (let j = i + 1; j < list.length; j++) {
        const o = list[j];
        sep.set(b.pos.x - o.pos.x, 0, b.pos.z - o.pos.z);
        const d = sep.length();
        const min = b.size + o.size;
        if (d < min && d > 1e-4) {
          sep.multiplyScalar((min - d) / d / 2);
          b.pos.add(sep);
          o.pos.sub(sep);
        }
      }

      b.pos.addScaledVector(b.vel, dt);
      b.angle += b.spin * dt;

      // Exponential friction, so it eases to a stop instead of clipping to zero.
      const decay = Math.exp(-FRICTION * dt);
      b.vel.multiplyScalar(decay);
      b.spin *= Math.exp(-SPIN_FRICTION * dt);
      if (b.vel.lengthSq() < 1e-6) b.vel.set(0, 0, 0);

      b.pos.x = THREE.MathUtils.clamp(b.pos.x, -bounds, bounds);
      b.pos.z = THREE.MathUtils.clamp(b.pos.z, -bounds, bounds);

      if (colliders?.current) {
        const c = (colliders.current[i] ??= {
          x: 0,
          z: 0,
          hx: 0,
          hz: 0,
          top: 0,
        });
        c.x = b.pos.x;
        c.z = b.pos.z;
        // Square footprint, turned to match the mesh. Light props publish a
        // zero footprint — they are still listed so the bill can find them to
        // grab, but nothing blocks the goose.
        const solid = b.size > LIGHT_MAX_SIZE;
        c.hx = solid ? b.size : 0;
        c.hz = solid ? b.size : 0;
        c.top = solid ? b.size * 2 : -1;
        c.angle = b.angle;
      }

      const m = meshes.current[i];
      if (m) {
        m.position.set(b.pos.x, b.pos.y, b.pos.z);
        m.rotation.set(0, b.angle, 0);
      }
    }
  });

  return (
    <group>
      {items.map((it, i) => (
        <mesh
          key={i}
          ref={(m) => {
            meshes.current[i] = m;
          }}
          position={it.position}
        >
          <boxGeometry args={[it.size * 2, it.size * 2, it.size * 2]} />
          <primitive object={materials[i]} attach="material" />
        </mesh>
      ))}
    </group>
  );
}
