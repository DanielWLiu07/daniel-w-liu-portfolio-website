'use client'

/**
 * Integration spike: does a graph-authored material survive the trip from the
 * node system into this app?
 *
 * Not a design page. It answers three questions that all had to be true before
 * any landing work was worth starting:
 *
 *   1. Does R3F accept a WebGPURenderer here, at this three version?
 *   2. Does `blender-to-threejs` import and compile inside a Next build?
 *   3. Do Blender's semantics actually survive — or does the alias/bundling
 *      setup quietly hand us TSL's behaviour instead?
 *
 * Question 3 is why these two graphs specifically. Both are cases where plain
 * TSL and Blender disagree, so a correct picture is evidence and a wrong one
 * names its own cause. A generic gradient would look identical either way and
 * prove nothing.
 *
 * Delete this route once the landing is real.
 */

import { Canvas } from '@react-three/fiber'
import { useMemo } from 'react'
import { WebGPURenderer } from 'three/webgpu'
import { compileMaterial, graph } from 'blender-to-threejs'

/**
 * MapRange with a descending output range and clamp on. Blender clamps
 * order-aware — between toMin and toMax whichever way round they are — so this
 * saturates over most of the surface with a narrow ramp at one edge. A naive
 * clamp to [0,1] produces a completely different picture.
 */
function bandsMaterial() {
  const g = graph()
  const band = g.mapRange(g.separate(g.uv(), 'x'), {
    from: [0, 1],
    to: [-0.62, 4.56],
    clamp: true,
  })
  return compileMaterial(g.blend(band, g.rgb(0.1, 0.1, 0.12), g.rgb(1, 0.95, 0.9)))
}

/**
 * The flagship claim, made visible: Blender's DIVIDE is safe_divide, so a zero
 * denominator yields 0. Plain `a / b` yields Infinity, which propagates through
 * everything downstream of it. Uniform black means the guard held.
 */
function safeDivideMaterial() {
  const g = graph()
  return compileMaterial(g.divide(g.separate(g.uv(), 'x'), 0))
}

function Spike() {
  const bands = useMemo(bandsMaterial, [])
  const safeDivide = useMemo(safeDivideMaterial, [])

  return (
    <>
      <mesh position={[-1.3, 0, 0]}>
        <sphereGeometry args={[1, 64, 32]} />
        <primitive object={bands} attach="material" />
      </mesh>
      <mesh position={[1.3, 0, 0]}>
        <sphereGeometry args={[1, 64, 32]} />
        <primitive object={safeDivide} attach="material" />
      </mesh>
    </>
  )
}

export default function Spike3DPage() {
  return (
    <div className="w-full h-screen bg-neutral-900 relative">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        // R3F 9's GLProps accepts an async factory. WebGPURenderer needs its
        // init() awaited before the first frame, and it falls back to WebGL2
        // on its own where WebGPU is unavailable — "WebGPU" is the renderer's
        // name, not a hard requirement.
        gl={async (props) => {
          const renderer = new WebGPURenderer({
            canvas: props.canvas as HTMLCanvasElement,
            antialias: true,
          })
          await renderer.init()
          return renderer as unknown as never
        }}
      >
        <Spike />
      </Canvas>

      <div className="absolute bottom-0 left-0 right-0 p-4 text-xs font-mono text-neutral-400 bg-neutral-900/80 space-y-1">
        <div>
          <span className="text-neutral-200">left</span> — bands: mostly saturated
          cream, narrow dark ramp at one edge. A flat or half-and-half sphere means
          the clamp is not order-aware.
        </div>
        <div>
          <span className="text-neutral-200">right</span> — safe-divide: uniform
          black. Any white, speckle, or NaN garbage means divide-by-zero leaked.
        </div>
      </div>
    </div>
  )
}
