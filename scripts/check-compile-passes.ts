import assert from 'node:assert/strict'
import { discoverPassPipelines } from '../components/resume/casino/compile-passes'

async function check(fail: boolean) {
  let drawn = 0, finished = 0
  const prototype = {
    draw() { drawn++ },
    createRenderPipeline(_object: unknown, promises: Promise<unknown>[] | null) {
      assert.ok(promises, 'preflight must request asynchronous pipeline compilation')
      promises.push(new Promise<void>(resolve => setTimeout(() => { finished++; resolve() }, 5)))
    },
  }
  const backend = Object.create(prototype) as typeof prototype
  const job = discoverPassPipelines(backend, () => {
    backend.draw()
    backend.createRenderPipeline({}, null)
    if (fail) throw new Error('test failure')
    backend.createRenderPipeline({}, null)
  })
  assert.equal(drawn, 0, 'preflight must not draw unfinished pipelines')
  assert.equal(Object.hasOwn(backend, 'draw'), false, 'restore methods before yielding')
  assert.equal(Object.hasOwn(backend, 'createRenderPipeline'), false)
  if (fail) await assert.rejects(job, /test failure/)
  else await job
  assert.equal(finished, fail ? 1 : 2, 'drain outstanding work on success and failure')
  backend.draw()
  assert.equal(drawn, 1)
}
async function main() {
  await check(false); await check(true)
  console.log('PASS: async pass discovery, no preflight drawing, method restoration and failure draining')
}
void main()
