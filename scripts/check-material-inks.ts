import assert from 'node:assert/strict'
import { CASINO_PALETTE } from 'blender-to-threejs'
import { CHIP_INKS, chipMaterial, chipFaceMaterial, chipWatercolorMaterial, chipFaceWatercolorMaterial, solidWatercolorMaterial, diceMaterial, eyeMaterial, folderMaterial, roomMaterial } from '../components/resume/casino/materials'

const [black, red, green, gold] = CASINO_PALETTE.inks
const inks = { black, red, green, gold, white: CASINO_PALETTE.paper, blue: [0.13, 0.32, 0.62], purple: [0.36, 0.18, 0.48], orange: [0.85, 0.42, 0.13] }
type Material = ReturnType<typeof chipMaterial>
function channels(m: Material, prefix: string) {
  return ['R', 'G', 'B'].map(c => m.userData.uniforms[`${prefix}${c}`].value)
}
for (const factory of [chipMaterial, chipFaceMaterial, chipWatercolorMaterial, chipFaceWatercolorMaterial, solidWatercolorMaterial]) {
  const materials = CHIP_INKS.map(ink => {
    const m = factory(ink)
    assert.deepEqual(channels(m, 'ink'), inks[ink], `${factory.name}: exact linear colour`)
    if (factory !== solidWatercolorMaterial) assert.deepEqual(channels(m, 'trim'), ink === 'white' ? red : CASINO_PALETTE.paper)
    return m
  })
  assert.equal(new Set(materials.map(m => m.userData.uniforms.inkR)).size, materials.length, 'uniforms must remain material-owned')
  materials.forEach(m => m.dispose())
}
const die = diceMaterial('white', 'black')
assert.deepEqual(channels(die, 'ink'), inks.white)
assert.deepEqual(channels(die, 'pip'), inks.black)
die.dispose()
for (const [kind, expected] of Object.entries({ body: [.8, .63, .36], tab: [.66, .5, .27], sheet: [.92, .9, .84], ink: [.09, .06, .05] })) {
  const m = folderMaterial(kind as Parameters<typeof folderMaterial>[0])
  assert.deepEqual(channels(m, 'ink'), expected)
  m.dispose()
}
for (const kind of ['wall', 'floor'] as const) {
  const m = roomMaterial(kind)
  assert.deepEqual(channels(m, 'ink'), kind === 'wall' ? [.17, .12, .09] : [.1, .075, .06])
  m.dispose()
}
for (const flat of [false, true]) for (const wobble of [false, true]) {
  const a = eyeMaterial('testA', 'red', flat, wobble)
  const b = eyeMaterial('testB', 'gold', flat, wobble)
  assert.deepEqual(channels(a, 'ink'), red)
  assert.deepEqual(channels(b, 'ink'), gold)
  for (const name of Object.keys(a.userData.uniforms)) assert.notEqual(a.userData.uniforms[name], b.userData.uniforms[name], `${name}: independent eye animation`)
  a.dispose(); b.dispose()
}
console.log('PASS: shared shader inks preserve exact colours, chip trim, and independent material/eye uniforms')
