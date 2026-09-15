import assert from 'node:assert/strict'
import { Frustum, Matrix4, PerspectiveCamera, Vector3 } from 'three'
import { offscreenPlaneTravel, placeAt, wordAt, wordShot, WORD_DEFAULTS } from '../components/resume/casino/stop-motion'

for (const aspect of [0.45, 1, 16 / 9, 32 / 9]) {
  const camera = new PerspectiveCamera(45, aspect, 0.1, 100)
  camera.position.set(0, 4.6, 12.5)
  camera.lookAt(0, 1.4, 0)
  camera.updateMatrixWorld()
  for (const scale of [0.65, 1, 1.4]) {
    const local = new Matrix4().makeRotationZ(0.08).scale(new Vector3(scale, scale, scale))
    const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(local))
    for (const side of [-1, 0, 1]) {
      const plane = frustum.planes[side < 0 ? 1 : side > 0 ? 0 : 3]
      const home = new Vector3(side * 2, 3, 0)
      const direction = new Vector3(side, side === 0 ? 1 : 0, 0)
      for (const radius of [0.4, 1.5, 3]) {
        const distance = offscreenPlaneTravel(plane.distanceToPoint(home), radius + 0.15, plane.normal.dot(direction))
        const start = home.clone().addScaledVector(direction, distance)
        assert.ok(plane.distanceToPoint(start) + radius < -0.1499, 'Entire rotating word clears viewport')
      }
    }
  }
}
const shot = wordShot(1, 3, WORD_DEFAULTS, 11)
for (const age of [3, 5, 10]) {
  const approach = Math.max(0, 1 - placeAt(age, shot.cue, 12, WORD_DEFAULTS.step).k)
  assert.equal(approach, 0, 'Viewport travel disappears at rest')
  assert.ok(Math.abs(wordAt(age, shot, WORD_DEFAULTS, 12).x) < 1e-12)
}
console.log('Title entry: whole-word offscreen bounds across aspect ratios/scales; exact final home pass.')
