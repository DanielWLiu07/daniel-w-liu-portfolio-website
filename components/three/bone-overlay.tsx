'use client';

/**
 * Draws the live skeleton over the goose.
 *
 * For tuning the neck by eye: the sliders move angles, but what you are trying
 * to shape is where the joints end up, and the mesh hides all of it. The chain
 * being edited is drawn bright and everything else dim, so it is obvious which
 * segment a slider belongs to.
 *
 * Depth testing is off. Bones live inside the body and an overlay that respects
 * depth is an overlay you cannot see.
 */
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

/** Parent → child pairs to draw. Names as the exporter leaves them. */
const LINKS: readonly (readonly [string, string])[] = [
  ['root', 'hips'],
  ['hips', 'spine'],
  ['spine', 'chest'],
  ['chest', 'neck1'],
  ['neck1', 'neck2'],
  ['neck2', 'neck3'],
  ['neck3', 'neck4'],
  ['neck4', 'head'],
  ['head', 'beak'],
  ['hips', 'tail'],
  ['chest', 'wingL'],
  ['chest', 'wingR'],
  ['hips', 'thighL'],
  ['thighL', 'shinL'],
  ['shinL', 'footL'],
  ['hips', 'thighR'],
  ['thighR', 'shinR'],
  ['shinR', 'footR'],
];

const JOINTS = [...new Set(LINKS.flat())];

export interface BoneOverlayProps {
  /** Live bones, by exported name. Read every frame, never a dependency. */
  bones: React.RefObject<Record<string, THREE.Object3D | undefined> | null>;
  /** Drawn bright; everything else is dimmed. */
  highlight?: readonly string[];
  show?: boolean;
}

export default function BoneOverlay({
  bones,
  highlight = ['neck1', 'neck2', 'neck3', 'neck4', 'head'],
  show = true,
}: BoneOverlayProps) {
  const lines = useRef<THREE.LineSegments>(null);
  const dots = useRef<THREE.InstancedMesh>(null);

  const hot = useMemo(() => new Set(highlight), [highlight]);

  const { lineGeom, lineMat, dotGeom, dotMat, colors } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(LINKS.length * 6), 3),
    );
    // Per-vertex colour so the edited chain can be brighter than the rest
    // without needing a second draw call.
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(LINKS.length * 6), 3));
    return {
      lineGeom: g,
      lineMat: new THREE.LineBasicMaterial({
        vertexColors: true,
        depthTest: false,
        transparent: true,
        opacity: 0.95,
      }),
      dotGeom: new THREE.SphereGeometry(1, 8, 6),
      dotMat: new THREE.MeshBasicMaterial({ depthTest: false, transparent: true, opacity: 0.95 }),
      colors: { hot: new THREE.Color('#ffd23f'), cold: new THREE.Color('#7b8794') },
    };
  }, []);

  const scratch = useMemo(
    () => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), m: new THREE.Matrix4() }),
    [],
  );

  useFrame(() => {
    const map = bones.current;
    const seg = lines.current;
    const dot = dots.current;
    if (!map || !seg || !dot || !show) return;

    const pos = seg.geometry.attributes.position as THREE.BufferAttribute;
    const col = seg.geometry.attributes.color as THREE.BufferAttribute;
    const { a, b, m } = scratch;

    LINKS.forEach(([from, to], i) => {
      const pa = map[from];
      const pb = map[to];
      // Collapse a missing link to a zero-length segment rather than leaving
      // last frame's positions, which would freeze a stale bone on screen.
      if (!pa || !pb) {
        pos.setXYZ(i * 2, 0, -999, 0);
        pos.setXYZ(i * 2 + 1, 0, -999, 0);
        return;
      }
      pa.getWorldPosition(a);
      pb.getWorldPosition(b);
      pos.setXYZ(i * 2, a.x, a.y, a.z);
      pos.setXYZ(i * 2 + 1, b.x, b.y, b.z);
      const c = hot.has(from) && hot.has(to) ? colors.hot : colors.cold;
      col.setXYZ(i * 2, c.r, c.g, c.b);
      col.setXYZ(i * 2 + 1, c.r, c.g, c.b);
    });
    pos.needsUpdate = true;
    col.needsUpdate = true;

    JOINTS.forEach((name, i) => {
      const bone = map[name];
      if (!bone) {
        m.makeScale(0, 0, 0);
        dot.setMatrixAt(i, m);
        return;
      }
      bone.getWorldPosition(a);
      const r = hot.has(name) ? 0.022 : 0.014;
      m.makeScale(r, r, r).setPosition(a);
      dot.setMatrixAt(i, m);
      dot.setColorAt(i, hot.has(name) ? colors.hot : colors.cold);
    });
    dot.instanceMatrix.needsUpdate = true;
    if (dot.instanceColor) dot.instanceColor.needsUpdate = true;
  });

  if (!show) return null;

  return (
    <group renderOrder={999}>
      <lineSegments ref={lines} geometry={lineGeom} material={lineMat} frustumCulled={false} />
      <instancedMesh
        ref={dots}
        args={[dotGeom, dotMat, JOINTS.length]}
        frustumCulled={false}
      />
    </group>
  );
}
