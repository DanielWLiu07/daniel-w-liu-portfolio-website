import assert from 'node:assert/strict'
import { NodeBuilder, type Renderer } from 'three/webgpu'
import { buildWithBudget, createShaderBuildBudget, installBudgetedShaderBuild, type ShaderBuilder } from '../components/resume/casino/budgeted-shader-build'

// Compare traversal with the installed upstream compiler, including compute and
// position flows. Tiny consecutive builders must still share a yield budget.
function fixture(fail = false) {
  const trace: string[] = []
  let buildStage: string | null = null, shaderStage: string | null = null
  const node = { isNode: true, build() { trace.push(`node:${buildStage}:${shaderStage}`); if (fail) throw new Error('node failed') } }
  const builder: ShaderBuilder = {
    context: { position: node }, flowNodes: { fragment: [node], vertex: [node], compute: [node] },
    prebuild() { trace.push('prebuild') },
    setBuildStage(s) { buildStage = s; trace.push(`build:${s}`) },
    setShaderStage(s) { shaderStage = s; trace.push(`shader:${s}`) },
    flowNodeFromShaderStage(s) { trace.push(`position:${buildStage}:${s}`) },
    flowNode() { trace.push(`flow:${buildStage}:${shaderStage}`) },
    buildCode() { trace.push('code') }, buildUpdateNodes() { trace.push('updates') },
    async buildAsync() { return this },
  }
  return { builder, trace }
}
async function main() {
  const original = fixture(), candidate = fixture()
  const upstream = NodeBuilder.prototype as unknown as { build: (this: ShaderBuilder) => unknown }
  upstream.build.call(original.builder)
  assert.equal(await buildWithBudget(candidate.builder, async () => {}), candidate.builder)
  assert.deepEqual(candidate.trace, original.trace)
  await assert.rejects(buildWithBudget(fixture(true).builder, async () => {}), /node failed/)
  let time = 0, yields = 0
  const checkpoint = createShaderBuildBudget(() => time, async () => { yields++ })
  for (let i = 0; i < 3; i++) {
    await buildWithBudget(fixture().builder, async () => { time += .2; await checkpoint() })
  }
  assert.equal(yields, 1, 'the 4ms budget spans consecutive small builders')
  time += 5; await checkpoint()
  assert.equal(yields, 2, 'long stages yield at the next boundary')
  const backend = { isWebGPUBackend: false, createNodeBuilder: () => fixture().builder }
  const originalFactory = backend.createNodeBuilder
  installBudgetedShaderBuild({ backend } as unknown as Renderer)
  assert.equal(backend.createNodeBuilder, originalFactory, 'WebGL retains upstream compilation')
  backend.isWebGPUBackend = true
  installBudgetedShaderBuild({ backend } as unknown as Renderer)
  assert.notEqual(backend.createNodeBuilder, originalFactory)
  const installedFactory = backend.createNodeBuilder
  installBudgetedShaderBuild({ backend } as unknown as Renderer)
  assert.equal(backend.createNodeBuilder, installedFactory, 'one adapter per renderer')
  console.log('PASS: upstream traversal, compute/position flow, error propagation, and cross-material yield budget')
}
void main()
