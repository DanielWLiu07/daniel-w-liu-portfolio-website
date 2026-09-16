import assert from 'node:assert/strict'

/** Trim float mantissas before meshopt; preserve topology, skinning and animation.
 * Values remain FLOAT accessors, so no loader extension or transform is needed.
 */
export function reduceDealerPrecision(gltf, bin) {
  const selections = new Map()
  const add = (index, semantic) => {
    if (index === undefined) return
    const bits = semantic === 'NORMAL' ? 12 : 16
    const limit = semantic === 'NORMAL' ? 0.000125 : 0.000016
    const previous = selections.get(index)
    assert.ok(!previous || previous.bits === bits, 'Conflicting accessor semantics')
    selections.set(index, { bits, limit, semantic })
  }
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
    for (const semantic of ['POSITION', 'NORMAL', 'TEXCOORD_0']) add(primitive.attributes[semantic], semantic)
    for (const target of primitive.targets ?? []) {
      add(target.POSITION, 'POSITION')
      add(target.NORMAL, 'NORMAL')
    }
  }
  const output = Buffer.from(bin)
  const stats = {}
  const scratch = new DataView(new ArrayBuffer(4))
  const touched = new Set()
  for (const [index, { bits, limit, semantic }] of selections) {
    const accessor = gltf.accessors[index]
    assert.equal(accessor.componentType, 5126)
    const components = { VEC2: 2, VEC3: 3 }[accessor.type]
    assert.ok(components)
    const min = Array(components).fill(Infinity), max = Array(components).fill(-Infinity)
    const regions = []
    if (accessor.bufferView !== undefined) regions.push({ view: accessor.bufferView, offset: accessor.byteOffset ?? 0, count: accessor.count })
    if (accessor.sparse) regions.push({ view: accessor.sparse.values.bufferView, offset: accessor.sparse.values.byteOffset ?? 0, count: accessor.sparse.count })
    if (accessor.sparse && accessor.bufferView === undefined) { min.fill(0); max.fill(0) }
    for (const region of regions) {
      const view = gltf.bufferViews[region.view]
      const stride = view.byteStride ?? components * 4
      for (let row = 0; row < region.count; row++) for (let c = 0; c < components; c++) {
        const offset = (view.byteOffset ?? 0) + region.offset + row * stride + c * 4
        assert.ok(!touched.has(offset), 'Overlapping precision accessors')
        touched.add(offset)
        const value = bin.readFloatLE(offset)
        assert.ok(Number.isFinite(value))
        scratch.setFloat32(0, value, true)
        const shift = 23 - bits
        const rounded = (scratch.getUint32(0, true) + 2 ** (shift - 1)) & ~(2 ** shift - 1)
        scratch.setUint32(0, rounded, true)
        const next = scratch.getFloat32(0, true)
        const error = Math.abs(next - value)
        assert.ok(error <= limit, `${semantic} error ${error} exceeds ${limit}`)
        output.writeFloatLE(next, offset)
        min[c] = Math.min(min[c], next); max[c] = Math.max(max[c], next)
        const stat = stats[semantic] ??= { values: 0, maxError: 0, mantissaBits: bits }
        stat.values++; stat.maxError = Math.max(stat.maxError, error)
      }
    }
    // Sparse overrides can only narrow these conservative bounds.
    if (accessor.min) accessor.min = min
    if (accessor.max) accessor.max = max
  }
  // Everything outside the selected floats remains byte-identical.
  for (let offset = 0; offset < bin.length; offset++) {
    if (!touched.has(offset - offset % 4)) assert.equal(output[offset], bin[offset])
  }
  return { bin: output, stats }
}
