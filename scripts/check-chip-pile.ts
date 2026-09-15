import assert from 'node:assert/strict'
import { Matrix4, Mesh, Quaternion, Vector3 } from 'three'
import { chipTableHull, createChipPile } from '../components/resume/casino/interactive-chip-pile'

async function check() {
  const direction = new Vector3(0.2, -0.45, -1).normalize()
  const table = chipTableHull(20, -15, new Matrix4().makeRotationX(-Math.PI / 2))
  const area = await createChipPile([0, 1, 5].map(x => ({ position: new Vector3(x, 0.065, 0), quaternion: new Quaternion() })), 0.55, 0.13, table)
  area.impact(new Vector3(0, 0.13, 0), 1.4, direction)
  const speed = (index: number) => new Vector3().copy(area.velocity(index)).length()
  assert.ok(speed(0) > speed(1) && speed(1) > 0, 'AOE weakens with distance')
  assert.ok(speed(1) < speed(0) * 0.25, 'Blast falls off sharply, not a uniform pile shove')
  assert.equal(speed(2), 0, 'Distant chips unaffected')
  for (let i = 0; i < 2; i++) {
    const velocity = new Vector3().copy(area.velocity(i))
    assert.ok(velocity.clone().normalize().distanceTo(direction) < 1e-6, 'Blast follows viewer ray')
    assert.ok(velocity.y < 0, 'No artificial upward impulse')
  }
  for (let i = 0; i < 100; i++) area.impact(new Vector3(0, 0.13, 0), 1.4, direction)
  assert.ok(speed(0) <= 24 * 0.55 + 1e-5, 'Spam impulse speed is bounded')
  area.dispose()
  const column = await createChipPile([0, 1, 2, 3].map(k => ({ position: new Vector3(0, 0.065 + k * 0.13, 0), quaternion: new Quaternion() })), 0.55, 0.13, table)
  column.impact(new Vector3(0.55, 0.065, 0), 0.55 * 0.85, direction)
  const columnSpeeds = [0, 1, 2, 3].map(i => new Vector3().copy(column.velocity(i)).length())
  assert.ok(columnSpeeds[0] > columnSpeeds[1] && columnSpeeds[1] > columnSpeeds[2], 'Adjacent thin chips get distinct forces')
  assert.ok(columnSpeeds[2] < columnSpeeds[0] * 0.15, 'Two layers away the blast is already much weaker')
  column.dispose()
  for (const count of [1, 4, 8]) {
    const homes = Array.from({ length: count }, (_, k) => ({ position: new Vector3(0, 0.065 + k * 0.13, 0), quaternion: new Quaternion() }))
    const meshes = homes.map(home => { const m = new Mesh(); m.position.copy(home.position); m.quaternion.copy(home.quaternion); return m })
    const physics = await createChipPile(homes, 0.55, 0.13, table)
    physics.kick(count - 1, direction)
    const launch = physics.velocity(count - 1)
    assert.ok(new Vector3().copy(launch).distanceTo(direction.clone().multiplyScalar(22 * 0.55)) < 1e-5, 'Strong perspective-directed impulse')
    let maxY = 0
    for (let i = 0; i < 240; i++) {
      if (i > 0 && i < 60 && i % 15 === 0) {
        const before = meshes[count - 1].position.clone()
        const velocity = new Vector3().copy(physics.velocity(count - 1))
        physics.kick(count - 1, direction)
        const change = new Vector3().copy(physics.velocity(count - 1)).sub(velocity)
        assert.ok(change.clone().cross(direction).length() < 1e-5, 'Repeated hits preserve ray direction')
        assert.ok(change.dot(direction) >= -1e-5, 'No backwards click force')
        assert.ok(meshes[count - 1].position.equals(before), 'No pose reset on repeated click')
      }
      physics.step(1 / 120, meshes)
      maxY = Math.max(maxY, ...meshes.map(m => m.position.y))
    }
    assert.ok(meshes[count - 1].position.z < -0.1, 'Chip is pushed into the scene')
    physics.impact(meshes[count - 1].position.clone(), 0.55 * 0.85, direction)
    let moving = true
    for (let i = 0; i < 3600 && moving; i++) moving = physics.step(1 / 120, meshes)
    if (moving) console.log(meshes.map((mesh, index) => ({ p: mesh.position.toArray(), v: physics.velocity(index) })))
    assert.ok(!moving, 'Pile eventually sleeps')
    for (const mesh of meshes) {
      assert.ok(!mesh.visible || (mesh.position.y > 0 && mesh.position.y < 2), `Resting chip remains on felt: ${mesh.position.toArray()}`)
      // AOE lets the pile spread; friction still brings it to rest on the felt.
      assert.ok(!mesh.visible || Math.hypot(mesh.position.x, mesh.position.z) < 20)
    }
    physics.dispose()
    console.log({ count, maxY, settled: !moving })
  }
  for (const edge of ['chord', 'arc']) {
    const position = edge === 'chord' ? new Vector3(0, 0.065, -0.4) : new Vector3(1.5, 0.065, 0)
    const mesh = new Mesh(); mesh.position.copy(position)
    const physics = await createChipPile([{ position, quaternion: new Quaternion() }], 0.55, 0.13,
      chipTableHull(2, -1, new Matrix4().makeRotationX(-Math.PI / 2)))
    physics.kick(0, edge === 'chord' ? new Vector3(0, -0.1, -1) : new Vector3(1, -0.1, 0))
    let fell = false, moving = true
    for (let i = 0; i < 1200 && moving; i++) {
      moving = physics.step(1 / 120, [mesh])
      if (mesh.position.y < -1) fell = true
    }
    assert.ok(fell, `Chip falls off ${edge} edge without an invisible floor`)
    assert.ok(!moving && !mesh.visible, 'Offscreen fallen chips stop consuming physics work')
    physics.dispose()
  }
  console.log('PASS: concentrated blast, nonuniform falloff, finite arc/chord edges and fallen-chip cleanup')
}
void check()
