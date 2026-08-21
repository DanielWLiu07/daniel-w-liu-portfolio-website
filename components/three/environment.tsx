"use client";

/**
 * The village green, shaded entirely through the node system.
 */
import { useMemo } from "react";
import {
  compile,
  compileMaterial,
  graph,
  type Graph,
} from "blender-to-threejs";

/** Stripe pitch in world units. */
const MOW_WIDTH = 1.6;

function lawnMaterial() {
  const g = graph();
  // Alternating bands across world X. fract() of the scaled coordinate gives a
  // 0..1 sawtooth; the ramp turns that into two flat greens with a hard seam.
  const u = g.fract(g.divide(g.separate(g.position("world"), "x"), MOW_WIDTH));
  return compileMaterial(
    g.colorRamp(
      u,
      [
        { position: 0.0, color: [0.42, 0.6, 0.28, 1] },
        { position: 0.5, color: [0.47, 0.66, 0.31, 1] },
      ],
      "CONSTANT",
    ),
  );
}

/** Flat colour through the graph, so props share the lawn's shading path. */
function flatMaterial(r: number, gr: number, b: number) {
  const g = graph();
  return compileMaterial(g.rgb(r, gr, b));
}

/**
 * Pond water, built the way real-time water normally is.
 *
 * The standard recipe has four parts, and the first is the one that matters:
 *
 *  1. DEPTH-GRADED COLOUR. Water is not a colour, it is a volume that absorbs
 *     light with distance — Beer-Lambert, transmittance = exp(-k*d). Shallow
 *     water shows the bed through it and deep water does not. Almost every
 *     engine gets this by sampling the depth buffer and differencing against
 *     the surface. There is no depth prepass here, and none is needed: the
 *     pond is a disc, so its depth is a known function of radius and can be
 *     written down exactly rather than sampled.
 *  2. A SHORELINE BAND. The tell of cheap water is a hard rim where the
 *     surface meets the ground. Real edges are foam and wet sand, and they are
 *     broken up — so the band is wobbled by a cheap two-sine noise instead of
 *     following the circle.
 *  3. LAYERED RIPPLES. One scrolling pattern reads as a machine. Two, at
 *     different scales and rates, interfere and stop looking periodic.
 *  4. TRANSPARENCY. Without it the surface is a painted lid and nothing can
 *     sit IN the water, only on it.
 *
 * What is deliberately NOT here: reflection and refraction. Both want a view
 * vector, the node set has no Fresnel or camera-vector node, and a stylised
 * pond reads fine without them. Noted rather than faked.
 */

/** Beer-Lambert falloff. Higher absorbs faster, so the pond darkens sooner. */
const ABSORB = 3.2;
/** Width of the shore band, in world units. Narrow — it is a wet rim, not a beach. */
const SHORE = 0.13;

/** 0 at the rim, 1 at the deepest point. A bowl, not a bathtub. */
function pondDepth(g: Graph) {
  const px = g.subtract(g.separate(g.position("world"), "x"), POND.x);
  const pz = g.subtract(g.separate(g.position("world"), "z"), POND.z);
  const r = g.sqrt(g.add(g.multiply(px, px), g.multiply(pz, pz)));
  // Normalised radius, then a spherical-cap profile: sqrt(1 - rn^2) is deep in
  // the middle and feathers to zero at the edge, where a linear ramp would
  // leave a visible cone.
  const rn = g.divide(r, POND.radius);
  // WATER_BED_PROFILE — the node form of pondBed(), normalised 0..1. Smoothstep
  // in from the rim: t*t*(3 - 2t).
  const t = g.max(0, g.subtract(1, rn));
  const depth = g.multiply(g.multiply(t, t), g.subtract(3, g.multiply(2, t)));
  return { px, pz, r, rn, depth };
}

