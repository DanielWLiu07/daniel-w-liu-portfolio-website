'use client';

/**
 * The generated goose, three ways: its own texture, the node-system toon shader
 * over that texture, and the shader alone.
 *
 * The middle one is the point. "Colour" and "shader" are not alternatives —
 * the ramp multiplies into the model's base colour, so it stays a white goose
 * with an orange bill AND picks up flat cel bands.
 */

import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useCallback, useState } from 'react';
import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import type { Graph, GraphNode } from 'blender-to-threejs';

import GooseGlb from '@/components/three/goose/goose-glb';
import { toonShade } from '@/components/three/shader-presets';

type Mode = 'texture' | 'toon' | 'toon-ease';

export default function GooseGlbPage() {
  const [mode, setMode] = useState<Mode>('toon');

  const shade = useCallback(
    (g: Graph, base: GraphNode) => toonShade(g, base, mode === 'toon-ease' ? 'EASE' : 'CONSTANT'),
    [mode],
  );

  const btn = (active: boolean) =>
    `px-3 py-2 rounded font-mono text-[11px] transition-colors ${
      active ? 'bg-neutral-900 text-neutral-50' : 'bg-neutral-200/70 text-neutral-700 hover:bg-neutral-300'
    }`;

  return (
    <div className="w-full h-screen bg-[#e8e4d8] relative">
      <Canvas
        camera={{ position: [1.9, 1.2, 2.5], fov: 42 }}
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
        <group position={[0, -0.85, 0]}>
          <GooseGlb
            key={mode}
            src="/models/goose.glb"
            shade={mode === 'texture' ? undefined : shade}
            trackPointer={false}
            fitHeight={1.7}
          />
        </group>
        <OrbitControls makeDefault target={new THREE.Vector3(0, 0, 0)} />
      </Canvas>

      <div className="absolute top-24 left-6 flex flex-col gap-1">
        <span className="font-mono text-[11px] text-neutral-500 uppercase tracking-wide">shading</span>
        <button onClick={() => setMode('texture')} className={btn(mode === 'texture')}>
          texture only
        </button>
        <button onClick={() => setMode('toon')} className={btn(mode === 'toon')}>
          texture × toon ramp
        </button>
        <button onClick={() => setMode('toon-ease')} className={btn(mode === 'toon-ease')}>
          texture × ramp (EASE)
        </button>
      </div>

      <div className="absolute bottom-5 left-6 font-mono text-[11px] text-neutral-600">
        Meshy mesh + Blender-exact Color Ramp · drag to orbit
      </div>
    </div>
  );
}
