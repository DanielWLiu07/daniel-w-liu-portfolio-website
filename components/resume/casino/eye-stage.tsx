'use client'

/**
 * /eye: a field of drawn eyes opening across the screen, all watching the pointer.
 *
 * Each eye is a CARD in the scene rather than a DOM overlay, so the compositor
 * gets at them the same way it gets at everything else: the lid lines bleed, the
 * arcs wobble, the gold blooms. An overlay would have been easier and would have
 * missed the entire point.
 *
 * Every decision is made in eye.ts, which the check tests: where each eye sits,
 * how big it is, when it opens, and where its iris may go. The materials only
 * draw. That is what makes "every eye looks at the cursor from where it is" a
 * property of tested code rather than of a shader nothing can assert about.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import type * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { COMP_GRAPHS } from './comp-graphs'
import CompositorPost from './compositor-post'
import { driveLamp, eyeMaterial } from './materials'
import { EYE_PLANE, gazeFor, inkFor, irisAt, openAt, scatterEyes, type EyeInstance } from './eye'

/** view space is exactly what scatterEyes lays out in: y -1 to 1, x -aspect to aspect */
function Fit({ onAspect }: { onAspect: (a: number) => void }) {
  const { camera, size } = useThree()
  useEffect(() => {
    const a = size.width / size.height
    const cam = camera as THREE.OrthographicCamera
    cam.left = -a
    cam.right = a
    cam.top = 1
    cam.bottom = -1
    cam.near = -10
    cam.far = 10
    cam.updateProjectionMatrix()
    onAspect(a)
  }, [camera, size.width, size.height, onAspect])
  return null
}

function OneEye({
  eye,
  index,
  paused,
  scrub,
  cursor,
}: {
  eye: EyeInstance
  index: number
  paused: boolean
  scrub?: number
  cursor: React.RefObject<[number, number]>
}) {
  // a material per eye: each carries its own open and iris uniforms
  const mat = useMemo(() => eyeMaterial(`eye${index}`, inkFor(index)), [index])
  const clock = useRef(0)
  useFrame((_, dt) => {
    if (!paused) clock.current += Math.min(dt, 1 / 20)
    const t = scrub !== undefined ? scrub : clock.current
    // each eye keeps its own blink cycle, so the field never blinks in lockstep
    const open = openAt(t - eye.delay, { phase: eye.phase, every: eye.every })
    const [ix, iy] = irisAt(gazeFor(eye, cursor.current?.[0] ?? 0, cursor.current?.[1] ?? 0), open)
    const u = (mat.userData.uniforms ?? {}) as Record<string, { value: number }>
    if (u.eyeOpen) u.eyeOpen.value = open
    if (u.eyeIrisX) u.eyeIrisX.value = ix
    if (u.eyeIrisY) u.eyeIrisY.value = iy
  })
  return (
    <mesh
      material={mat}
      position={[eye.x, eye.y, index * 1e-4]}
      rotation={[0, 0, eye.roll]}
      scale={eye.scale}
      renderOrder={index}
    >
      <planeGeometry args={[EYE_PLANE.w, EYE_PLANE.h]} />
    </mesh>
  )
}

function Field({ count, aspect, paused, scrub, cursor }: { count: number; aspect: number; paused: boolean; scrub?: number; cursor: React.RefObject<[number, number]> }) {
  const eyes = useMemo(() => scatterEyes(count, aspect), [count, aspect])
  return (
    <>
      {eyes.map((e, i) => (
        <OneEye key={i} eye={e} index={i} paused={paused} scrub={scrub} cursor={cursor} />
      ))}
    </>
  )
}

/** the pointer, in the same view space the eyes are laid out in */
function Watch({ cursor, aspect }: { cursor: React.RefObject<[number, number]>; aspect: number }) {
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      cursor.current = [
        (e.clientX / window.innerWidth - 0.5) * 2 * aspect,
        -(e.clientY / window.innerHeight - 0.5) * 2,
      ]
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [cursor, aspect])
  return null
}

function Lamp() {
  useEffect(() => {
    driveLamp({ x: 0, y: 3.2, z: 2.6, cone: 80, blend: 0.95, range: 40, ambient: 0.28, gain: 1.1 })
  }, [])
  return null
}

export default function EyeStage({
  comp = 'night',
  paused = false,
  scrub,
  count = 14,
}: {
  comp?: string
  paused?: boolean
  scrub?: number
  count?: number
}) {
  const entry = COMP_GRAPHS[comp] ?? COMP_GRAPHS.night
  const cursor = useRef<[number, number]>([0, 0])
  const [aspect, setAspect] = useState(16 / 9)
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0d0f0d', zIndex: 100000 }}>
      <Canvas
        dpr={[1, 1.75]}
        orthographic
        camera={{ position: [0, 0, 5], zoom: 1 }}
        gl={async (props) => {
          const renderer = new WebGPURenderer({ canvas: props.canvas as HTMLCanvasElement, antialias: true, alpha: false })
          await renderer.init()
          return renderer as unknown as never
        }}
      >
        <color attach="background" args={['#0d0f0d']} />
        <Fit onAspect={setAspect} />
        <Lamp />
        <Watch cursor={cursor} aspect={aspect} />
        <Suspense fallback={null}>
          <Field count={count} aspect={aspect} paused={paused} scrub={scrub} cursor={cursor} />
        </Suspense>
        {/**
          * positionPass ALWAYS. The wash is anchored to the world through a
          * position pass, and in 'onChange' it renders once and waits for an
          * invalidatePosition only the casino scene makes. Nothing here moves in
          * space, but the SHADERS do, and a stale pass keys the wash to shut
          * eyes while open ones are drawn under it.
          */}
        <CompositorPost
          build={entry.build}
          rawOutput={entry.rawOutput}
          renderScale={entry.renderScale ?? 1}
          positionPass="always"
        />
      </Canvas>
    </div>
  )
}
