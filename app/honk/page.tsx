'use client';

/**
 * The goose: rigged in Blender, a jaw that opens, and a neck that follows the
 * pointer.
 *
 * The bill is genuinely split into two mandibles with a red interior. Getting
 * there took four attempts; the rig script records why the first three failed.
 *
 * Unlike /rig this does NOT auto-rig — the GLB already carries a skeleton and
 * bone-heat weights, which are better than anything the browser heuristic
 * produces. All this does is drive the bones that are already there.
 */

import { OrbitControls, useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';

import { useNeckTracking } from '@/components/three/goose/use-neck-tracking';

const SRC = '/models/goose-rigged.glb';
const NECK = ['neck1', 'neck2', 'neck3', 'neck4', 'head'];
/** Radians at 100%. Calibrated by measuring how far the bill's bottom drops. */
const JAW_OPEN = 0.42;

/** Soft blob shadow: one quad with a radial-falloff alpha texture. */
function GroundShadow({ y, radius }: { y: number; radius: number }) {
  const texture = useMemo(() => {
    const S = 128;
    const data = new Uint8Array(S * S * 4);
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const dx = (i / (S - 1)) * 2 - 1;
        const dy = (j / (S - 1)) * 2 - 1;
        const d = Math.min(1, Math.hypot(dx, dy));
        // Squared falloff reads as a soft contact shadow; linear looks like a
        // painted disc with a visible rim.
        const a = Math.pow(1 - d, 2.1);
        const k = (j * S + i) * 4;
        data[k] = 74; data[k + 1] = 68; data[k + 2] = 54;
        data[k + 3] = Math.round(a * 150);
      }
    }
    const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
    t.needsUpdate = true;
    return t;
  }, []);

  return (
    <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
      <planeGeometry args={[radius * 2, radius * 2]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}

/**
 * Frame the head from the side.
 *
 * Orbiting there by hand is fiddly and my headless attempts kept overshooting
 * past the head into the body. A preset makes "look at the mouth" repeatable —
 * which matters because that is the only angle from which the bill's interior
 * is visible at all.
 */
function HeadView({ root, on }: { root: THREE.Object3D | null; on: boolean }) {
  const { camera, controls } = useThree();
  useEffect(() => {
    if (!on || !root) return;
    const head = root.getObjectByName('head');
    if (!head) return;
    const w = new THREE.Vector3();
    head.getWorldPosition(w);
    camera.position.set(w.x - 0.95, w.y + 0.02, w.z + 0.30);
    camera.lookAt(w);
    const c = controls as unknown as { target?: THREE.Vector3; update?: () => void } | null;
    if (c?.target) {
      c.target.copy(w);
      c.update?.();
    }
  }, [on, root, camera, controls]);
  return null;
}

function Goose({ open, honking, track, headView }: { open: number; honking: boolean; track: boolean; headView: boolean }) {
  const group = useRef<THREE.Group>(null);
  const { scene } = useGLTF(SRC);

  const { root, jaw, chain } = useMemo(() => {
    const r = scene;
    r.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.frustumCulled = false;
      m.castShadow = true;
      // UNLIT. The source materials are Emission shaders — they do not respond
      // to light, which is exactly why the game's goose reads as flat colour.
      // Exporting them as base colour on a lit material put soft grey gradients
      // all over a bird that should have none, and no amount of light-tuning
      // fixes that because the problem is that it is being lit at all.
      const swap = (mat: THREE.Material) => {
        const src = mat as THREE.MeshStandardMaterial;
        const flat = new THREE.MeshBasicMaterial({
          color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
          map: src.map ?? null,
          side: src.side,
        });
        flat.name = src.name;
        return flat;
      };
      m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
    });
    return {
      root: r,
      jaw: r.getObjectByName('jaw') as THREE.Bone | undefined,
      chain: NECK.map((n) => r.getObjectByName(n)).filter(Boolean) as THREE.Object3D[],
    };
  }, [scene]);

  const fit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const k = 1.9 / (size.y || 1);
    return { k, y: -box.min.y * k - 0.95 };
  }, [root]);

  /**
   * The jaw's REST rotation, captured once.
   *
   * Blender bones carry a rest orientation — this one is (0.4875, 0, 0, 0.8731),
   * about 58 degrees about X. Calling `jaw.rotation.set(0, 0, 0)` does not mean
   * "unrotated", it means "overwrite that rest orientation with identity", which
   * snaps the lower mandible 58 degrees out of place and drives it up through
   * the upper bill even at 0%.
   *
   * Compose onto the rest value; never replace it.
   */
  const jawRest = useMemo(() => (jaw ? jaw.quaternion.clone() : new THREE.Quaternion()), [jaw]);
  const jawDelta = useMemo(() => new THREE.Quaternion(), []);
  const jawEuler = useMemo(() => new THREE.Euler(), []);

  const t = useRef(0);
  useFrame((_, delta) => {
    if (!jaw) return;
    t.current += delta;
    // A honk is a fast open and a slower close, not a sine — a symmetric
    // oscillation reads as chewing.
    const cycle = honking ? Math.max(0, Math.sin(t.current * 7) ** 3) : 0;
    const amount = Math.max(open, cycle);
    // Sign settled by MEASUREMENT, not by looking: reading skinned vertex
    // positions is the only reliable way to tell which way a joint moved,
    // because neck tracking shifts the head at the same time.
    jawEuler.set(amount * JAW_OPEN, 0, 0);
    jaw.quaternion.copy(jawRest).multiply(jawDelta.setFromEuler(jawEuler));
  });

  // Debug handle so the rig can be MEASURED rather than eyeballed — reading
  // skinned vertex positions is the only way to settle which way a joint
  // actually moves. Dev only.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    (window as unknown as Record<string, unknown>).__goose = { root, jaw, THREE };
  }, [root, jaw]);

  useNeckTracking({ bones: chain, root: group, enabled: track });

  return (
    <group ref={group} scale={fit.k} position={[0, fit.y, 0]}>
      <primitive object={root} />
      <HeadView root={root} on={headView} />
    </group>
  );
}

