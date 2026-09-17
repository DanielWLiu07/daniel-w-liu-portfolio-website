import assert from 'node:assert/strict'
import { Mesh } from 'three'
import { EYE_INKS } from '../components/resume/casino/eye'
import { eyeMaterial, sharedTitleEyeMaterial } from '../components/resume/casino/materials'

const shared = sharedTitleEyeMaterial()
for (const ink of [...EYE_INKS, ...EYE_INKS.toReversed()]) {
  const original = eyeMaterial('test', ink, true, false)
  for (const open of [0, .25, 1]) {
    const uniforms = { eyeOpen: { value: open }, eyeWeight: { value: 1.3 }, eyeIrisX: { value: -.18 }, eyeIrisY: { value: .09 } }
    const mesh = new Mesh()
    mesh.userData.casinoTitleEye = { ink, uniforms }
    for (const [name, node] of Object.entries(shared.userData.uniforms) as [string, any][]) {
      node.update({ object: mesh })
      const expected = uniforms[name as keyof typeof uniforms]?.value ?? original.userData.uniforms[name].value
      assert.equal(node.value, expected, `${ink}/${open}/${name}`)
    }
  }
  original.dispose()
}
shared.dispose()
console.log('PASS: shared eyes preserve all ink colours, independent blink and gaze uniforms in both draw orders')
