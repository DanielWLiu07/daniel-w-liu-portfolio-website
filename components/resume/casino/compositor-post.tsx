'use client'

/**
 * Renders the R3F scene through a blender-to-threejs compositor graph.
 * Priority 1 in useFrame takes over rendering from R3F. The graph is built once
 * per mount by `build`; per-frame knobs go through `onFrame(uniforms)`.
 */
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { HalfFloatType, RenderTarget, Vector2, type Object3D } from 'three'
import { texture } from 'three/tsl'
import { MeshBasicNodeMaterial, QuadMesh, type Renderer } from 'three/webgpu'
import { Compositor, compGraph, withOverlay, type CompGraph, type CompInput, type CompositorOptions } from 'blender-to-threejs'

type Uniforms = Compositor['uniforms']

export default function CompositorPost({
  build,
  onFrame,
  onReady,
  rawOutput = false,
  renderScale = 1,
  positionPass = 'always',
  positionDirty,
  warmupReady,
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
  /** Wait for required actors to mount, then compile their offscreen materials under the loading cover. */
  warmupReady?: boolean
}) {
  const { gl, scene, camera } = useThree()
  const compRef = useRef<Compositor | null>(null)
  const ready = useRef(false)
  const outputRef = useRef<{ target: RenderTarget; quad: QuadMesh } | null>(null)
  const bufferSize = useRef(new Vector2())
  const prepared = useRef(warmupReady === undefined)
  const preparation = useRef<Promise<void> | null>(null)

  useEffect(() => {
    const c = compGraph()
    const out = build(c)
    const comp = new Compositor(gl as never, scene, camera, out, { rawOutput, positionPass })
    compRef.current = comp
    // The paint expression used to run on the full-size canvas even when every
    // input was scaled. Finish it at the same resolution, then only upscale a
    // texture. Restrict this to raw output so no display transform runs twice.
    const target = new RenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false })
    target.texture.name = 'casino:paint-output'
    const material = new MeshBasicNodeMaterial()
    material.fragmentNode = texture(target.texture)
    material.depthTest = false
    material.depthWrite = false
    const quad = new QuadMesh(material)
    outputRef.current = { target, quad }
    return () => {
      target.dispose()
      material.dispose()
      outputRef.current = null
      if (preparation.current) void preparation.current.then(() => comp.dispose())
      else comp.dispose()
      compRef.current = null
    }
  }, [gl, scene, camera, build, rawOutput, positionPass])

  useEffect(() => {
    prepared.current = warmupReady === undefined
    if (!warmupReady || !compRef.current) return
    let cancelled = false
    const renderer = gl as unknown as Renderer
    const previous = renderer.getRenderTarget()
    // compileAsync gathers its render list synchronously before yielding. Include
    // props below the frame and actors hidden until impact, then restore them.
    const visibility: [Object3D, boolean, boolean][] = []
    scene.traverse((object) => {
      visibility.push([object, object.visible, object.frustumCulled])
      object.visible = true
      object.frustumCulled = false
    })
    renderer.setRenderTarget(compRef.current.sceneTarget)
    const job = renderer.compileAsync(scene, camera)
    // compileAsync does not own the render target while its GPU work is pending.
    renderer.setRenderTarget(previous)
    for (const [object, visible, culled] of visibility) {
      object.visible = visible
      object.frustumCulled = culled
    }
    preparation.current = job.catch((error: unknown) => {
      console.warn('Casino shader preparation failed; continuing with normal rendering.', error)
    }).then(() => {
      if (!cancelled) prepared.current = true
    })
    return () => { cancelled = true }
  }, [gl, scene, camera, build, rawOutput, positionPass, warmupReady])

  useFrame(({ clock }) => {
    const comp = compRef.current
    if (!comp || !prepared.current) return
    // Resize existing targets; rebuilding the graph here discards warmed GPU
    // pipelines and introduces a hitch each time adaptive quality changes.
    comp.setRenderScale(renderScale)
    onFrame?.(comp.uniforms, clock.elapsedTime)
    if (positionDirty?.()) comp.invalidatePosition()
    const output = outputRef.current
    if (rawOutput && renderScale < 1 && output) {
      const size = gl.getDrawingBufferSize(bufferSize.current)
      const scale = Math.min(1, Math.max(0.25, renderScale))
      const width = Math.max(1, Math.floor(size.x * scale))
      const height = Math.max(1, Math.floor(size.y * scale))
      if (output.target.width !== width || output.target.height !== height) output.target.setSize(width, height)
      const previous = gl.getRenderTarget()
      // Crisp print and editor helpers belong after the upscale. withOverlay
      // rebuilds their occlusion depth on the final target, not the paint target.
      withOverlay(gl as unknown as Renderer, scene, camera, () => {
        comp.render(output.target)
        gl.setRenderTarget(previous)
        output.quad.render(gl as unknown as Renderer)
      })
    } else comp.render()
    if (!ready.current) {
      ready.current = true
      onReady?.()
    }
  }, 1)
  return null
}
