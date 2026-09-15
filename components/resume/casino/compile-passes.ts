import { REVISION } from 'three'
import type { Renderer } from 'three/webgpu'

type Backend = {
  isWebGPUBackend?: boolean
  createRenderPipeline: (object: unknown, promises: Promise<unknown>[] | null) => void
  draw: (...args: unknown[]) => void
}

/** Discover the exact shadow/depth/compositor variants via the real render path.
 * During this covered preflight no geometry is drawn; missing pipelines compile
 * asynchronously. The caller MUST subsequently render and fence a real frame.
 * Kept separate from ordinary drawing, and guarded to the reviewed Three version.
 */
export function compileRenderPasses(renderer: Renderer, render: () => void): Promise<void> | null {
  const backend = renderer.backend as unknown as Backend
  if (REVISION !== '185' || !backend.isWebGPUBackend) return null
  return discoverPassPipelines(backend, render)
}

export async function discoverPassPipelines(backend: Backend, render: () => void): Promise<void> {
  const original = backend.createRenderPipeline
  const createDescriptor = Object.getOwnPropertyDescriptor(backend, 'createRenderPipeline')
  const drawDescriptor = Object.getOwnPropertyDescriptor(backend, 'draw')
  const jobs: Promise<unknown>[] = []
  backend.createRenderPipeline = function(object, promises) {
    const pending: Promise<unknown>[] = []
    original.call(this, object, pending)
    for (const job of pending) {
      void job.catch(() => {})
      jobs.push(job)
      promises?.push(job)
    }
  }
  backend.draw = () => {}
  try {
    try { render() } finally {
      if (createDescriptor) Object.defineProperty(backend, 'createRenderPipeline', createDescriptor)
      else delete (backend as Partial<Backend>).createRenderPipeline
      if (drawDescriptor) Object.defineProperty(backend, 'draw', drawDescriptor)
      else delete (backend as Partial<Backend>).draw
    }
    await Promise.all(jobs)
  } finally {
    await Promise.allSettled(jobs)
  }
}