function waterMaterial() {
  const g = graph();
  const { px, pz, r, rn, depth } = pondDepth(g);

  // Two ripple sets, opposite directions and coprime-ish scales so the pattern
  // does not visibly repeat.
  const ring1 = g.fract(
    g.subtract(g.divide(r, 0.95), g.multiply(g.time(), 0.12)),
  );
  const ring2 = g.fract(g.add(g.divide(r, 0.64), g.multiply(g.time(), 0.07)));
  const ripple = g.multiplyAdd(g.add(ring1, ring2), 0.5, 0);

  // Cheap noise: a product of two sines on different axes and rates. Standard
  // stand-in when there is no noise node, and enough to break a straight edge.
  const wob = g.multiply(
    g.sin(g.add(g.multiply(px, 5.1), g.multiply(g.time(), 0.6))),
    g.cos(g.subtract(g.multiply(pz, 4.7), g.multiply(g.time(), 0.45))),
  );

  // Beer-Lambert: how much of the bed has been absorbed by this much water.
  const absorbed = g.subtract(
    1,
    g.exp(g.multiply(g.multiply(depth, -ABSORB), 1)),
  );
  const body = g.blend(
    absorbed,
    g.rgb(0.55, 0.71, 0.75),
    g.rgb(0.13, 0.28, 0.42),
  );
  // Ripples lighten the surface slightly rather than recolouring it, so they
  // read as light on water instead of as stripes painted on it.
  const lit = g.blend(g.multiply(ripple, 0.1), body, g.rgb(0.78, 0.88, 0.92));

  // Shore band, measured in world units in from the rim and wobbled.
  const inFromRim = g.multiply(g.subtract(1, rn), POND.radius);
  const foam = g.mapRange(g.add(inFromRim, g.multiply(wob, 0.03)), {
    from: [SHORE, 0],
    to: [0, 1],
    clamp: true,
  });
  const surface = g.blend(foam, lit, g.rgb(0.93, 0.96, 0.97));

  // Opacity rides the same absorption curve: the shallows let the bank show
  // through, the middle does not. Foam is opaque.
  const clarity = g.blend(absorbed, g.value(0.82), g.value(0.97));
  const alpha = g.max(clarity, foam);

  const material = compileMaterial(surface);
  material.opacityNode = compile(alpha).node;
  material.transparent = true;
  // The pond is a horizontal plane read from above; writing depth would make
  // it occlude the parts of the goose sitting in it, which is the one thing
  // transparency was added to allow.
  material.depthWrite = false;
  return material;
}

/** A dirt path: a band in world Z, eased at the edges so it is not a hard line. */
function pathMaterial() {
  const g = graph();
  const z = g.separate(g.position("world"), "z");
  const across = g.mapRange(g.abs(z), {
    from: [0.0, 1.5],
    to: [0, 1],
    clamp: true,
  });
  return compileMaterial(
    g.colorRamp(
      across,
      [
        { position: 0.0, color: [0.72, 0.62, 0.44, 1] },
        { position: 1.0, color: [0.66, 0.56, 0.39, 1] },
      ],
      "EASE",
    ),
  );
}

/**
 * Solid things, as footprints on the ground plane.
 */
export interface Collider {
  x: number;
  z: number;
  hx: number;
  hz: number;
  /** Height of the top face. Anything above this passes over. */
  top: number;
  /**
   * Y rotation of the box, radians. Optional; absent means axis-aligned.
   *
   * Crates spin, and a box that turns while its collider does not is a box
   * whose corners you can walk into. At 45 degrees a square reaches sqrt(2)
   * times its half-extent along the world axes, so up to 41% of the visible
   * crate had nothing behind it.
   */
  angle?: number;
}

const HEDGES = [
  { p: [-7, 0.55, -5], s: [6, 1.1, 0.8] },
  { p: [7.5, 0.55, -4], s: [0.8, 1.1, 6] },
  // Kept clear of the pond. It used to stand in the water, which opaque water
  // hid and transparent water does not.
  { p: [-3.5, 0.55, 5], s: [0.8, 1.1, 5] },
  { p: [4, 0.45, 7], s: [5, 0.9, 0.8] },
  { p: [-2, 0.35, -9], s: [7, 0.7, 0.8] },
] as const;

/** Half-extent of the lawn, matching the default prop below. */
export const LAWN_HALF = 26;

/**
 * The pond. Exported so the goose knows when it is swimming.
 *
 * A circle rather than a mesh test: the water is a disc, and asking "is the
 * goose inside this radius" is the whole of it.
 */
