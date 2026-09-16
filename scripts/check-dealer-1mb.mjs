import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Texture, Vector3 } from 'three'
import { MeshoptDecoder } from 'three-stdlib'
const decoder = typeof MeshoptDecoder === 'function' ? MeshoptDecoder() : MeshoptDecoder
await decoder.ready
const loader = new GLTFLoader().setMeshoptDecoder(decoder)
loader.register(() => ({ name: 'EXT_texture_webp', loadTexture: () => Promise.resolve(new Texture()) }))
async function load(path) {
  const bytes = await readFile(path)
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
}
const source = await load('public/models/casino-dealer-v3.glb')
const delivery = await load('public/models/casino-dealer-v3-1mb.glb')
const manifest = JSON.parse(await readFile('public/models/casino-dealer-v3-1mb.json', 'utf8'))
// Keep the ~1 MB budget with room for intact finger surfaces.
assert.ok(manifest.bytes <= 1_050_000)
const before = [], after = []
source.scene.traverse(n => before.push(n)); delivery.scene.traverse(n => after.push(n))
assert.equal(after.length, before.length)
let triangles = 0, morphs = 0
for (let i = 0; i < before.length; i++) {
  const a = before[i], b = after[i]
  assert.equal(b.name, a.name); assert.deepEqual(b.matrix.elements, a.matrix.elements)
  if (!a.isMesh) continue
  if (manifest.omittedParts.includes(a.name)) { assert.ok(!b.isMesh, 'Lower body has no renderable geometry'); continue }
  assert.deepEqual(b.morphTargetDictionary, a.morphTargetDictionary)
  assert.deepEqual(b.morphTargetInfluences, a.morphTargetInfluences)
  if (a.skeleton) {
    assert.deepEqual(b.skeleton.bones.map(n => n.name), a.skeleton.bones.map(n => n.name))
    assert.deepEqual(b.skeleton.boneInverses, a.skeleton.boneInverses)
  }
  const geometry = b.geometry, count = geometry.attributes.position.count
  if (a.name === 'HandLeft' || a.name === 'HandRight') {
    assert.equal(geometry.index.count, a.geometry.index.count + 15 * 48 * 3, 'Keep authored hand triangles plus fifteen closed joints')
    for (let corner = 0; corner < a.geometry.index.count; corner++) {
      const oldVertex = a.geometry.index.getX(corner), newVertex = geometry.index.getX(corner)
      for (const [name, original] of Object.entries(a.geometry.attributes)) {
        const limit = { position: .000016, normal: .000125, uv: .000016 }[name] ?? 0
        for (let c = 0; c < original.itemSize; c++) assert.ok(
          Math.abs(original.getComponent(oldVertex, c) - geometry.attributes[name].getComponent(newVertex, c)) <= limit,
          `Preserve hand triangle corners and skinning: ${a.name}/${name}`)
      }
    }
  }
  triangles += geometry.index.count / 3
  for (const index of geometry.index.array) assert.ok(index >= 0 && index < count)
  for (const attribute of Object.values(geometry.attributes)) {
    assert.equal(attribute.count, count)
    for (const value of attribute.array) assert.ok(Number.isFinite(value))
  }
  for (const [name, attributes] of Object.entries(geometry.morphAttributes)) {
    assert.equal(attributes.length, a.geometry.morphAttributes[name].length)
    for (const attribute of attributes) {
      morphs++; assert.equal(attribute.count, count)
      for (const value of attribute.array) assert.ok(Number.isFinite(value))
    }
  }
  // Exercise every expression through Three's actual skinned vertex path.
  if (b.morphTargetInfluences) for (let m = 0; m < b.morphTargetInfluences.length; m++) {
    b.morphTargetInfluences[m] = 1
    for (let v = 0; v < count; v += 13) {
      const point = b.getVertexPosition(v, new Vector3())
      assert.ok(point.toArray().every(Number.isFinite))
    }
    b.morphTargetInfluences[m] = 0
  }
}
assert.equal(triangles, manifest.triangles)
assert.deepEqual(delivery.animations.map(a => a.toJSON()), source.animations.map(a => a.toJSON()))
console.log(`1 MB candidate passed: ${manifest.bytes} bytes; ${triangles} triangles; ${morphs} morph attributes; original node transforms, skeleton and animations; valid skinned expression vertices.`)
