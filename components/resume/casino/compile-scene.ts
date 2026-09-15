import { REVISION, type Camera, type Object3D, type RenderTarget } from 'three'
import type { Renderer } from 'three/webgpu'

type PipelineBackend = {
  isWebGPUBackend?: boolean
  createRenderPipeline: (object: unknown, promises: Promise<unknown>[] | null) => void
}

/** Collect the colour-only variants not exercised by the all-pass preflight. */
export function compileVisibleScene(renderer: Renderer, scene: Object3D, camera: Camera, target: RenderTarget): Promise<void> {
  const previous = renderer.getRenderTarget()
  const saved: [Object3D, boolean, boolean][] = []
  scene.traverse(object => {
    saved.push([object, object.visible, object.frustumCulled])
    object.visible = true
    object.frustumCulled = false
  })
  try {
    renderer.setRenderTarget(target)
    return compileScene(renderer, scene, camera)
  } finally {
    renderer.setRenderTarget(previous)
    for (const [object, visible, culled] of saved) {
      object.visible = visible
      object.frustumCulled = culled
    }
  }
}

/** r185 builds nodes serially, but needlessly waits for each GPU pipeline too.
 * Keep node building/yields intact; overlap at most eight GPU jobs. This adapter
 * is scoped to covered warmup only, and falls back on unreviewed Three versions.
 * r185 includes the shared descriptor reset fix (three.js PR #33794).
 */
export async function compileScene(renderer: Renderer, scene: Object3D, camera: Camera): Promise<void> {
  const backend = renderer.backend as unknown as PipelineBackend
  if (REVISION !== '185' || !backend.isWebGPUBackend) {
    await renderer.compileAsync(scene, camera)
    return
  }
  await batchPipelineCompilation(backend, () => renderer.compileAsync(scene, camera))
}

const active = new WeakSet<PipelineBackend>()

export async function batchPipelineCompilation(backend: PipelineBackend, compile: () => Promise<unknown>): Promise<void> {
  // Never nest adapters on one renderer.
  if (active.has(backend)) throw new Error('Scene compilation is already in progress')
  active.add(backend)
  const ownMethod = Object.getOwnPropertyDescriptor(backend, 'createRenderPipeline')
  const original = backend.createRenderPipeline
  const pending = new Set<Promise<unknown>>()
  const all: Promise<unknown>[] = []
  backend.createRenderPipeline = function (object, promises) {
    if (promises === null) return original.call(this, object, promises)
    const jobs: Promise<unknown>[] = []
    original.call(this, object, jobs)
    for (const job of jobs) {
      // Attach rejection handling immediately, even before the batch is full.
      pending.add(job)
      void job.then(() => pending.delete(job), () => pending.delete(job))
      all.push(job)
    }
    if (pending.size >= 8) {
      // Refill as soon as a slot opens, rather than waiting for a whole batch.
      promises.push(Promise.race(pending))
    }
  }
  try {
    await compile()
    await Promise.all(all)
  } finally {
    // Even a failed/cancelled compile must drain jobs before restoring/disposal.
    await Promise.allSettled(all)
    if (ownMethod) Object.defineProperty(backend, 'createRenderPipeline', ownMethod)
    else delete (backend as Partial<PipelineBackend>).createRenderPipeline
    active.delete(backend)
  }
}
