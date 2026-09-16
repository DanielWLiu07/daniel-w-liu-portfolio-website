import assert from 'node:assert/strict'
import * as THREE from 'three'
import { OBB } from 'three/addons/math/OBB.js'
import { jackBlastAt } from '../components/resume/casino/jack-composition'
import { PaperFlight } from '../components/resume/casino/paper-flight'

async function main() {
  // Match the reference burst directly without a simulation. This protects the
  // entire arc and stagger, rather than just requiring an arbitrary height.
  for (const x of [0, 3, 8]) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.95))
    mesh.position.x = x
    const flight = new PaperFlight()
    flight.start([[mesh]], 70, new THREE.Vector3())
    for (const time of [.05, .2, .5, 1, 1.5, 2]) {
      flight.sample(time)
      const reference = jackBlastAt(time, 0, x, 0, 70)
      assert.ok(mesh.position.distanceTo(new THREE.Vector3(x + reference.x, reference.y, 0)) < 1e-8,
        `unobstructed stock follows the poker arc at x=${x}, t=${time}`)
      const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(reference.pitch, reference.yaw, reference.roll, 'ZYX'))
      assert.ok(mesh.quaternion.angleTo(rotation) < 1e-7, 'broadside turn and flutter follow the reference')
    }
    flight.dispose(); mesh.geometry.dispose()
  }
  // Overlapping authored stock must reach the packed pose before the burst
  // starts, without a visible position or scale discontinuity at release.
  {
    const root = new THREE.Group(), geometry = new THREE.PlaneGeometry(1.3, 1.95)
    const cards = [new THREE.Mesh(geometry), new THREE.Mesh(geometry)]
    cards[1].position.x = .8; root.add(...cards)
    const homes = cards.map(c => c.position.clone())
    const flight = new PaperFlight(); flight.start(cards.map(c => [c]), 70, new THREE.Vector3())
    flight.stage(0)
    cards.forEach((c, i) => assert.ok(c.position.distanceTo(homes[i]) < 1e-8, 'preparation starts at the authored pose'))
    flight.stage(1)
    const prepared = cards.map(c => c.position.clone())
    flight.sample(0)
    cards.forEach((c, i) => {
      assert.ok(c.position.distanceTo(prepared[i]) < 1e-6, 'prepared spacing joins the burst without a position jump')
      assert.ok(c.scale.distanceTo(new THREE.Vector3(1, 1, 1)) < 1e-8, 'preparation does not inflate cards')
    })
    flight.dispose(); geometry.dispose()
  }
  // Reusing parent inverses must still follow animated ancestors each frame.
  {
    const parent = new THREE.Group(), mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.95))
    parent.add(mesh)
    const flight = new PaperFlight(); flight.start([[mesh]], 70, new THREE.Vector3())
    flight.sample(.4); mesh.updateWorldMatrix(true, false)
    const before = mesh.matrixWorld.clone()
    parent.position.set(2, -1, 3); parent.rotation.set(.1, .2, -.3); parent.scale.setScalar(1.2)
    flight.sample(.4); mesh.updateWorldMatrix(true, false)
    assert.ok(mesh.matrixWorld.elements.every((v, i) => Math.abs(v - before.elements[i]) < 1e-8),
      'cached parent inverses refresh without dragging the world-space flight')
    flight.dispose(); mesh.geometry.dispose()
  }
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
      if (t === 0) for (let i = 0; i < stock.length; i++) for (let j = 0; j < i; j++) {
        assert.ok(!stock[i].intersectsOBB(stock[j]), `launch spacing separates stock: ${i}/${j}`)
      }
    }
    scene.updateWorldMatrix(true, true)
    const local = letter.getWorldPosition(new THREE.Vector3()).applyMatrix4(cards[0].matrixWorld.clone().invert())
    assert.ok(local.distanceTo(new THREE.Vector3(.2, .3, .04)) < 1e-5, 'word remains rigidly attached')
    for (const card of cards) assert.ok(card.scale.distanceTo(new THREE.Vector3(1, 1, 1)) < 1e-5, 'authored flight never inflates cards')
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
  assert.ok(regular.every((p, i) => Math.abs(p[0] - isolated[i][0]) < 1e-8 && Math.abs(p[1] - isolated[i][1]) < 1e-8), 'depth spacing cannot weaken the authored upward arc')
  assert.deepEqual(run([3600]), run([12]), 'background-tab catch-up is bounded after the paper leaves')
  console.log('PASS: analytic burst across frame drops/replay, rigid word attachment, unchanged card size, launch spacing')
}
void main()
