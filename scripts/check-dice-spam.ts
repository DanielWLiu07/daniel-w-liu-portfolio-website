import assert from 'node:assert/strict'
import { Matrix4, Quaternion, Vector3 } from 'three'
import { createInteractiveDie, chipTableHull } from '../components/resume/casino/interactive-die'

async function main() {
  const p = new Vector3(0, .5, 0), q = new Quaternion()
  const physics = await createInteractiveDie(p, q, new Vector3(), 1)
  try {
    const direction = new Vector3(.8, 1, .3).normalize()
    physics.kick(direction)
    const initial = physics.velocity()
    assert.ok(Math.hypot(initial.x, initial.y, initial.z) <= 11.001, 'single hit uses the die radius, not its full width')
    for (let i = 0; i < 8; i++) physics.step(1 / 120, p, q)
    const before = p.clone(), velocityBefore = physics.velocity()
    physics.kick(direction)
    const after = physics.velocity()
    assert.ok(p.equals(before), 'midair hit never teleports')
    assert.ok(after.x > velocityBefore.x && after.y > velocityBefore.y, 'another hit adds directional momentum')
    // Repeated hits remain free to blast the die beyond its old cage even
    // though an ordinary single click now has a readable, smaller impulse.
    physics.kick(direction)
    physics.kick(direction)
    let highest = p.y, farthest = 0
    for (let i = 0; i < 720; i++) {
      physics.step(1 / 120, p, q)
      highest = Math.max(highest, p.y); farthest = Math.max(farthest, Math.hypot(p.x, p.z))
      assert.ok(p.toArray().every(Number.isFinite) && q.toArray().every(Number.isFinite))
    }
    assert.ok(highest > 4, 'dice can fly above the old height ceiling')
    assert.ok(farthest > 5, 'dice can travel well outside the old landing circle')
  } finally { physics.dispose() }
  p.set(0, .5, 0); q.identity()
  const vertices = chipTableHull(3, -2, new Matrix4().makeRotationX(-Math.PI / 2))
  const falling = await createInteractiveDie(p, q, new Vector3(), 1, {x:0,y:0,z:0}, { vertices, floorY: -8 })
  try {
    falling.kick(new Vector3(1, .15, 0).normalize(), new Vector3(0, .9, .3))
    let awake = true, belowTable = false
    for (let i = 0; i < 3600 && awake; i++) {
      awake = falling.step(1 / 120, p, q)
      belowTable ||= p.y < -2
    }
    assert.ok(belowTable, 'finite table lets a blasted die fall off its edge')
    assert.ok(!awake, 'off-table die settles and stops spending simulation work')
    assert.ok(p.y > -8 && p.y < -7, 'die rests on the real room floor')
    assert.ok(Math.hypot(p.x, p.z) > 3, 'die does not return to its original space')
  } finally { falling.dispose() }
  console.log('PASS: directional midair hits, no landing circle or height ceiling, table-edge fall and floor sleep')
}
void main()
