import assert from 'node:assert/strict'
import { Group, Mesh } from 'three'
import { revealWarmupActors } from '../components/resume/casino/scene-warmup'

const scene = new Group(), hidden = new Group(), dealer = new Mesh(), decal = new Mesh()
hidden.visible = false
dealer.visible = false
dealer.userData.dealerSkull = false
dealer.userData.compNoPosition = true
decal.userData.compNoPosition = true
hidden.add(dealer, decal); scene.add(hidden)
for (let replay = 0; replay < 3; replay++) {
  const restore = revealWarmupActors(scene)
  assert.ok(hidden.visible && dealer.visible && dealer.castShadow)
  assert.equal(dealer.frustumCulled, false)
  assert.equal(dealer.userData.compNoPosition, false)
  assert.equal(decal.userData.compNoPosition, true, 'ordinary decals retain their pass exclusions')
  restore()
  assert.equal(hidden.visible, false)
  assert.equal(dealer.visible, false)
  assert.equal(dealer.castShadow, false)
  assert.equal(dealer.frustumCulled, true)
  assert.equal(dealer.userData.compNoPosition, true)
  assert.equal(Object.hasOwn(hidden.userData, 'compNoPosition'), false)
}
console.log('PASS: covered warmup reveals future actors and restores visibility, culling, shadows and pass exclusions')
