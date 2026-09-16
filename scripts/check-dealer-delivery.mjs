import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Texture } from 'three'
import { MeshoptDecoder } from 'three-stdlib'

const decoder = typeof MeshoptDecoder === 'function' ? MeshoptDecoder() : MeshoptDecoder
await decoder.ready
const loader = new GLTFLoader().setMeshoptDecoder(decoder)
// Node has no image renderer; geometry still uses the actual production decoder.
loader.register(() => ({ name: 'EXT_texture_webp', loadTexture: () => Promise.resolve(new Texture()) }))
async function load(path) {
  const bytes = await readFile(path)
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
}
const source = await load('public/models/casino-dealer-v3.glb')
const delivery = await load('public/models/casino-dealer-v3-meshopt.glb')
const sourceNodes = [], deliveryNodes = []
source.scene.traverse(node => sourceNodes.push(node))
delivery.scene.traverse(node => deliveryNodes.push(node))
assert.equal(deliveryNodes.length, sourceNodes.length)
let meshes = 0, morphs = 0
function compareAttribute(before, after, limit) {
  assert.equal(after.count, before.count)
  assert.equal(after.itemSize, before.itemSize)
  for (let i = 0; i < before.count; i++) for (let c = 0; c < before.itemSize; c++) {
    assert.ok(Math.abs(before.getComponent(i, c) - after.getComponent(i, c)) <= limit)
  }
}
for (let i = 0; i < sourceNodes.length; i++) {
  const before = sourceNodes[i], after = deliveryNodes[i]
  assert.equal(after.name, before.name)
  assert.deepEqual(after.matrix.elements, before.matrix.elements)
  if (!before.isMesh) continue
  meshes++
  assert.deepEqual(after.morphTargetDictionary, before.morphTargetDictionary)
  assert.deepEqual(after.morphTargetInfluences, before.morphTargetInfluences)
  if (before.skeleton) {
    assert.deepEqual(after.skeleton.bones.map(b => b.name), before.skeleton.bones.map(b => b.name))
    assert.deepEqual(after.skeleton.boneInverses, before.skeleton.boneInverses)
  }
  compareAttribute(before.geometry.index, after.geometry.index, 0)
  assert.deepEqual(Object.keys(after.geometry.attributes), Object.keys(before.geometry.attributes))
  for (const [name, attribute] of Object.entries(before.geometry.attributes)) {
    compareAttribute(attribute, after.geometry.attributes[name], { position: 0.000016, normal: 0.000125, uv: 0.000016 }[name] ?? 0)
  }
  for (const [name, attributes] of Object.entries(before.geometry.morphAttributes)) {
    assert.equal(after.geometry.morphAttributes[name].length, attributes.length)
    attributes.forEach((attribute, index) => {
      morphs++
      compareAttribute(attribute, after.geometry.morphAttributes[name][index], name === 'normal' ? 0.000125 : 0.000016)
    })
  }
}
assert.deepEqual(delivery.animations.map(a => a.toJSON()), source.animations.map(a => a.toJSON()))
console.log(`Delivery loader passed: ${meshes} meshes, ${morphs} morph attributes; exact rig, skin weights, indices and animations; bounded vertex error.`)
