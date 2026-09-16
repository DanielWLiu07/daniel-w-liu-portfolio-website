/** Sample surface error under bind/arm poses, including skinning deformation. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three-stdlib'
import { BufferGeometry, Float32BufferAttribute, Texture, Vector3 } from 'three'
import { MeshBVH } from 'three-mesh-bvh'
const decoder = typeof MeshoptDecoder === 'function' ? MeshoptDecoder() : MeshoptDecoder
await decoder.ready
const loader = new GLTFLoader().setMeshoptDecoder(decoder)
loader.register(() => ({ name: 'EXT_texture_webp', loadTexture: () => Promise.resolve(new Texture()) }))
async function load(path) {
  const bytes = await readFile(path)
  return (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene
}
const source = await load('public/models/casino-dealer-v3.glb')
const delivery = await load('public/models/casino-dealer-v3-1mb.glb')
const collect = root => { const meshes = []; root.traverse(n => { if (n.isMesh && /^(Shirt|Waistcoat)/.test(n.name)) meshes.push(n) }); return meshes }
const originals = collect(source), simplified = collect(delivery)
assert.equal(originals.length, simplified.length)
const jointNames = ['LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'Spine02']
const roots = [source, delivery]
const rests = roots.map(root => jointNames.map(name => root.getObjectByName(name).quaternion.clone()))
let worst = 0, samples = 0
function surface(mesh) {
  mesh.skeleton.update()
  const points = Array.from({ length: mesh.geometry.attributes.position.count }, (_, i) => mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld))
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(points.flatMap(p => p.toArray()), 3)).setIndex(mesh.geometry.index.clone())
  return { points: [...new Set(mesh.geometry.index.array)].map(i => points[i]), geometry, tree: new MeshBVH(geometry) }
}
for (const pose of [0, -.4, .4]) {
  roots.forEach((root, r) => {
    jointNames.forEach((name, j) => { const bone = root.getObjectByName(name); bone.quaternion.copy(rests[r][j]); bone.rotateX(pose * (j === 4 ? .25 : 1)) })
    root.updateMatrixWorld(true)
  })
  for (let m = 0; m < originals.length; m++) {
    assert.equal(originals[m].name, simplified[m].name)
    const a = surface(originals[m]), b = surface(simplified[m])
    for (const [from, to] of [[a, b], [b, a]]) for (let i = 0; i < from.points.length; i += 3) {
      const hit = to.tree.closestPointToPoint(from.points[i])
      assert.ok(hit)
      worst = Math.max(worst, hit.distance); samples++
      assert.ok(hit.distance < .006, `Clothing surface drift exceeds 6mm: ${originals[m].name}, pose=${pose}, error=${hit.distance}`)

    }
    a.geometry.dispose(); b.geometry.dispose()
  }
}
console.log(`Clothing surface check: ${samples} sampled vertices over 3 poses; maximum drift ${(worst * 1000).toFixed(2)} mm from authored surface.`)
