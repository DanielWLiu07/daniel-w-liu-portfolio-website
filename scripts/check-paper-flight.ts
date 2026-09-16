import assert from 'node:assert/strict'
import * as THREE from 'three'
import { OBB } from 'three/addons/math/OBB.js'
import { PaperFlight, paperPhysicsReady } from '../components/resume/casino/paper-flight'

async function main() {
  await paperPhysicsReady
  const run = (times: number[], collide = true, overlap = false) => {
    const scene = new THREE.Group()
    const geometry = new THREE.PlaneGeometry(1.3, 1.95)
    const cards = Array.from({ length: 12 }, (_, i) => {
      const mesh = new THREE.Mesh(geometry)
      mesh.position.set((i % 4 - 1.5) * (overlap ? 1.1 : 1.32), (Math.floor(i / 4) - 1) * (overlap ? 1.6 : 1.98), collide ? 0 : i * 3)
      scene.add(mesh)
      return mesh
    })
    const letter = new THREE.Mesh(new THREE.PlaneGeometry(.3, .2))
    letter.position.copy(cards[0].position).add(new THREE.Vector3(.2, .3, .04))
    scene.add(letter)
    const flight = new PaperFlight()
    flight.start(cards.map((m, i) => i === 0 ? [m, letter] : [m]), 70, new THREE.Vector3())
    for (const t of times) {
      flight.sample(t)
      scene.updateWorldMatrix(true, true)
      const stock = cards.map(card => new OBB(new THREE.Vector3(), new THREE.Vector3(.65, .975, .001)).applyMatrix4(card.matrixWorld))
      for (let i = 0; i < stock.length; i++) for (let j = 0; j < i; j++) {
        assert.ok(!stock[i].intersectsOBB(stock[j]), `visible stock cannot intersect at ${t}: ${i}/${j}`)
      }
    }
    scene.updateWorldMatrix(true, true)
    const local = letter.getWorldPosition(new THREE.Vector3()).applyMatrix4(cards[0].matrixWorld.clone().invert())
    assert.ok(local.distanceTo(new THREE.Vector3(.2, .3, .04)) < 1e-5, 'word remains rigidly attached')
    for (const card of cards) assert.ok(card.scale.distanceTo(new THREE.Vector3(1, 1, 1)) < 1e-5, 'contacts never inflate cards')
    const poses = cards.map(c => [...c.position.toArray(), ...c.quaternion.toArray()])
    flight.dispose(); geometry.dispose()
    return poses
  }
  run([0, .001, .016, .04, .08, .2, .8], true, true) // authored wall overlaps must be separated before launch
  const regular = run(Array.from({ length: 61 }, (_, i) => i / 60))
  const slow = run([0, .1, .25, .6, 1])
  const scrubbed = run([0, .8, .2, 1])
  assert.deepEqual(slow, regular, 'frame drops cannot change the flight')
  assert.deepEqual(scrubbed, regular, 'reverse scrubbing rebuilds the same flight')
  const isolated = run([1], false)
  assert.ok(regular.some((p, i) => Math.abs(p[0] - isolated[i][0]) > .001 || Math.abs(p[1] - isolated[i][1]) > .001), 'card contacts alter the free-flight trajectory')
  assert.deepEqual(run([3600]), run([12]), 'background-tab catch-up is bounded after the paper leaves')
  console.log('PASS: fixed-step launch across frame drops/replay, rigid word attachment, unchanged card size, contact response')
}
void main()
