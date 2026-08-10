"use client";

/**
 * The village green, shaded entirely through the node system.
 */
import { useMemo } from "react";
import { compileMaterial, graph } from "blender-to-threejs";

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
}

const HEDGES = [
  { p: [-7, 0.55, -5], s: [6, 1.1, 0.8] },
  { p: [7.5, 0.55, -4], s: [0.8, 1.1, 6] },
  { p: [-8, 0.55, 5], s: [0.8, 1.1, 5] },
  { p: [4, 0.45, 7], s: [5, 0.9, 0.8] },
  { p: [-2, 0.35, -9], s: [7, 0.7, 0.8] },
] as const;

/** Half-extent of the lawn, matching the default prop below. */
export const LAWN_HALF = 26;

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
  const water = useMemo(() => flatMaterial(0.44, 0.62, 0.72), []);

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

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-9, 0.006, 3]}>
        <circleGeometry args={[2.6, 40]} />
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
