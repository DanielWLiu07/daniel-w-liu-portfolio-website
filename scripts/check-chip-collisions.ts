import assert from 'node:assert/strict'
import { Group, Matrix4, Mesh, Object3D, Quaternion, Vector3 } from 'three'
import { chipTableHull, createChipPile } from '../components/resume/casino/interactive-chip-pile'
import { createChipController } from '../components/resume/casino/chip-pile-controller'

async function check() {
  const table = chipTableHull(20, -15, new Matrix4().makeRotationX(-Math.PI / 2))
  for (const scale of [0.7, 1, 1.4]) {
    const radius = 0.55
    const homes = [
      { position: new Vector3(-2, 0.065, 0), quaternion: new Quaternion(), radius, height: 0.13 },
      { position: new Vector3(0, 0.065 * scale, 0), quaternion: new Quaternion(), radius: radius * scale, height: 0.13 * scale },
    ]
    const physics = await createChipPile(homes, radius, 0.13, table, true)
    const meshes = homes.map(() => new Object3D())
    // Only the incoming chip is clicked. The untouched chip must wake by collision.
    for (let i = 0; i < 100; i++) physics.kick(0, new Vector3(1, -0.025, 0))
    let penetration = 0, received = false
    for (let i = 0; i < 360; i++) {
      if (i > 0 && i < 60 && i % 12 === 0) physics.kick(0, new Vector3(1, -0.025, 0))
      physics.step(1 / 120, meshes)
      penetration = Math.min(penetration, physics.contactDistance(0, 1))
      if (physics.velocity(1).x > 0.1) received = true
    }
    assert.ok(received, 'Untouched chip receives momentum from the other pile')
    assert.ok(penetration > -0.012, `No deep chip penetration: ${penetration}`)
    assert.ok(meshes[1].position.x > 0.1, 'Recipient moves from physical contact, not AOE')
    physics.dispose()
    console.log({ scale, penetration, received })
  }
  // Repeated right-side punches refresh the table through the controller.
  // Resting chips across the table must stay asleep unless a chip reaches them.
  const isolated = createChipController(() => ({ radius: 20, chord: -15, matrix: new Matrix4().makeRotationX(-Math.PI / 2) }), () => 0.55)
  const resting = new Group(), punched = new Group()
  resting.position.x = -6; punched.position.x = 6
  const untouched = new Mesh(), target = new Mesh()
  untouched.position.y = target.position.y = 0.065
  resting.add(untouched); punched.add(target)
  const removeResting = isolated.register({ root: resting, meshes: [untouched], radius: 0.55, height: 0.13 })
  const removePunched = isolated.register({ root: punched, meshes: [target], radius: 0.55, height: 0.13 })
  isolated.impact(target.getWorldPosition(new Vector3()), 0.1, new Vector3(0, -0.1, -1))
  for (let i = 0; i < 200 && !isolated.active; i++) await new Promise(resolve => setTimeout(resolve, 5))
  assert.ok(isolated.active)
  isolated.step(1 / 120, 10)
  const restingPosition = untouched.position.clone(), restingRotation = untouched.quaternion.clone()
  let distantDrift = 0
  for (let i = 0; i < 240; i++) {
    if (i % 30 === 0) isolated.impact(target.getWorldPosition(new Vector3()), 0.1, new Vector3(0, -0.1, -1))
    isolated.step(1 / 120, 10 + i / 120)
    distantDrift = Math.max(distantDrift, untouched.position.distanceTo(restingPosition))
    assert.ok(untouched.quaternion.angleTo(restingRotation) < 1e-6, 'Remote punches do not rotate untouched chips')
  }
  assert.ok(distantDrift < 1e-6, `Remote punches do not wake untouched chips: drift ${distantDrift}`)
  removeResting(); removePunched(); isolated.dispose()
  const controller = createChipController(() => ({ radius: 20, chord: -15, matrix: new Matrix4().makeRotationX(-Math.PI / 2) }), () => 0.55)
  const left = new Group(), right = new Group()
  left.position.x = -2; right.position.x = 0
  right.rotation.y = 0.7; right.scale.setScalar(1.2)
  const a = new Mesh(), b = new Mesh()
  a.position.y = b.position.y = 0.065
  left.add(a); right.add(b)
  const unleft = controller.register({ root: left, meshes: [a], radius: 0.55, height: 0.13 })
  const unright = controller.register({ root: right, meshes: [b], radius: 0.55, height: 0.13 })
  // Spam before lazy initialization must be queued into the ONE world.
  for (let i = 0; i < 5; i++) controller.impact(new Vector3(-2, 0.065, 0), 0.1, new Vector3(1, -0.025, 0))
  for (let i = 0; i < 200 && !controller.active; i++) await new Promise(resolve => setTimeout(resolve, 5))
  assert.ok(controller.active, 'Shared world loads')
  for (let i = 0; i < 360; i++) controller.step(1 / 120, 10)
  assert.ok(b.getWorldPosition(new Vector3()).x > 0.1, 'Separate transformed render stacks collide')
  controller.step(1 / 120, 0)
  assert.ok(!controller.active, 'Replay disposes the shared world')
  unleft(); unright(); controller.dispose()
  console.log('PASS: cross-stack collision, scaled colliders, CCD spam, queued initialization and replay')
}
void check()
