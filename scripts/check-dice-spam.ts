import assert from 'node:assert/strict'
import { Quaternion, Vector3 } from 'three'
import { createInteractiveDie } from '../components/resume/casino/interactive-die'

async function main() {
  const p = new Vector3(0, 0.5, 0), q = new Quaternion()
  const physics = await createInteractiveDie(p, q, new Vector3(), 1)
  try {
    physics.kick()
    for (let i = 0; i < 8; i++) physics.step(1 / 120, p, q)
    const before = p.clone()
    const velocityBefore = physics.velocity()
    physics.kick()
    const velocityAfter = physics.velocity()
    assert.ok(Math.abs(velocityAfter.x - velocityBefore.x) < 1e-6 && Math.abs(velocityAfter.z - velocityBefore.z) < 1e-6, 'click never retargets horizontal motion')
    assert.ok(velocityAfter.y >= velocityBefore.y - 1e-6, 'click never applies a downward impulse')
    assert.ok(p.equals(before), 'midair click does not teleport')
    physics.step(1 / 120, p, q)
    assert.ok(p.y > before.y, 'midair click adds lift')
    for (let i = 0; i < 360; i++) {
      if (i % 15 === 0) {
        const v = physics.velocity()
        physics.kick()
        const next = physics.velocity()
        assert.ok(next.y >= v.y - 1e-6, 'height cap cannot kick a rising die backwards')
        assert.ok(Math.abs(next.x - v.x) + Math.abs(next.z - v.z) < 1e-6)
      }
      physics.step(1 / 120, p, q)
      assert.ok(p.y < 8, 'spam has bounded energy')
      assert.ok(Number.isFinite(p.y))
    }
    let awake = true
    for (let i = 0; i < 2400 && awake; i++) awake = physics.step(1 / 120, p, q)
    assert.ok(!awake, 'simulation sleeps when the die rests')
    assert.ok(Math.hypot(p.x, p.z) <= 0.55, 'rest stays inside the landing circle')
    console.log('OK: repeat midair impulses, no teleport, bounded spam, in-circle rest and sleep')
  } finally { physics.dispose() }
}
void main()
