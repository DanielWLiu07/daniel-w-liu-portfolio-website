import assert from 'node:assert/strict'
import { Mesh } from 'three'
import { CHIP_INKS, LIT_MATERIALS, chipWatercolorMaterial, sharedChipWatercolorMaterials } from '../components/resume/casino/materials'
const shared = sharedChipWatercolorMaterials()
assert.equal(shared[1], shared[2])
for (const ink of [...CHIP_INKS, ...CHIP_INKS.toReversed()]) {
  const expected = chipWatercolorMaterial(ink)
  const mesh = new Mesh(); mesh.userData.casinoChipInk = ink
  for (const material of new Set(shared)) for (const name of ['inkR', 'inkG', 'inkB', 'trimR', 'trimG', 'trimB']) {
    const node = material.userData.uniforms[name]
    node.update({ object: mesh })
    assert.equal(node.value, expected.userData.uniforms[name].value, `${ink}: ${name} stays independent of draw order`)
  }
  LIT_MATERIALS.delete(expected); expected.dispose()
}
for (const material of new Set(shared)) { LIT_MATERIALS.delete(material); material.dispose() }
console.log('PASS: shared surface graphs retain every denomination and trim in both draw orders')