export default function HonkPage() {
  const [open, setOpen] = useState(0);
  const [honking, setHonking] = useState(false);
  const [track, setTrack] = useState(true);
  const [headView, setHeadView] = useState(false);

  const btn = (active: boolean) =>
    `px-3 py-2 rounded font-mono text-[11px] transition-colors ${
      active ? 'bg-neutral-900 text-neutral-50' : 'bg-neutral-200/70 text-neutral-700 hover:bg-neutral-300'
    }`;

  return (
    <div className="w-full h-screen bg-[#e8e4d8] relative">
      <Canvas
        camera={{ position: [1.7, 1.15, 2.3], fov: 42 }}
        gl={async (props) => {
          const renderer = new WebGPURenderer({
            canvas: props.canvas as HTMLCanvasElement,
            antialias: true,
          });
          await renderer.init();
          return renderer as unknown as never;
        }}
      >
        {/* Unlit materials ignore these, but drei's shadow pass still needs a
            scene to render into. The shadow is doing all the grounding work. */}
        <Suspense fallback={null}>
          <Goose open={open} honking={honking} track={track} headView={headView} />
        </Suspense>
        {/* The other half of the look: flat colour reads as a sticker without
            something grounding it.

            NOT drei's ContactShadows — that renders a depth pass through the
            standard pipeline and came out as an opaque grey slab under
            WebGPURenderer. A plain textured quad needs no shadow pipeline at
            all, so it behaves the same on any backend. */}
        <GroundShadow y={-0.94} radius={1.05} />
        <OrbitControls makeDefault target={new THREE.Vector3(0, 0, 0)} />
      </Canvas>

      <div className="absolute top-24 left-6 flex flex-col gap-2 w-52">
        <span className="font-mono text-[11px] text-neutral-500 uppercase tracking-wide">goose</span>
        <label className="font-mono text-[11px] text-neutral-700 flex flex-col gap-1">
          jaw {Math.round(open * 100)}%
          <input
            type="range" min={0} max={1} step={0.01} value={open}
            onChange={(e) => setOpen(parseFloat(e.target.value))}
            className="w-full"
          />
        </label>
        <button onClick={() => setHonking((v) => !v)} className={btn(honking)}>
          {honking ? 'HONKING' : 'honk'}
        </button>
        <button onClick={() => setTrack((v) => !v)} className={btn(track)}>
          neck tracking {track ? 'on' : 'off'}
        </button>
        <button onClick={() => setHeadView((v) => !v)} className={btn(headView)}>
          look at mouth
        </button>
      </div>

      <div className="absolute bottom-5 left-6 font-mono text-[11px] text-neutral-600">
        rigged in Blender · 20 bones · bone-heat weights · split bill, red interior · model by stickbone (CC-BY)
      </div>
    </div>
  );
}
