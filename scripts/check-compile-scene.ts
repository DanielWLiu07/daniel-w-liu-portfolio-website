import assert from 'node:assert/strict'
import { Group, PerspectiveCamera, RenderTarget } from 'three'
import type { Renderer } from 'three/webgpu'
import { batchPipelineCompilation, compileScene, compileVisibleScene } from '../components/resume/casino/compile-scene'

async function check(fail: boolean) {
  let pending = 0, peak = 0, completed = 0
  const original = (_object: unknown, promises: Promise<unknown>[] | null) => {
    if (!promises) return
    pending++; peak = Math.max(peak, pending)
    promises.push(new Promise<void>((resolve, reject) => setTimeout(() => {
      pending--; completed++
      if (fail && completed === 2) reject(new Error('test failure'))
      else resolve()
    }, 5)))
  }
  const backend = { createRenderPipeline: original }
  const job = batchPipelineCompilation(backend, async () => {
    for (let i = 0; i < 11; i++) {
      const promises: Promise<unknown>[] = []
      backend.createRenderPipeline({}, promises)
      await Promise.all(promises)
    }
  })
  if (fail) await assert.rejects(job, /test failure/)
  else { await job; assert.equal(completed, 11) }
  assert.equal(peak, 8)
  assert.equal(pending, 0, 'must drain GPU work before resolving/rejecting')
  assert.equal(backend.createRenderPipeline, original)
}
async function main() {
  await check(false); await check(true)
  const prototype = { createRenderPipeline(_object: unknown, promises: Promise<unknown>[] | null) {
    promises?.push(Promise.resolve())
  } }
  const inherited = Object.create(prototype) as typeof prototype
  await batchPipelineCompilation(inherited, async () => {
    inherited.createRenderPipeline({}, null)
    const promises: Promise<unknown>[] = []
    inherited.createRenderPipeline({}, promises)
    await Promise.all(promises)
  })
  assert.equal(Object.hasOwn(inherited, 'createRenderPipeline'), false)
  let fallbackCalls = 0
  const fallback = { backend: { isWebGPUBackend: false }, async compileAsync() { fallbackCalls++ } }
  await compileScene(fallback as unknown as Renderer, new Group(), new PerspectiveCamera())
  assert.equal(fallbackCalls, 1, 'WebGL keeps the ordinary compiler')
  const scene = new Group(), hidden = new Group(), target = new RenderTarget()
  hidden.visible = false; scene.add(hidden)
  let selected: RenderTarget | null = null
  const renderer = {
    backend: { isWebGPUBackend: false },
    getRenderTarget: () => selected,
    setRenderTarget: (value: RenderTarget | null) => { selected = value },
    async compileAsync() {
      assert.equal(hidden.visible, true)
      assert.equal(hidden.frustumCulled, false)
      assert.equal(selected, target)
      await Promise.resolve()
      assert.equal(hidden.visible, false, 'restore while asynchronous work is pending')
    },
  }
  await compileVisibleScene(renderer as unknown as Renderer, scene, new PerspectiveCamera(), target)
  assert.equal(selected, null)
  assert.equal(hidden.frustumCulled, true)
  target.dispose()
  console.log('PASS: bounded compilation, partial final batch, failure draining and method restoration')
}
void main()
