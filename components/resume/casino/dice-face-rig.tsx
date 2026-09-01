'use client'

/** One die face, square on, so the pip layout can be counted rather than judged. */
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'
import Die from './dice'

export default function DiceFaceRig({ value }: { value: number }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#7a7a7a', zIndex: 100000 }}>
      <Canvas
        dpr={1}
        flat
        orthographic
        camera={{ position: [0, 2, 0.0001], zoom: 420, up: [0, 0, -1] }}
        gl={async (props) => {
          const r = new WebGPURenderer({ canvas: props.canvas as HTMLCanvasElement, antialias: true })
          await r.init()
          return r as unknown as never
        }}
      >
        <color attach="background" args={['#7a7a7a']} />
        <Die value={value} ink="white" pipInk="black" position={[0, 0, 0]} />
      </Canvas>
    </div>
  )
}
