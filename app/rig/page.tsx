'use client';

/**
 * Rig bench: the generated goose, skinned in the browser, with draggable joints.
 *
 * Meshy will not rig a bird, so the skeleton and skin weights are computed here
 * — see auto-rig.ts. This page exists to answer the question that matters about
 * any rig: does it bend where a goose bends, or does it tear?
 */

import { OrbitControls, useGLTF } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useMemo, useState } from 'react';
import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { compileMaterial, graph, type GraphNode } from 'blender-to-threejs';

import {
  GOOSE_LAYOUT,
  GOOSE_LAYOUT_NO_WINGS,
  rigMesh,
  type Rig,
} from '@/components/three/goose/auto-rig';
import BoneHandles from '@/components/three/goose/bone-handles';
import { flatToonShade, toonShade } from '@/components/three/shader-presets';

const DEFAULT_SRC = '/models/goose.glb';

type Look = 'texture' | 'toon' | 'flat';

function Rigged({
  src,
  wings,
  look,
  showBones,
  onRig,
  onDragChange,
}: {
  src: string;
  wings: boolean;
  look: Look;
  showBones: boolean;
  onRig: (rig: Rig) => void;
  onDragChange: (d: boolean) => void;
}) {
  const { scene } = useGLTF(src);

  const { mesh, rig } = useMemo(() => {
    const result = rigMesh(scene, wings ? GOOSE_LAYOUT : GOOSE_LAYOUT_NO_WINGS);
    onRig(result.rig);
    return result;
  }, [scene, wings, onRig]);

  // Node-system material over the model's own texture, so shading never costs
  // the colour. Built from the ORIGINAL material — rigMesh copies the reference
  // before anything replaces it.
  const original = useMemo(() => mesh.material as THREE.Material, [mesh]);

  const materials = useMemo(() => {
    const base = original as THREE.MeshStandardMaterial;
    const build = (fn: (g: ReturnType<typeof graph>, t: GraphNode) => GraphNode) => {
      const g = graph();
      const tex = base?.map ? g.texture(base.map) : g.rgb(1, 1, 1);
      return compileMaterial(fn(g, tex));
    };
    return {
      toon: build((g, t) => toonShade(g, t)),
      flat: build((g, t) => flatToonShade(g, t)),
    };
  }, [original]);

  // A model whose colour lives in per-material values rather than a texture is
  // already the flat look — replacing it can only lose information.
  const hasTexture = Array.isArray(original)
    ? original.some((m) => (m as THREE.MeshStandardMaterial).map)
    : Boolean((original as THREE.MeshStandardMaterial).map);
  mesh.material = !hasTexture || look === 'texture'
    ? original
    : look === 'flat'
      ? materials.flat
      : materials.toon;

  // Normalise to a workable size regardless of what the exporter produced.
  const fit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());
    const k = 1.8 / (size.y || 1);
    return { k, y: -box.min.y * k - 0.9 };
  }, [mesh]);

  return (
    <group scale={fit.k} position={[0, fit.y, 0]}>
      <primitive object={mesh} />
      {showBones && <BoneHandles rig={rig} onDragChange={onDragChange} size={0.026 / fit.k} />}
    </group>
  );
}

function RigBench() {
  const params = useSearchParams();
  const src = params.get('src') ?? DEFAULT_SRC;
  // The game's goose has no wings, so that is the default. ?wings=1 restores
  // them for a mesh that actually has wing geometry to move.
  const wings = params.get('wings') === '1';
  const [look, setLook] = useState<Look>('flat');
  const [showBones, setShowBones] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [rig, setRig] = useState<Rig | null>(null);

  const onRig = useCallback((r: Rig) => setRig(r), []);

  const reset = useCallback(() => {
    rig?.bones.forEach((b) => b.quaternion.identity());
  }, [rig]);

  const btn = (active: boolean) =>
    `px-3 py-2 rounded font-mono text-[11px] transition-colors ${
      active ? 'bg-neutral-900 text-neutral-50' : 'bg-neutral-200/70 text-neutral-700 hover:bg-neutral-300'
    }`;

  return (
    <div className="w-full h-screen bg-[#e8e4d8] relative">
      <Canvas
        camera={{ position: [2.0, 1.1, 2.7], fov: 42 }}
        gl={async (props) => {
          const renderer = new WebGPURenderer({
            canvas: props.canvas as HTMLCanvasElement,
            antialias: true,
          });
          await renderer.init();
          return renderer as unknown as never;
        }}
      >
        <hemisphereLight args={[0xffffff, 0x9a9484, 1.2]} />
        <directionalLight position={[3, 5, 2]} intensity={2} />
        <Suspense fallback={null}>
          <Rigged
            key={`${src}-${wings}`}
            src={src}
            wings={wings}
            look={look}
            showBones={showBones}
            onRig={onRig}
            onDragChange={setDragging}
          />
        </Suspense>
        {/* Orbit has to yield while a joint is being dragged, or every drag
            spins the camera instead of posing the bird. */}
        <OrbitControls makeDefault enabled={!dragging} target={new THREE.Vector3(0, 0, 0)} />
      </Canvas>

      <div className="absolute top-24 left-6 flex flex-col gap-1 w-44">
        <span className="font-mono text-[11px] text-neutral-500 uppercase tracking-wide">rig bench</span>
        <button onClick={() => setShowBones((v) => !v)} className={btn(showBones)}>
          bones {showBones ? 'on' : 'off'}
        </button>
        <button onClick={() => setLook('flat')} className={btn(look === 'flat')}>
          flat colour
        </button>
        <button onClick={() => setLook('toon')} className={btn(look === 'toon')}>
          textured toon
        </button>
        <button onClick={() => setLook('texture')} className={btn(look === 'texture')}>
          raw texture
        </button>
        <button onClick={reset} className={btn(false)}>
          reset pose
        </button>
      </div>

      <div className="absolute bottom-5 left-6 font-mono text-[11px] text-neutral-600 max-w-xl">
        drag a joint to pose it · orbit is disabled while dragging ·{' '}
        {rig?.bones.length ?? 0} bones{wings ? '' : ', no wings'}, skin weights computed in-browser
        <div className="mt-1 text-neutral-500">{src}</div>
      </div>
    </div>
  );
}

export default function RigPage() {
  return (
    <Suspense fallback={<div className="w-full h-screen bg-[#e8e4d8]" />}>
      <RigBench />
    </Suspense>
  );
}
