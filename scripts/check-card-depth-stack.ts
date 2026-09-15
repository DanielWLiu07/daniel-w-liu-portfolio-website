import assert from 'node:assert/strict'
import * as THREE from 'three'
import { CardDepthStack } from '../components/resume/casino/card-depth-stack'

const solver = new CardDepthStack()
const geometry = new THREE.PlaneGeometry(2 / 3, 1)
const cards = Array.from({ length: 5 }, (_, i) => {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  mesh.userData.index = i
  return mesh
})
const ray = new THREE.Raycaster()
const origin = new THREE.Vector3(), direction = new THREE.Vector3(0, 0, -1)
let overlaps = 0
for (let frame = 0; frame < 70; frame++) {
  const t = frame * 0.09
  for (let i = 0; i < cards.length; i++) {
    const phase = t * 2.4 - i * 0.8
    cards[i].position.set((i - 2) * 0.32 * (1 + 0.36 * Math.sin(t * 2.4)) + 0.09 * Math.sin(phase),
      0.17 * Math.cos(phase), 0.13 * Math.sin(phase))
    cards[i].rotation.set(0.56 * Math.sin(phase), 0.44 * Math.cos(phase * 0.85), -(i - 2) * 0.26 + 0.32 * Math.sin(phase + 0.5))
  }
  const authored = cards.map(c => [c.position.x, c.position.y, c.quaternion.clone()] as const)
  solver.resolve(cards)
  cards.forEach((c, i) => {
    assert.equal(c.position.x, authored[i][0]); assert.equal(c.position.y, authored[i][1])
    assert(c.quaternion.equals(authored[i][2]), 'separation preserves authored motion')
    c.updateMatrixWorld(true)
  })
  // Independent geometry check through Three's actual triangle raycaster.
  for (let y = -0.6; y <= 0.6; y += 0.055) for (let x = -1.1; x <= 1.1; x += 0.055) {
    ray.set(origin.set(x, y, 10), direction)
    const hits = ray.intersectObjects(cards, false)
    if (hits.length > 1) overlaps++
    for (let i = 1; i < hits.length; i++) assert(hits[i - 1].object.userData.index >= hits[i].object.userData.index, 'later cards stay in front without cutting through earlier faces')
  }
}
assert(overlaps > 1000, 'check must cover actual overlapping faces')
cards.forEach((c, i) => { c.position.set(i * 3, 0, 0); c.rotation.set(0, 0, 0) })
solver.resolve(cards)
cards.forEach(c => assert.equal(c.position.z, 0, 'disjoint cards need no depth correction'))
console.log(`PASS animated card separation (${overlaps} overlapping rays), pose preservation, disjoint cards`)
