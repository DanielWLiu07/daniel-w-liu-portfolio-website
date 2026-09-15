// Exercise the actual Three.js loader, clone, skinning and morph path without a
// browser or WebGL context. Texture decoding is intentionally outside this test.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { Bone, SkinnedMesh, Texture, Vector3 } from 'three'

const bytes = readFileSync(new URL('../public/models/casino-dealer-v2.glb', import.meta.url))
const manifest = JSON.parse(readFileSync(new URL('../public/models/casino-dealer-v2.json', import.meta.url)))
const loader = new GLTFLoader()
loader.register(() => ({ name: 'HEADLESS_TEXTURES', loadTexture: () => Promise.resolve(new Texture()) }))
const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
const model = clone(gltf.scene)
const meshes = []
const bones = []
model.traverse((object) => {
  if (object instanceof SkinnedMesh) { object.bindMode = 'detached'; meshes.push(object) }
  if (object instanceof Bone) bones.push(object)
})
const owners = new Set()
const observedMorphs = new Set()
assert.equal(bones.length, manifest.bones.length)
const update = () => { model.updateMatrixWorld(true); for (const mesh of meshes) mesh.skeleton.update() }
const vertex = (mesh, i) => mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld)
update()
for (const mesh of meshes) {
  let owner = mesh
  while (!owner.userData.partGroup && owner.parent) owner = owner.parent
  owners.add(owner.name)
  assert.equal(owner.userData.detachable, true)
  assert.equal(owner.userData.partGroup, manifest.parts[owner.name].group)
  const original = vertex(mesh, 0)
  mesh.position.x += .25
  update()
  assert.ok(vertex(mesh, 0).distanceTo(original.clone().add(new Vector3(.25, 0, 0))) < 1e-5, mesh.name)
  mesh.position.x -= .25
  update()
  if (!mesh.morphTargetDictionary) continue
  for (const [name, index] of Object.entries(mesh.morphTargetDictionary)) {
    const attribute = mesh.geometry.morphAttributes.position[index]
    let strongest = 0
    let magnitude = 0
    for (let i = 0; i < attribute.count; i++) {
      const value = Math.hypot(attribute.getX(i), attribute.getY(i), attribute.getZ(i))
      if (value > magnitude) { magnitude = value; strongest = i }
    }
    const neutral = vertex(mesh, strongest)
    if (magnitude < 1e-7) continue // A material submesh may lie outside this morph.
    observedMorphs.add(name)
    mesh.morphTargetInfluences[index] = 1
    assert.ok(vertex(mesh, strongest).distanceTo(neutral) > 1e-5, name)
    mesh.morphTargetInfluences[index] = 0
    assert.ok(vertex(mesh, strongest).distanceTo(neutral) < 1e-7, name)
  }
}
assert.deepEqual([...owners].sort(), Object.keys(manifest.parts).sort())
assert.deepEqual([...observedMorphs].sort(), [...manifest.expressions].sort())
const hand = meshes.find((mesh) => mesh.name === 'HandLeft')
const before = Array.from({ length: hand.geometry.attributes.position.count }, (_, i) => vertex(hand, i))
for (const bone of bones.filter((b) => /^Left(Thumb|Index|Middle|Ring|Pinky)[123]$/.test(b.name))) bone.rotateX(.45)
update()
assert.ok(before.some((point, i) => vertex(hand, i).distanceTo(point) > .01))
const originalHandBone = gltf.scene.getObjectByName('LeftHand')
assert.notEqual(hand.skeleton.bones.find((b) => b.name === 'LeftHand'), originalHandBone)
for (const mesh of meshes) {
  for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
    assert.ok(vertex(mesh, i).toArray().every(Number.isFinite))
  }
}
console.log(`Three.js: ${owners.size} detachable parts (${meshes.length} draw meshes), ${bones.length} bones, ${manifest.expressions.length} morphs; clone isolation, finger pose, morph reset and exploded transforms passed.`)
