import assert from 'node:assert/strict'
import * as THREE from 'three'
import { ScreenExit } from '../components/resume/casino/screen-exit'

const exit = new ScreenExit()
let checks = 0
for (const aspect of [430 / 932, 1, 1.6, 2.4]) {
  const camera = new THREE.PerspectiveCamera(38, aspect, .1, 1000)
  camera.position.set(2, 7, 12)
  camera.lookAt(0, 3, 0)
  camera.updateWorldMatrix(true, false)
  const card = new THREE.Mesh(new THREE.BoxGeometry(3, 5, .1))
  const hh = Math.tan(38 * Math.PI / 360) * 11
  for (const edge of ['right', 'bottom'] as const) {
    for (let i = 0; i < 100; i++) {
      const distance = i * .15
      card.position.set(edge === 'right' ? distance : 0, edge === 'bottom' ? -distance : 0, -11).applyMatrix4(camera.matrixWorld)
      card.quaternion.copy(camera.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(.2, .3, i * .04)))
      card.updateWorldMatrix(true, false)
      const cleared = exit.cleared(card, camera, edge)
      const points = card.geometry.attributes.position
      for (let j = 0; j < points.count; j++) {
        const p = new THREE.Vector3().fromBufferAttribute(points, j).applyMatrix4(card.matrixWorld).project(camera)
        if (cleared) assert.ok(edge === 'right' ? p.x > 1 : p.y < -1, 'no corner may be chopped at retirement')
      }
      if (distance < (edge === 'right' ? hh * aspect : hh)) assert.equal(cleared, false)
      checks++
    }
    assert.ok(exit.cleared(card, camera, edge), 'eventually retires beyond the intended edge')
  }
}
console.log(`PASS: ${checks} rotated card exit poses across portrait/landscape; no premature retirement`)
