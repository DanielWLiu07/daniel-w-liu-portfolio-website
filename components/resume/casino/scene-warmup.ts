import type { Object3D } from 'three'

/** Expose future actors for one covered render of every real compositor pass.
 * No clocks/poses are advanced; restore exactly, including absent userData keys.
 */
export function revealWarmupActors(scene: Object3D): () => void {
  const saved: { object: Object3D; visible: boolean; culled: boolean; shadow: boolean; noPosition: unknown; hadNoPosition: boolean }[] = []
  scene.traverse(object => {
    saved.push({ object, visible: object.visible, culled: object.frustumCulled, shadow: object.castShadow,
      noPosition: object.userData.compNoPosition, hadNoPosition: Object.hasOwn(object.userData, 'compNoPosition') })
    object.visible = true
    object.frustumCulled = false
    // The dealer opts out of position/occlusion while revealing, but must be
    // prepared in its fully landed state too (including skinned shadow variants).
    if (object.userData.dealerSkull !== undefined) {
      object.castShadow = true
      object.userData.compNoPosition = false
    }
  })
  return () => {
    for (const state of saved) {
      state.object.visible = state.visible
      state.object.frustumCulled = state.culled
      state.object.castShadow = state.shadow
      if (state.hadNoPosition) state.object.userData.compNoPosition = state.noPosition
      else delete state.object.userData.compNoPosition
    }
  }
}
