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
  spin: number;
  angle: number;
  size: number;
}

/**
 * How far a dragged crate trails behind the bill.
 *
 * Only small props can be grabbed at all (see GRAB_MAX_SIZE), so a carried
 * item rides just under the bill without hiding the bird behind it.
 */
const DRAG_BEHIND = 0.12;
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
  /** Live bill position, written by the goose. */
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
        // Trail slightly toward the goose, so it reads as being pulled rather
        // than pushed along by an invisible hand.
        const gx = goose.current?.x ?? bp.x;
        const gz = goose.current?.z ?? bp.z;
        const away = Math.hypot(bp.x - gx, bp.z - gz) || 1;
        const tx = bp.x - ((bp.x - gx) / away) * DRAG_BEHIND;
        const tz = bp.z - ((bp.z - gz) / away) * DRAG_BEHIND;
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

      // Dropped: fall back to the ground before resuming normal shoving.
      if (b.pos.y > b.size + 1e-3) {
        b.pos.y = Math.max(b.size, b.pos.y - 4 * dt);
      }

      // --- the goose shoves it -------------------------------------------
      if (g) {
        away.set(b.pos.x - g.x, 0, b.pos.z - g.z);
        const d = away.length();
        const contact = b.size + REACH;
        if (d < contact && d > 1e-4) {
          away.multiplyScalar(1 / d);
          const strength = (1 - d / contact) * PUSH;
          b.vel.addScaledVector(away, strength * dt);
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
        c.hx = b.size;
        c.hz = b.size;
        c.top = b.size * 2;
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
