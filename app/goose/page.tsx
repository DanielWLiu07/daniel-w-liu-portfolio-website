'use client';

/** Preview harness for the goose. Not a design page — a place to look at it. */

import { Canvas } from '@react-three/fiber';
import { useState } from 'react';
import { WebGPURenderer } from 'three/webgpu';

import Goose from '@/components/three/goose/goose';

export default function GoosePage() {
  const [walking, setWalking] = useState(false);
  const [tracking, setTracking] = useState(true);

  return (
    <div className="w-full h-screen bg-[#e8e4d8] relative">
      <Canvas
        camera={{ position: [1.6, 1.15, 2.4], fov: 40 }}
        gl={async (props) => {
          const renderer = new WebGPURenderer({
            canvas: props.canvas as HTMLCanvasElement,
            antialias: true,
          });
          await renderer.init();
          return renderer as unknown as never;
        }}
      >
        <group position={[0, -0.55, 0]}>
          <Goose walking={walking} trackPointer={tracking} rotation={[0, -0.5, 0]} />
        </group>
      </Canvas>

      <div className="absolute top-24 left-6 flex gap-2 font-mono text-xs">
        <button
          onClick={() => setWalking((v) => !v)}
          className="px-3 py-2 bg-neutral-900 text-neutral-100 rounded"
        >
          {walking ? 'waddling' : 'idle'}
        </button>
        <button
          onClick={() => setTracking((v) => !v)}
          className="px-3 py-2 bg-neutral-900 text-neutral-100 rounded"
        >
          tracking {tracking ? 'on' : 'off'}
        </button>
      </div>

      <div className="absolute bottom-5 left-6 font-mono text-xs text-neutral-600">
        move the pointer — the neck follows
      </div>
    </div>
  );
}
