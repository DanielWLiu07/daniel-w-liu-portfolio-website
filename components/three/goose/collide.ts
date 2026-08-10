/**
 * Stop the goose walking through the scenery.
 */
import type { Collider } from "../environment";

/** How wide the goose is, for collision. Its body, not its neck. */
export const GOOSE_RADIUS = 0.34;

/**
 * How far a point is pushed out of the scenery, if at all.
 */
export function penetration(
  x: number,
  z: number,
  radius: number,
  boxes: readonly Collider[],
  out: { x: number; z: number },
): boolean {
  out.x = 0;
  out.z = 0;
  let hit = false;
  for (const b of boxes) {
    const nx = Math.min(Math.max(x, b.x - b.hx), b.x + b.hx);
    const nz = Math.min(Math.max(z, b.z - b.hz), b.z + b.hz);
    const dx = x - nx;
    const dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 > radius * radius) continue;
    hit = true;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      const push = (radius - d) / d;
      out.x += dx * push;
      out.z += dz * push;
    }
  }
  return hit;
}

/**
 * A capsule along a bone, approximated by a chain of spheres.
 */
export interface BoneCapsule {
  from: string;
  to: string;
  radius: number;
  /** Sample count along the segment, ends included. */
  samples: number;
}

/**
 * The torso as well as the neck.
 */
export const NECK_CAPSULES: readonly BoneCapsule[] = [
  { from: "tail", to: "hips", radius: 0.2, samples: 3 },
  { from: "hips", to: "spine", radius: 0.25, samples: 2 },
  { from: "spine", to: "chest", radius: 0.25, samples: 3 },
  { from: "chest", to: "neck1", radius: 0.11, samples: 3 },
  { from: "neck1", to: "neck2", radius: 0.1, samples: 3 },
  { from: "neck2", to: "neck3", radius: 0.095, samples: 3 },
  { from: "neck3", to: "neck4", radius: 0.095, samples: 3 },
  { from: "neck4", to: "head", radius: 0.11, samples: 3 },
  { from: "head", to: "beak", radius: 0.1, samples: 3 },
];

export interface Resolved {
  x: number;
  z: number;
  hit: boolean;
}

/**
 * @param x,z      where the goose wants to be
 * @param radius   its footprint
 * @param boxes    static scenery
 * @param bounds   half-extent of the lawn, or 0 for unbounded
 */
export function resolveCollisions(
  x: number,
  z: number,
  radius: number,
  boxes: readonly Collider[],
  bounds = 0,
  out: Resolved = { x: 0, z: 0, hit: false },
): Resolved {
  let px = x;
  let pz = z;
  let hit = false;

  for (const b of boxes) {
    // Nearest point on the box to the goose's centre.
    const nx = Math.min(Math.max(px, b.x - b.hx), b.x + b.hx);
    const nz = Math.min(Math.max(pz, b.z - b.hz), b.z + b.hz);
    const dx = px - nx;
    const dz = pz - nz;
    const d2 = dx * dx + dz * dz;

    if (d2 > radius * radius) continue;

    hit = true;
    if (d2 > 1e-8) {
      // Outside the box, overlapping the rounded edge: push straight out.
      const d = Math.sqrt(d2);
      const push = (radius - d) / d;
      px += dx * push;
      pz += dz * push;
    } else {
      // Centre is INSIDE the box — it got in somehow, or spawned there. Leave
      // by the nearest face rather than by the direction of travel, which at
      // this point is not trustworthy.
      const toL = px - (b.x - b.hx);
      const toR = b.x + b.hx - px;
      const toB = pz - (b.z - b.hz);
      const toT = b.z + b.hz - pz;
      const m = Math.min(toL, toR, toB, toT);
      if (m === toL) px = b.x - b.hx - radius;
      else if (m === toR) px = b.x + b.hx + radius;
      else if (m === toB) pz = b.z - b.hz - radius;
      else pz = b.z + b.hz + radius;
    }
  }

  if (bounds > 0) {
    const lim = bounds - radius;
    if (px < -lim) {
      px = -lim;
      hit = true;
    }
    if (px > lim) {
      px = lim;
      hit = true;
    }
    if (pz < -lim) {
      pz = -lim;
      hit = true;
    }
    if (pz > lim) {
      pz = lim;
      hit = true;
    }
  }

  out.x = px;
  out.z = pz;
  out.hit = hit;
  return out;
}
