/** Lossless meshopt delivery: run after optimize-casino-dealer.mjs --compact,
 * or pass --delivery to both scripts for the smaller same-resolution texture.
 * Optional --precision trims float mantissas with measured error bounds.
 * No vertex reordering, decimation, skinning or animation changes.
 */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer'
import { MeshoptDecoder as createRuntimeDecoder } from 'three-stdlib'
import { reduceDealerPrecision } from './dealer-delivery-precision.mjs'

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready])
const runtimeDecoder = typeof createRuntimeDecoder === 'function' ? createRuntimeDecoder() : createRuntimeDecoder
await runtimeDecoder.ready
const folder = process.argv.includes('--folder')
const experiment = process.argv.includes('--experiment')
const outputStem = folder ? 'resume-folder-meshopt' : experiment ? 'casino-dealer-v3-1mb' : 'casino-dealer-v3-meshopt'
const manifestPath = experiment ? 'public/models/casino-dealer-v3-experiment.json' : process.argv.includes('--delivery')
  ? 'public/models/casino-dealer-v3-delivery.json'
  : 'public/models/casino-dealer-v3-compact.json'
const manifest = folder ? { model: '/models/resume-folder-split.glb' } : JSON.parse(await readFile(manifestPath, 'utf8'))
const sourcePath = `public${manifest.model.split('?')[0]}`
const source = await readFile(sourcePath)
assert.equal(source.readUInt32LE(0), 0x46546c67)
const jsonLength = source.readUInt32LE(12)
const original = JSON.parse(source.subarray(20, 20 + jsonLength))
assert.equal(original.buffers.length, 1)
const gltf = structuredClone(original)
const originalBin = source.subarray(28 + jsonLength)
const precision = process.argv.includes('--precision') ? reduceDealerPrecision(gltf, originalBin) : null
const bin = precision?.bin ?? originalBin
const expectedAccessors = structuredClone(gltf.accessors)
const chunks = []
let offset = 0, compressedViews = 0
const append = data => {
  const start = offset
  chunks.push(Buffer.from(data))
  const padding = (4 - data.length % 4) % 4
  chunks.push(Buffer.alloc(padding))
  offset += data.length + padding
  return start
}
for (const [i, view] of gltf.bufferViews.entries()) {
  const old = original.bufferViews[i]
  const raw = bin.subarray(old.byteOffset ?? 0, (old.byteOffset ?? 0) + old.byteLength)
  // Sparse morph targets keep their values/indices in separate views. They
  // are not accessor.bufferView entries, and the old pass missed all of them.
  // Compress their raw bytes too; retain sparsity, counts and exact float data.
  const references = original.accessors.flatMap(a => [
    ...(a.bufferView === i ? [{ count: a.count, byteOffset: a.byteOffset, indices: old.target === 34963 }] : []),
    ...(a.sparse?.values.bufferView === i ? [{ count: a.sparse.count, byteOffset: a.sparse.values.byteOffset, indices: false }] : []),
    ...(a.sparse?.indices.bufferView === i ? [{ count: a.sparse.count, byteOffset: a.sparse.indices.byteOffset, indices: true }] : []),
  ])
  const accessor = references[0]
  const stride = accessor && old.byteLength / accessor.count
  const mode = accessor?.indices ? 'INDICES' : 'ATTRIBUTES'
  const supported = references.length === 1 && !accessor.byteOffset && Number.isInteger(stride) &&
    (mode === 'INDICES' ? [2, 4].includes(stride) : stride % 4 === 0 && stride <= 256)
  if (supported) {
    const encoded = MeshoptEncoder.encodeGltfBuffer(raw, accessor.count, stride, mode, 0)
    const decoded = new Uint8Array(raw.length)
    MeshoptDecoder.decodeGltfBuffer(decoded, accessor.count, stride, encoded, mode)
    assert.ok(Buffer.from(decoded).equals(raw), `View ${i}: compression must be byte-identical`)
    runtimeDecoder.decodeGltfBuffer(decoded, accessor.count, stride, encoded, mode)
    assert.ok(Buffer.from(decoded).equals(raw), `View ${i}: shipped Three decoder must match`)
    if (encoded.length < raw.length) {
      view.buffer = 1 // placeholder, never fetched by an EXT_meshopt loader
      view.extensions = { ...view.extensions, EXT_meshopt_compression: {
        buffer: 0, byteOffset: append(encoded), byteLength: encoded.length,
        byteStride: stride, count: accessor.count, mode,
      } }
      compressedViews++
      continue
    }
  }
  view.buffer = 0
  view.byteOffset = append(raw)
}
assert.ok(compressedViews > 0)
gltf.buffers = [{ byteLength: offset }, {
  byteLength: original.buffers[0].byteLength,
  extensions: { EXT_meshopt_compression: { fallback: true } },
}]
for (const key of ['extensionsUsed', 'extensionsRequired']) gltf[key] = [...new Set([...(gltf[key] ?? []), 'EXT_meshopt_compression'])]
assert.deepEqual(gltf.accessors, expectedAccessors)
for (const key of ['meshes', 'skins', 'animations', 'nodes', 'images', 'materials']) assert.deepEqual(gltf[key], original[key])
const json = Buffer.from(JSON.stringify(gltf))
const paddedJson = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)])
const packed = Buffer.concat(chunks)
const header = Buffer.alloc(20), binHeader = Buffer.alloc(8)
header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4)
header.writeUInt32LE(28 + paddedJson.length + packed.length, 8)
header.writeUInt32LE(paddedJson.length, 12); header.writeUInt32LE(0x4e4f534a, 16)
binHeader.writeUInt32LE(packed.length); binHeader.writeUInt32LE(0x004e4942, 4)
const output = Buffer.concat([header, paddedJson, binHeader, packed])
assert.ok(output.length < source.length)
const digest = data => createHash('sha256').update(data).digest('hex')
assert.equal(digest(await readFile(sourcePath)), digest(source), 'Source changed during compression')
if (!folder) assert.deepEqual(JSON.parse(await readFile(manifestPath, 'utf8')), manifest)
await writeFile(`public/models/${outputStem}.glb`, output)
await writeFile(`public/models/${outputStem}.json`, JSON.stringify({
  ...manifest, model: `/models/${outputStem}.glb?v=${digest(output).slice(0, 12)}`,
  compactBytes: source.length, bytes: output.length, compressedViews,
  geometry: experiment ? 'Simplified comparison mesh; bounded float precision reduction; original skeleton and morph channels retained' : precision ? 'meshopt v0; bounded float precision reduction; no topology, skinning or animation changes' : 'meshopt v0 including sparse morph targets; byte-exact decode; no quantization or reordering',
  ...(precision ? { texture: manifest.texture.replace('geometry and rig unchanged', 'rig unchanged; vertex precision recorded separately') } : {}),
  ...(precision ? { precision: precision.stats } : {}),
}, null, 2) + '\n')
console.log(JSON.stringify({ before: source.length, after: output.length, compressedViews }))
