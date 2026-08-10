'use client';

/**
 * Shader playground.
 *
 * A place to point the node system at a mesh and see what it does. Orbit to
 * inspect, switch the graph, switch the mesh. Every preset states what it
 * SHOULD look like, because a shader bug that produces a plausible picture is
 * the failure mode this whole project exists to catch — without a stated
 * expectation you are just looking at colours and nodding.
 */

import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useMemo, useState } from 'react';
import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { compileMaterial } from 'blender-to-threejs';

import { createGoose } from '@/components/three/goose/goose-model';
import { DEFAULT_PRESET, PRESETS } from '@/components/three/shader-presets';

type ShapeKey = 'sphere' | 'goose' | 'plane' | 'knot';

function Subject({ shape, presetKey }: { shape: ShapeKey; presetKey: string }) {
  const material = useMemo(
    () => compileMaterial(PRESETS[presetKey].build()),
    [presetKey],
  );

  // The goose is a SkinnedMesh, so it is built rather than declared. Rebuilt
  // when the material changes because bind() ties a skeleton to one mesh.
  const goose = useMemo(
    () => (shape === 'goose' ? createGoose(material) : null),
    [shape, material],
  );

  if (goose) {
    return (
      <group position={[0, -0.6, 0]} scale={1.15}>
        <primitive object={goose.mesh} />
      </group>
    );
  }

  return (
    <mesh>
      {shape === 'sphere' && <sphereGeometry args={[1, 64, 32]} />}
      {shape === 'plane' && <planeGeometry args={[2, 2, 1, 1]} />}
      {shape === 'knot' && <torusKnotGeometry args={[0.7, 0.26, 160, 24]} />}
      <primitive object={material} attach="material" />
    </mesh>
  );
}

export default function ShaderPlaygroundPage() {
  const [presetKey, setPresetKey] = useState(DEFAULT_PRESET);
  const [shape, setShape] = useState<ShapeKey>('goose');
  const preset = PRESETS[presetKey];

  const entries = Object.entries(PRESETS);
  const blender = entries.filter(([, p]) => p.kind === 'blender');
  const probes = entries.filter(([, p]) => p.kind === 'probe');

  const btn = (active: boolean) =>
    `px-2.5 py-1.5 rounded text-left transition-colors ${
      active ? 'bg-neutral-900 text-neutral-50' : 'bg-neutral-200/70 text-neutral-700 hover:bg-neutral-300'
    }`;

  return (
    <div className="w-full h-screen bg-[#e8e4d8] relative">
      <Canvas
        camera={{ position: [2.1, 1.3, 2.6], fov: 40 }}
        gl={async (props) => {
          const renderer = new WebGPURenderer({
            canvas: props.canvas as HTMLCanvasElement,
            antialias: true,
          });
          await renderer.init();
          return renderer as unknown as never;
        }}
      >
        <Subject shape={shape} presetKey={presetKey} />
        <OrbitControls makeDefault target={new THREE.Vector3(0, 0, 0)} />
      </Canvas>

      <div className="absolute top-24 left-6 w-64 font-mono text-[11px] flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-neutral-500 uppercase tracking-wide">mesh</span>
          <div className="grid grid-cols-2 gap-1">
            {(['goose', 'sphere', 'knot', 'plane'] as ShapeKey[]).map((s) => (
              <button key={s} onClick={() => setShape(s)} className={btn(shape === s)}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-neutral-500 uppercase tracking-wide">mirrored from blender</span>
          {blender.map(([k, p]) => (
            <button key={k} onClick={() => setPresetKey(k)} className={btn(presetKey === k)}>
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-neutral-500 uppercase tracking-wide">semantics probes</span>
          {probes.map(([k, p]) => (
            <button key={k} onClick={() => setPresetKey(k)} className={btn(presetKey === k)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="absolute bottom-5 left-6 right-6 font-mono text-[11px] text-neutral-600 flex gap-2">
        <span className="text-neutral-400 shrink-0">expect:</span>
        <span>{preset.expect}</span>
      </div>
      <div className="absolute bottom-5 right-6 font-mono text-[11px] text-neutral-400">
        drag to orbit · scroll to zoom
      </div>
    </div>
  );
}
