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
/** How quickly a crate reaches the bill when grabbed. Not instant. */
const CARRY_SNAP = 14;

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
      spin: 0,
      angle: it.rotation ?? 0,
      size: it.size,
    })),
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
        const k = Math.min(1, CARRY_SNAP * dt);
        const px = b.pos.x;
        const pz = b.pos.z;
        // Held clear of the head, along the line from the body out to the bill.
        const gx = goose.current?.x ?? bp.x;
        const gz = goose.current?.z ?? bp.z;
        const away = Math.hypot(bp.x - gx, bp.z - gz) || 1;
        const lead = BILL_CLEAR + b.size;
        const tx = bp.x + ((bp.x - gx) / away) * lead;
        const tz = bp.z + ((bp.z - gz) / away) * lead;
        b.pos.x += (tx - b.pos.x) * k;
        // Held just under the bill: small props ride in the mouth.
        b.pos.y += (Math.max(b.size, bp.y - b.size - 0.02) - b.pos.y) * k;
        b.pos.z += (tz - b.pos.z) * k;
        b.vel.set((b.pos.x - px) / dt, 0, (b.pos.z - pz) / dt);
        b.spin *= Math.exp(-SPIN_FRICTION * dt);
        b.angle += b.spin * dt;
        const m0 = meshes.current[i];
        if (m0) {
          m0.position.copy(b.pos);
          m0.rotation.y = b.angle;
        }
        // Not a collider while carried, or the goose shoulders its own cargo.
        if (colliders?.current) {
          const c = (colliders.current[i] ??= { x: 0, z: 0, hx: 0, hz: 0, top: 0 });
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
        if (d < contact && d > 1e-4) {
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
        const c = (colliders.current[i] ??= { x: 0, z: 0, hx: 0, hz: 0, top: 0 });
        c.x = b.pos.x;
        c.z = b.pos.z;
        // Square footprint: the crate spins, and a rotating AABB would pop.
        // Light props publish a zero footprint — they are still listed so the
        // bill can find them to grab, but nothing blocks the goose.
        const solid = b.size > LIGHT_MAX_SIZE;
        c.hx = solid ? b.size : 0;
        c.hz = solid ? b.size : 0;
        c.top = solid ? b.size * 2 : -1;
      }

      const m = meshes.current[i];
      if (m) {
        m.position.set(b.pos.x, b.pos.y, b.pos.z);
        m.rotation.y = b.angle;
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
