import assert from 'node:assert/strict'
import { canonicalBufferNames, shareBuilderBuffers } from '../components/resume/casino/shared-buffer-shaders'

const source = (id: number, count = 58, binding = 1) => `struct NodeBuffer_${id}Struct { value: array<mat4x4<f32>, ${count}> };\n@binding( ${binding} ) @group( 1 )\nvar<uniform> NodeBuffer_${id}: NodeBuffer_${id}Struct;\nfn read() { let a = NodeBuffer_${id}.value[0]; }`
assert.equal(canonicalBufferNames(source(100)), canonicalBufferNames(source(999)))
assert.notEqual(canonicalBufferNames(source(100)), canonicalBufferNames(source(100, 1)), 'different skeleton lengths stay distinct')
assert.notEqual(canonicalBufferNames(source(100)), canonicalBufferNames(source(100, 58, 2)), 'binding slots are never merged')
const pair = canonicalBufferNames(source(100) + source(200, 1, 2))
assert.ok(pair.includes('casinoSharedBuffer_g1_b1.value'))
assert.ok(pair.includes('casinoSharedBuffer_g1_b2.value'))
assert.equal(canonicalBufferNames('fn main() {}'), 'fn main() {}')
assert.equal(canonicalBufferNames('var NodeBuffer_10: f32;'), 'var NodeBuffer_10: f32;', 'unrecognized declarations stay untouched')
assert.equal(canonicalBufferNames(canonicalBufferNames(source(100))), canonicalBufferNames(source(100)))

async function main() {
  const bindingData = { boneMatrices: new Float32Array([1, 2, 3]) }
  const builder = shareBuilderBuffers({
    vertexShader: null as string | null, fragmentShader: null, computeShader: null,
    bindings: bindingData,
    build() { this.vertexShader = source(100); return this },
    async buildAsync() { this.vertexShader = source(200); return this },
  })
  assert.equal(builder.build(), builder)
  const sync = builder.vertexShader
  assert.equal(await builder.buildAsync(), builder)
  assert.equal(builder.vertexShader, sync)
  assert.equal((builder as unknown as { bindings: object }).bindings, bindingData, 'live binding objects are untouched')
  assert.deepEqual(bindingData.boneMatrices, new Float32Array([1, 2, 3]))
  console.log('PASS: generated names share, distinct layouts remain distinct, sync/async builds preserve bindings')
}
void main()
