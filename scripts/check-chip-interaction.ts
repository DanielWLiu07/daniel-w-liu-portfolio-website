import assert from 'node:assert/strict'
import { Quaternion, Vector3 } from 'three'
import { createInteractiveChip } from '../components/resume/casino/chip-interaction'

async function check() {
  for (const { fps, spam } of [30, 60, 120].flatMap(fps => [{ fps, spam: false }, { fps, spam: true }])) {
    const physics = await createInteractiveChip(new Quaternion())
    physics.setFolder(new Vector3(-2, 0, 0.6), new Vector3(2, 0.4, 3))
    const p = new Vector3(), q = new Quaternion()
    physics.kick()
    let maxY = 0
    for (let i = 0; i < fps * 3; i++) {
      if (spam && i % Math.max(1, Math.floor(fps / 5)) === 0) {
        const velocity = physics.velocity()
        physics.kick()
        assert.ok(physics.velocity().y >= velocity.y)
        assert.equal(physics.velocity().x, velocity.x)
        assert.equal(physics.velocity().z, velocity.z)
      }
      physics.step(1 / fps, p, q)
      maxY = Math.max(maxY, p.y)
      assert.ok(Number.isFinite(p.y) && p.y > 0)
      assert.ok(Math.abs(q.length() - 1) < 0.001)
    }
    assert.ok(maxY < 3.2)
    for (let i = 0; i < fps * 20; i++) physics.step(1 / fps, p, q)
    assert.ok(physics.sleeping(), 'Eventually sleeps')
    assert.ok(Math.hypot(p.x, p.z) < 0.5, 'Stays in landing area')
    const up = new Vector3(0, 1, 0).applyQuaternion(q)
    assert.ok(Math.abs(up.y) > 0.98, 'Settles flat through contact physics')
    assert.ok(Math.abs(p.y - 0.065) < 0.015, 'Rests at physical thickness')
    assert.ok(p.z + 0.55 < 0.62, 'Resting chip clears the folder collider')
    console.log({ fps, spam, maxY, position: p.toArray() })
    physics.dispose()
  }
  console.log('Chip rigid body: bounded spam impulses, flat physical rest, frame rates and sleep pass.')
}
void check()
