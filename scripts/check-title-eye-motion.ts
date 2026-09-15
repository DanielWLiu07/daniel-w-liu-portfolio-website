import assert from 'node:assert/strict'
import { titleEyeMotion } from '../components/resume/casino/title-eye-motion'

const closures: number[][] = []
for (let index = 0; index < 4; index++) {
  const blinkTimes: number[] = []
  let previous = titleEyeMotion(1, index), wasClosed = false
  for (let frame = 241; frame < 30 * 240; frame++) {
    const t = frame / 240, pose = titleEyeMotion(t, index)
    assert.ok(pose.open >= 0 && pose.open <= 1)
    assert.ok(Math.abs(pose.x) <= 0.016 && Math.abs(pose.y) <= 0.024, 'drift stays beside authored placement')
    assert.ok(pose.scale >= 0.982 && pose.scale <= 1.018, 'breathing stays subtle after opening')
    for (const key of ['x', 'y', 'roll', 'tilt', 'yaw', 'gazeX', 'gazeY'] as const) {
      assert.ok(Math.abs(pose[key] - previous[key]) < 0.015, `${key} remains continuous`)
    }
    const closed = pose.open < 0.1
    if (closed && !wasClosed) blinkTimes.push(t)
    wasClosed = closed; previous = pose
  }
  assert.ok(blinkTimes.length >= 5, 'every eye visibly closes repeatedly')
  closures.push(blinkTimes)
  assert.deepEqual(titleEyeMotion(1, index, true), titleEyeMotion(29, index, true), 'placement mode is stationary')
  const rest = titleEyeMotion(20, index, true)
  assert.equal(rest.open, 1); assert.equal(rest.scale, 1)
  assert.equal(rest.x, 0); assert.equal(rest.y, 0); assert.equal(rest.roll, 0)
}
for (let index = 1; index < 4; index++) assert.notDeepEqual(closures[0], closures[index], 'eyes blink independently')
console.log('Eye motion: bounded, continuous, independently blinking, and stationary while editing.')
