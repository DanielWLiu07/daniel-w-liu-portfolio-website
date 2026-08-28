"use client";

/**
 * A portable radio, small enough to fit in a bill.
 *
 * Built from primitives rather than modelled, because it has to read at about
 * ninety pixels from the game's fixed camera and every part of it is either a
 * box or a cylinder. Flat unlit colours, matching everything else on the green.
 */
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { compileMaterial, graph } from "blender-to-threejs";

/** How far the cone travels at full blast, as a fraction of its own radius. */
const CONE_THROW = 0.22;

export default function RadioMesh({
  size,
  level,
  on,
}: {
  /** Half-extent of the physics box this has to sit inside. */
  size: number;
  /** Live loudness, 0..1. */
  level: React.RefObject<number>;
  on: React.RefObject<boolean>;
}) {
  const cones = useRef<(THREE.Mesh | null)[]>([]);
  const lamp = useRef<THREE.Mesh>(null);

  const mats = useMemo(() => {
    const g = graph();
    return {
      shell: compileMaterial(g.rgb(0.14, 0.15, 0.17)),
      trim: compileMaterial(g.rgb(0.83, 0.8, 0.72)),
      cone: compileMaterial(g.rgb(0.32, 0.33, 0.36)),
      deck: compileMaterial(g.rgb(0.24, 0.26, 0.3)),
      lampOn: compileMaterial(g.rgb(0.95, 0.28, 0.2)),
      metal: compileMaterial(g.rgb(0.62, 0.63, 0.66)),
    };
  }, []);

  // Sized off the collision box so the two never disagree visibly.
  const w = size * 1.7;
  const h = size * 0.95;
  const d = size * 0.72;
  const cr = h * 0.62;

  useFrame(() => {
    const l = level.current ?? 0;
    for (const c of cones.current) {
      if (c) c.position.z = d + cr * CONE_THROW * l;
    }
    if (lamp.current) lamp.current.visible = Boolean(on.current);
  });

  return (
    <group>
      {/* body */}
      <mesh castShadow>
        <boxGeometry args={[w * 2, h * 2, d * 2]} />
        <primitive object={mats.shell} attach="material" />
      </mesh>

      {/* speakers, left and right */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * w * 0.58, 0, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, d * 0.99]}>
            <cylinderGeometry args={[cr, cr, d * 0.06, 20]} />
            <primitive object={mats.trim} attach="material" />
          </mesh>
          <mesh
            ref={(m) => {
              cones.current[s > 0 ? 1 : 0] = m;
            }}
            rotation={[Math.PI / 2, 0, 0]}
            position={[0, 0, d]}
          >
            <cylinderGeometry args={[cr * 0.62, cr * 0.72, d * 0.14, 18]} />
            <primitive object={mats.cone} attach="material" />
          </mesh>
        </group>
      ))}

      {/* tape deck across the middle */}
      <mesh position={[0, h * 0.1, d * 1.01]}>
        <boxGeometry args={[w * 0.6, h * 0.8, d * 0.08]} />
        <primitive object={mats.deck} attach="material" />
      </mesh>
      {/* two dials under it */}
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[s * w * 0.16, -h * 0.6, d * 1.02]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[h * 0.14, h * 0.14, d * 0.1, 12]} />
          <primitive object={mats.trim} attach="material" />
        </mesh>
      ))}
      {/* the on light */}
      <mesh ref={lamp} position={[0, -h * 0.6, d * 1.04]} visible={false}>
        <boxGeometry args={[w * 0.09, h * 0.12, d * 0.06]} />
        <primitive object={mats.lampOn} attach="material" />
      </mesh>

      {/* carry handle */}
      <mesh position={[0, h * 1.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[w * 0.42, size * 0.055, 6, 16, Math.PI]} />
        <primitive object={mats.metal} attach="material" />
      </mesh>
      {/* antenna */}
      <mesh
        position={[w * 0.82, h * 1.5, -d * 0.4]}
        rotation={[0.1, 0, -0.34]}
      >
        <cylinderGeometry args={[size * 0.028, size * 0.028, h * 2.6, 5]} />
        <primitive object={mats.metal} attach="material" />
      </mesh>
    </group>
  );
}
