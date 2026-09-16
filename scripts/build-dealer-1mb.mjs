/** Optimized upper-body delivery; preserves authored and full-detail inputs. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'
import { addFingerJoints } from './dealer-finger-joints.mjs'

await MeshoptSimplifier.ready
const ratio = Number(process.argv[2] ?? 0.3)
assert.ok(ratio > 0 && ratio <= 1)
const manifest = JSON.parse(await readFile('public/models/casino-dealer-v3.json', 'utf8'))
const source = await readFile(`public${manifest.model.split('?')[0]}`)
const jsonLength = source.readUInt32LE(12)
const original = JSON.parse(source.subarray(20, 20 + jsonLength))
const bin = source.subarray(28 + jsonLength)
const gltf = structuredClone(original)
gltf.bufferViews = []; gltf.accessors = []
const chunks = []; let offset = 0
const types = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }
const widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }
const append = (data, target) => {
  const index = gltf.bufferViews.length
  gltf.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length, ...(target ? { target } : {}) })
  chunks.push(Buffer.from(data)); const padding = (4 - data.length % 4) % 4
  chunks.push(Buffer.alloc(padding)); offset += data.length + padding
  return index
}
function unpack(index) {
  const a = original.accessors[index], Type = types[a.componentType], width = widths[a.type]
  assert.ok(Type && width)
  const result = new Type(a.count * width)
  const copy = (viewIndex, byteOffset, count, destinations) => {
    const view = original.bufferViews[viewIndex]
    const stride = view.byteStride ?? width * Type.BYTES_PER_ELEMENT
    for (let i = 0; i < count; i++) {
      const start = (view.byteOffset ?? 0) + (byteOffset ?? 0) + i * stride
      const raw = bin.subarray(start, start + width * Type.BYTES_PER_ELEMENT)
      const values = new Type(Uint8Array.from(raw).buffer)
      result.set(values, (destinations ? destinations[i] : i) * width)
    }
  }
  if (a.bufferView !== undefined) copy(a.bufferView, a.byteOffset, a.count)
  if (a.sparse) {
    const v = original.bufferViews[a.sparse.indices.bufferView], TypeIndex = types[a.sparse.indices.componentType]
    const start = (v.byteOffset ?? 0) + (a.sparse.indices.byteOffset ?? 0)
    const ids = new TypeIndex(Uint8Array.from(bin.subarray(start, start + a.sparse.count * TypeIndex.BYTES_PER_ELEMENT)).buffer)
    copy(a.sparse.values.bufferView, a.sparse.values.byteOffset, a.sparse.count, ids)
  }
  return result
}
function accessor(data, template, target) {
  const a = structuredClone(template), width = widths[a.type]
  delete a.sparse; delete a.byteOffset
  a.count = data.length / width
  a.bufferView = append(Buffer.from(data.buffer, data.byteOffset, data.byteLength), target)
  if (a.min || a.max) {
    a.min = Array(width).fill(Infinity); a.max = Array(width).fill(-Infinity)
    for (let i = 0; i < data.length; i++) { a.min[i % width] = Math.min(a.min[i % width], data[i]); a.max[i % width] = Math.max(a.max[i % width], data[i]) }
  }
  return gltf.accessors.push(a) - 1
}
let originalTriangles = 0, triangles = 0
const parts = []
const omittedParts = ['Trousers', 'ShoeLeft', 'ShoeRight']
for (const mesh of gltf.meshes) for (const p of mesh.primitives) {
  assert.ok(p.mode === undefined || p.mode === 4)
  const indices = Uint32Array.from(unpack(p.indices)), positions = unpack(p.attributes.POSITION)
  if (omittedParts.includes(mesh.name)) {
    originalTriangles += indices.length / 3
    parts.push({ name: mesh.name, before: indices.length / 3, after: 0, omitted: true })
    continue
  }
  const normal = unpack(p.attributes.NORMAL), uv = p.attributes.TEXCOORD_0 === undefined ? null : unpack(p.attributes.TEXCOORD_0)
  const clothing = ['Shirt', 'Waistcoat'].includes(mesh.name)
  // Spend fewer triangles on broad cloth surfaces. Include skinning in the
  // collapse metric so creases at moving shoulders retain deformation detail.
  const joints = clothing ? unpack(p.attributes.JOINTS_0) : null
  const weights = clothing ? unpack(p.attributes.WEIGHTS_0) : null
  const boneIds = clothing ? [...new Set(Array.from(joints).filter((_, i) => weights[i] > 0))] : []
  const stride = 5 + boneIds.length
  const attributes = new Float32Array(positions.length / 3 * stride)
  for (let i = 0; i < positions.length / 3; i++) {
    attributes.set([normal[i*3], normal[i*3+1], normal[i*3+2], uv?.[i*2] ?? 0, uv?.[i*2+1] ?? 0], i*stride)
    if (clothing) for (let j = 0; j < 4; j++) if (weights[i*4+j] > 0) attributes[i*stride+5+boneIds.indexOf(joints[i*4+j])] += weights[i*4+j]
  }
  // Finger bones are separate thin shells. Simplifying their surfaces can
  // open visible gaps at joints; keep the authored hand triangles intact.
  const preserve = mesh.name === 'HandLeft' || mesh.name === 'HandRight'
  const targetRatio = clothing ? Math.min(ratio, .08) : ratio
  const errorLimit = mesh.name === 'Shirt' ? .004 : clothing ? .008 : .08
  const [reduced, error] = preserve ? [indices, 0] : MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, attributes, stride, [.2,.2,.2,1,1,...boneIds.map(() => .5)], null, Math.max(3, Math.floor(indices.length * targetRatio / 3) * 3), errorLimit, clothing ? ['Permissive', 'LockBorder'] : ['Permissive'])
  const selected = [...new Set(reduced)], remap = new Map(selected.map((old, i) => [old, i]))
  let nextIndices = Uint16Array.from(reduced, i => remap.get(i))
  assert.ok(selected.length < 65536)
  const remapValues = index => {
    const a = original.accessors[index], values = unpack(index), width = widths[a.type]
    const output = new values.constructor(selected.length * width)
    selected.forEach((old, i) => output.set(values.subarray(old * width, (old + 1) * width), i * width))
    return output
  }
  let values = Object.fromEntries(Object.entries(p.attributes).map(([name, index]) => [name, remapValues(index)]))
  let addedJoints = 0
  if (preserve) {
    const node = original.nodes.find(n => n.mesh === gltf.meshes.indexOf(mesh))
    const skin = original.skins[node.skin]
    const repaired = addFingerJoints(mesh.name, values, nextIndices, skin, original.nodes, unpack(skin.inverseBindMatrices))
    values = repaired.attributes; nextIndices = repaired.indices; addedJoints = repaired.joints
  }
  p.indices = accessor(nextIndices, { componentType: 5123, type: 'SCALAR' }, 34963)
  p.attributes = Object.fromEntries(Object.entries(p.attributes).map(([name, index]) => [name, accessor(values[name], original.accessors[index], 34962)]))
  const remapAccessor = index => accessor(remapValues(index), original.accessors[index], 34962)
  if (p.targets) p.targets = p.targets.map(t => Object.fromEntries(Object.entries(t).map(([name, index]) => [name, remapAccessor(index)])))
  originalTriangles += indices.length / 3; triangles += nextIndices.length / 3
  parts.push({ name: mesh.name, before: indices.length / 3, after: nextIndices.length / 3, relativeError: error, ...(clothing ? { targetRatio, errorLimit, skinAware: true, lockedBorders: true } : {}), ...(preserve ? { preserved: true, addedJoints } : {}) })
}
// Retain transform/bone nodes, but omit the hidden lower-body mesh payloads.
const meshRemap = new Map(), retainedMeshes = []
gltf.meshes.forEach((mesh, index) => {
  if (!omittedParts.includes(mesh.name)) { meshRemap.set(index, retainedMeshes.length); retainedMeshes.push(mesh) }
})
for (const node of gltf.nodes) if (node.mesh !== undefined) {
  if (meshRemap.has(node.mesh)) node.mesh = meshRemap.get(node.mesh)
  else { delete node.mesh; delete node.skin }
}
gltf.meshes = retainedMeshes
const copied = new Map()
const copyAccessor = index => {
  if (!copied.has(index)) copied.set(index, accessor(unpack(index), original.accessors[index]))
  return copied.get(index)
}
for (const skin of gltf.skins ?? []) if (skin.inverseBindMatrices !== undefined) skin.inverseBindMatrices = copyAccessor(skin.inverseBindMatrices)
for (const animation of gltf.animations ?? []) for (const sampler of animation.samplers) { sampler.input = copyAccessor(sampler.input); sampler.output = copyAccessor(sampler.output) }
let textureBytes = 0
for (const [index, image] of gltf.images.entries()) {
  const view = original.bufferViews[image.bufferView]
  const png = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
  const texture = await sharp(png).resize(1024, 1024, { fit: 'inside' }).webp({ quality: 75, effort: 6 }).toBuffer()
  textureBytes += texture.length
  image.bufferView = append(texture); image.mimeType = 'image/webp'
  for (const t of gltf.textures) if (t.source === index) { t.extensions = { ...t.extensions, EXT_texture_webp: { source: index } }; delete t.source }
}
for (const key of ['extensionsUsed', 'extensionsRequired']) gltf[key] = [...new Set([...(gltf[key] ?? []), 'EXT_texture_webp'])]
gltf.buffers = [{ byteLength: offset }]
const json = Buffer.from(JSON.stringify(gltf)), paddedJson = Buffer.concat([json, Buffer.alloc((4-json.length%4)%4, 32)])
const header = Buffer.alloc(20), binHeader = Buffer.alloc(8), packed = Buffer.concat(chunks)
header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2,4); header.writeUInt32LE(28+paddedJson.length+packed.length,8)
header.writeUInt32LE(paddedJson.length,12); header.writeUInt32LE(0x4e4f534a,16)
binHeader.writeUInt32LE(packed.length); binHeader.writeUInt32LE(0x004e4942,4)
const output = Buffer.concat([header,paddedJson,binHeader,packed])
const digest = b => createHash('sha256').update(b).digest('hex')
await writeFile('public/models/casino-dealer-v3-experiment.glb',output)
await writeFile('public/models/casino-dealer-v3-experiment.json',JSON.stringify({sourceModel:manifest.model,sourceSha256:digest(source),model:'/models/casino-dealer-v3-experiment.glb',bytes:output.length,experiment:true,ratio,originalTriangles,triangles,textureBytes,texture:'1024px WebP quality 75',simplification:'Attribute-aware vertex removal; original hand surfaces plus skinned joint connectors; lower-body meshes omitted',omittedParts,parts},null,2)+'\n')
console.log({originalTriangles,triangles,textureBytes})
