import assert from 'node:assert/strict'
import { Matrix4, Quaternion, Vector3 } from 'three'
import { propArrival, bakedDiePose, diceEntranceYaw } from '../components/resume/casino/prop-arrival'
import bake from '../components/resume/casino/dice-baked.json'

assert.equal(propArrival(-0.01, 1).visible, false)
assert.equal(propArrival(0, 1).remaining, 1)
assert.equal(propArrival(1, 1).remaining, 0)
const p = new Vector3(), q = new Quaternion(), previous = new Quaternion(), matrix = new Matrix4()
for (let variant = 0; variant < bake.clips.length; variant++) {
  const clip = bake.clips[variant]
  for (const size of [0.2, 0.86, 2]) {
    assert.equal(bakedDiePose(-1, size, variant, p, q), false)
    for (let frame = 0; frame < (clip.length - 1) * 2; frame++) {
      bakedDiePose(frame / 120, size, variant, p, q)
      matrix.makeRotationFromQuaternion(q)
      const e = matrix.elements
      const support = size * (0.4 * (Math.abs(e[1]) + Math.abs(e[5]) + Math.abs(e[9])) + 0.1)
      assert.ok(p.y >= support - size * 0.025, 'rounded die stays above felt within solver/interpolation tolerance')
      if (frame) assert.ok(previous.angleTo(q) < 0.35, 'no orientation snaps beyond the recorded collision spin')
      previous.copy(q)
    }
    bakedDiePose(20, size, variant, p, q)
    assert.ok(p.distanceTo(new Vector3(0, size / 2, 0)) < 1e-9)
    assert.ok(q.angleTo(new Quaternion()) < 1e-9)
  }
}
console.log('OK: baked rigid-body support, continuous playback, hidden pre-cue and exact saved landing')

for (let variant = 0; variant < 2; variant++) {
  const parentYaw = variant ? 1.4726 : 3.4207
  bakedDiePose(0, 1, variant, p, q)
  p.applyAxisAngle(new Vector3(0, 1, 0), diceEntranceYaw(variant, parentYaw) + parentYaw)
  assert.ok(variant ? p.x > 0 : p.x < 0, 'entrances start from opposite sides')
}
console.log('OK: opposite-side entrances; interactive impulses covered by check-dice-spam.ts')

// The left entrance must read as a sideways throw from its first visible poses,
// not a vertical drop followed by a depth/lateral swerve at the first collision.
{
  const clip = bake.clips[0]
  const yaw = diceEntranceYaw(0, 0)
  const axis = new Vector3(0, 1, 0)
  const path = clip.map(f => new Vector3(f[0], f[1], f[2]).applyAxisAngle(axis, yaw))
  assert.ok(path[12].x - path[0].x > 1.5, 'left die already travels right in its first 0.2s')
  assert.ok(Math.max(...path.map(v => Math.abs(v.z))) < 0.4, 'left throw stays in a shallow side-to-side lane')
  assert.ok(path[0].y < 3, 'left entrance is a low throw, not a tall vertical drop')
}
