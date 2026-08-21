/**
 * Stop the goose walking through the scenery — but not over it.
 */
import type { Collider } from "../environment";

/** How wide the goose is, for collision. Its body, not its neck. */
export const GOOSE_RADIUS = 0.34;

/**
 * Slack on "is the goose above this box", in world units.
 *
 * Standing ON something puts the goose at exactly the box's top, and a strict
 * `y > top` is false at exactly equal — so the resolver saw the box it was
 * standing on, and pushed it out sideways. Landing on a crate slid you off it
 * one frame later. Being level with the top has to count as being above it.
 */
const STAND_EPS = 1e-3;

/**
 * How far a point is pushed out of the scenery, if at all.
 */
export function penetration(
  x: number,
  z: number,
  radius: number,
  boxes: readonly Collider[],
  out: { x: number; z: number },
  y = -Infinity,
  /** See resolveCollisions. */
  ignore: Collider | null = null,
): boolean {
  out.x = 0;
  out.z = 0;
  let hit = false;
  for (const b of boxes) {
    if (b === ignore) continue;
    if (y >= b.top - STAND_EPS) continue;
    /**
     * Solved in the BOX's frame, not the world's.
     *
     * Turning the query point into the box's own rotation makes an oriented
     * box the same problem as an axis-aligned one — the nearest-point clamp
     * below is unchanged — and only the resulting push has to be turned back.
     * The alternative, growing an axis-aligned box to cover a rotated one,
     * blocks the goose in the empty diagonal corners.
     */
    const a = b.angle ?? 0;
    const ca = a === 0 ? 1 : Math.cos(a);
    const sa = a === 0 ? 0 : Math.sin(a);
    const rx = x - b.x;
    const rz = z - b.z;
    const lx = rx * ca + rz * sa;
    const lz = -rx * sa + rz * ca;
    const nx = Math.min(Math.max(lx, -b.hx), b.hx);
    const nz = Math.min(Math.max(lz, -b.hz), b.hz);
    const dx = lx - nx;
    const dz = lz - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 > radius * radius) continue;
    hit = true;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      const push = (radius - d) / d;
      // Back to world: the inverse rotation of the one applied above.
      out.x += (dx * ca - dz * sa) * push;
      out.z += (dx * sa + dz * ca) * push;
    }
  }
  return hit;
}

/**
 * Height of the highest thing that can be stood on at (x, z).
 *
 * Without this there was nothing to land ON. The only floor was the lawn, so a
 * goose that jumped onto a crate kept falling once it was below the crate's
 * top — and the moment it was below, resolveCollisions saw the box again and
 * pushed it out sideways. Landing on something ejected you off it, which reads
 * as the jump being broken rather than as the floor being missing.
 *
 * Tested against the box's own footprint plus `margin`, NOT the footprint grown
 * by the whole goose radius the way collision is. Those are different
 * questions: you collide with a box while beside it, and you stand on it only
 * while over it. Growing this by a full radius would let the goose stand on
 * thin air alongside a crate.
 *
 * But zero margin is unlandable in practice. A crate is 0.70 across, so with no
 * margin the goose has to bring its centre down inside a 0.70 pad — while
 * collision shoves it away from anywhere within a radius of the box. Measured,
 * four run-ups at sensible take-off distances landed on the crate exactly zero
 * times. A small tolerance is what makes "jump on that" a thing you can do
 * rather than a thing you can theoretically do.
 */
export function supportHeight(
  x: number,
  z: number,
  boxes: readonly Collider[],
  ground = 0,
  margin = 0,
  /** Filled with the box being stood on, if any. See the `ignore` param below. */
  out?: { box: Collider | null },
): number {
  let top = ground;
  if (out) out.box = null;
  for (const b of boxes) {
    if (b.top <= top) continue;
    // Same change of frame as penetration(): an oriented box is only an
    // axis-aligned one asked in the right coordinates.
    const a = b.angle ?? 0;
    const ca = a === 0 ? 1 : Math.cos(a);
    const sa = a === 0 ? 0 : Math.sin(a);
    const rx = x - b.x;
    const rz = z - b.z;
    const lx = rx * ca + rz * sa;
    const lz = -rx * sa + rz * ca;
    if (Math.abs(lx) > b.hx + margin || Math.abs(lz) > b.hz + margin) continue;
    top = b.top;
    if (out) out.box = b;
  }
  return top;
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
  y = -Infinity,
  /**
   * A box to leave alone — the one the goose was standing on as it fell off.
   *
   * Standing on a ledge, the goose's BODY overhangs it; that is what a bird
   * does and it is not a collision. The overhang only becomes visible to this
   * resolver once the goose drops below the top, and resolving it then is a
   * shove sideways at the exact moment of stepping off. Rate-limiting it made
   * the shove slower, not absent — measured 2.60 m/s off a face and 2.18 off a
   * corner, against a 0.95 m/s walk. It was never a collision to resolve.
   */
  ignore: Collider | null = null,
): Resolved {
  let px = x;
  let pz = z;
  let hit = false;

  for (const b of boxes) {
    if (b === ignore) continue;
    // Above it, or standing on it: nothing to resolve either way.
    if (y >= b.top - STAND_EPS) continue;
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
