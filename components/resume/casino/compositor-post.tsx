'use client'

/**
 * Renders the R3F scene through a blender-to-threejs compositor graph.
 * Priority 1 in useFrame takes over rendering from R3F. The graph is built once
 * per mount by `build`; per-frame knobs go through `onFrame(uniforms)`.
 */
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Compositor, compGraph, type CompGraph, type CompInput, type CompositorOptions } from 'blender-to-threejs'

type Uniforms = Compositor['uniforms']

export default function CompositorPost({
  build,
  onFrame,
  onReady,
  rawOutput = false,
  renderScale = 1,
  positionPass = 'always',
  positionDirty,
}: {
  build: (c: CompGraph) => CompInput
  onFrame?: (uniforms: Uniforms, elapsed: number) => void
  onReady?: () => void
  /** bypass tone mapping + sRGB on the final blit (pomme's pass does) */
  rawOutput?: boolean
  /** internal resolution fraction (painterly graphs hide 0.6-0.8) */
  renderScale?: number
  positionPass?: CompositorOptions['positionPass']
  /** returns true on frames where objects moved (position pass must re-render in 'onChange' mode) */
  positionDirty?: () => boolean
}) {
  const { gl, scene, camera } = useThree()
  const compRef = useRef<Compositor | null>(null)
  const ready = useRef(false)

  useEffect(() => {
    const c = compGraph()
    const out = build(c)
    const comp = new Compositor(gl as never, scene, camera, out, { rawOutput, renderScale, positionPass })
    compRef.current = comp
    return () => {
      comp.dispose()
      compRef.current = null
    }
  }, [gl, scene, camera, build, rawOutput, renderScale, positionPass])

  useFrame(({ clock }) => {
    const comp = compRef.current
    if (!comp) return
    onFrame?.(comp.uniforms, clock.elapsedTime)
    if (positionDirty?.()) comp.invalidatePosition()
    comp.render()
    if (!ready.current) {
      ready.current = true
      onReady?.()
    }
  }, 1)
  return null
}