export const POND = {
  /**
   * Big enough to actually swim in.
   *
   * At radius 2.6 the goose crossed the whole pond in under three seconds and
   * full float only existed over the middle 76% of it, so `swim` was almost
   * never settled — measured sweeping 0.02..1.00 across a single three-second
   * press. Every one of those sweeps morphs the neck between its land and
   * water poses, and that constant morphing is what reads as the head
   * wobbling. Steady swimming is calm; there just was not enough water to be
   * steady in.
   */
  x: -11,
  z: 6.5,
  radius: 5,
  surface: 0.006,
  /**
   * Depth at the centre. The bed is a bowl, and this is the one number both
   * the shader and the swimming read from — see pondBed(). A pond that LOOKS
   * shallow at the rim and drops a goose to full float there is worse than
   * either choice made consistently.
   */
  depth: 0.75,
};

/**
 * Depth of the bed at a point, world units. Zero at the rim and outside it.
 *
 * Smoothstep on the distance in from the rim, which is flat at BOTH ends: a
 * shelf you can wade down and a basin with a floor. A spherical cap was the
 * first instinct and it is wrong here — sqrt(1 - rn^2) has a vertical tangent
 * at the rim, so the goose went from dry to 81% afloat inside a single metre.
 *
 * WATER_BED_PROFILE below is this same curve as nodes. They have to match.
 */
export function pondBed(x: number, z: number, depth = POND.depth): number {
  const rn = Math.hypot(x - POND.x, z - POND.z) / POND.radius;
  if (rn >= 1) return 0;
  const t = 1 - rn;
  return depth * t * t * (3 - 2 * t);
}

export const COLLIDERS: Collider[] = [
  ...HEDGES.map((h) => ({
    x: h.p[0],
    z: h.p[2],
    hx: h.s[0] / 2,
    hz: h.s[2] / 2,
    // Centre plus half the height: the same box the mesh draws.
    top: h.p[1] + h.s[1] / 2,
  })),
  // The low stone wall.
  { x: 0, z: -12, hx: (LAWN_HALF * 1.4) / 2, hz: 0.25, top: 0.6 },
];

export interface EnvironmentProps {
  /** Half-extent of the lawn, in world units. */
  size?: number;
}

export default function Environment({ size = 26 }: EnvironmentProps) {
  const lawn = useMemo(() => lawnMaterial(), []);
  const path = useMemo(() => pathMaterial(), []);
  const hedge = useMemo(() => flatMaterial(0.24, 0.4, 0.22), []);
  const stone = useMemo(() => flatMaterial(0.8, 0.79, 0.74), []);
  const water = useMemo(() => waterMaterial(), []);

  // Laid out by hand rather than randomly: a village green wants deliberate
  // sight-lines and somewhere to chase things around, not scatter.
  // Same list the colliders are built from, so what you can see and what you
  // can walk into cannot disagree.
  const hedges = HEDGES;

  return (
    <group>
      {/* Lawn. Rotated flat; the stripe runs along world X regardless. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[size * 2, size * 2]} />
        <primitive object={lawn} attach="material" />
      </mesh>

      {/* Path across the green, lifted a hair to beat z-fighting with the lawn. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
        <planeGeometry args={[size * 2, 3]} />
        <primitive object={path} attach="material" />
      </mesh>

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[POND.x, POND.surface, POND.z]}
      >
        <circleGeometry args={[POND.radius, 48]} />
        <primitive object={water} attach="material" />
      </mesh>

      {hedges.map((h, i) => (
        <mesh
          key={`hedge-${i}`}
          position={h.p as unknown as [number, number, number]}
        >
          <boxGeometry args={h.s as unknown as [number, number, number]} />
          <primitive object={hedge} attach="material" />
        </mesh>
      ))}

      {/* A low wall to give the space an edge. */}
      <mesh position={[0, 0.3, -12]}>
        <boxGeometry args={[size * 1.4, 0.6, 0.5]} />
        <primitive object={stone} attach="material" />
      </mesh>
    </group>
  );
}
