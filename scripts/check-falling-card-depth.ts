import assert from 'node:assert/strict'
import * as THREE from 'three'
import { FallingCardDepth } from '../components/resume/casino/falling-card-depth'

const root = new THREE.Group()
const geometry = new THREE.PlaneGeometry(1.3, 1.95)
const cards = Array.from({ length: 67 }, () => new THREE.Mesh(geometry))
const letter = new THREE.Mesh(new THREE.PlaneGeometry(.5, .3))
root.add(...cards, letter)
const solver = new FallingCardDepth(cards.map((c, i) => i ? [c] : [c, letter]))
const boxes = cards.map(() => new THREE.Box3())
const viewCamera = new THREE.PerspectiveCamera(50, 1.6, .1, 10000)
viewCamera.position.z = 17
viewCamera.updateWorldMatrix(true, false)
let checks = 0
for (let frame = 0; frame < 90; frame++) {
  const t = frame / 30
  for (let i = 0; i < cards.length; i++) {
    cards[i].position.set((i % 9 - 4) * 1.25 + Math.sin(t + i) * .5,
      (Math.floor(i / 9) - 3) * 1.85 - t * t * (1 + i % 5 * .08), 0)
    cards[i].scale.setScalar(1)
    cards[i].rotation.set(.35 * Math.sin(t + i), t * (i % 7 - 3), .3 * Math.sin(t * 2 + i))
  }
  letter.position.copy(cards[0].position).add(new THREE.Vector3(.25, .2, .2))
  letter.scale.setScalar(1)
  root.updateWorldMatrix(true, true)
  const before = cards.map(c => [new THREE.Vector3(.3,.5,0).applyMatrix4(c.matrixWorld).project(viewCamera), c.quaternion.clone()] as const)
  const letterBefore = new THREE.Vector3().setFromMatrixPosition(letter.matrixWorld).project(viewCamera)
  solver.resolve(root, viewCamera)
  const letterAfter = letter.getWorldPosition(new THREE.Vector3()).project(viewCamera)
  assert.ok(Math.hypot(letterAfter.x-letterBefore.x, letterAfter.y-letterBefore.y)<1e-10, 'word stays visually attached to its card')
  root.updateWorldMatrix(true, true)
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i]
    const projected = new THREE.Vector3(.3,.5,0).applyMatrix4(c.matrixWorld).project(viewCamera)
    assert.ok(Math.hypot(projected.x-before[i][0].x, projected.y-before[i][0].y)<1e-10, 'overlap correction cannot jump on screen')
    assert.ok(c.quaternion.equals(before[i][1]), 'solver preserves tumble')
    if (!geometry.boundingBox) geometry.computeBoundingBox()
    boxes[i].copy(geometry.boundingBox!).applyMatrix4(c.matrixWorld)
    for (let j = 0; j < i; j++) {
      assert.ok(!boxes[i].intersectsBox(boxes[j]), `separate tumbling stock ${i}/${j} at ${t}`)
      checks++
    }
  }
}
console.log(`PASS: ${checks} tumbling card-pair checks; projected corners, orientation and word attachment preserved`)

// Foreground protection must not visibly resize/reposition the paper, even with
// a rotated camera/parent, and must never accumulate across replay frames.
const scene = new THREE.Scene()
const parent = new THREE.Group()
parent.rotation.y = .15
scene.add(parent)
parent.add(root)
const camera = new THREE.PerspectiveCamera(50, 1.6, .1, 1000)
camera.position.set(2, 5, 12)
camera.lookAt(0, 2, 0)
camera.updateWorldMatrix(true, false)
const foreground = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 4))
foreground.name = 'flight-royal-flush'
foreground.position.set(0, 0, -14).applyMatrix4(camera.matrixWorld)
foreground.quaternion.copy(camera.quaternion)
scene.add(foreground)
for (let frame = 0; frame < 30; frame++) {
  solver.restore(root)
  root.position.set(0, 0, 0)
  root.scale.setScalar(1)
  cards.forEach((card, i) => {
    card.position.set(i % 9 - 4, Math.floor(i / 9) - 3, 0)
    card.rotation.set(.2 * frame, i * .3, frame * .1)
  })
  root.updateWorldMatrix(true, true)
  const projected = cards.map(card => new THREE.Vector3(.3, .5, 0).applyMatrix4(card.matrixWorld).project(camera))
  solver.behindForeground(root, camera, scene)
  const foregroundBounds = new THREE.Box3().copy(foreground.geometry.boundingBox!)
    .applyMatrix4(new THREE.Matrix4().multiplyMatrices(camera.matrixWorldInverse, foreground.matrixWorld))
  cards.forEach((card, i) => {
    const p = new THREE.Vector3(.3, .5, 0).applyMatrix4(card.matrixWorld).project(camera)
    assert.ok(Math.abs(p.x - projected[i].x) < 1e-10 && Math.abs(p.y - projected[i].y) < 1e-10, 'screen trajectory unchanged')
    const bounds = new THREE.Box3().copy(geometry.boundingBox!).applyMatrix4(
      new THREE.Matrix4().multiplyMatrices(camera.matrixWorldInverse, card.matrixWorld))
    assert.ok(bounds.max.z < foregroundBounds.min.z, 'every falling card is behind the entire fan')
  })
  solver.restore(root)
  assert.deepEqual(root.position.toArray(), [0, 0, 0])
  assert.deepEqual(root.scale.toArray(), [1, 1, 1])
}
console.log('PASS: foreground depth, identical projected corners and replay restoration')
