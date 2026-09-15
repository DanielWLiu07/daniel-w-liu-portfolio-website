import assert from 'node:assert/strict'
import { Group, Mesh } from 'three'
import { JACK_PARTS, jackSceneEditor, registerJackPart } from '../components/resume/casino/jack-scene-editor'
import { getTune, undoTune } from '../components/resume/casino/tune'
import type { ModalGesture } from 'blender-to-threejs'

const root = new Group(), card = new Group(), word = new Group(), letter = new Mesh()
root.add(card, word); word.add(letter)
const removers = [jackSceneEditor.add('jack-title', root, { name: 'Jack of All Trades' }), registerJackPart(JACK_PARTS[0], card, () => 0.01), registerJackPart(JACK_PARTS[1], word, () => 0.01)]
const gesture = (mode: ModalGesture['mode'], exact: number, axis: ModalGesture['axis'] = null): ModalGesture => ({ mode, exact, axis, dx: 0, dy: 0, fine: false })
for (const part of JACK_PARTS.slice(0, 2)) {
  jackSceneEditor.select(part.id)
  const initial = getTune()
  assert.ok(jackSceneEditor.begin('move'))
  jackSceneEditor.update(gesture('move', 0.25, 'x')); jackSceneEditor.commit(gesture('move', 0.25, 'x'))
  assert.ok(Math.abs(getTune()[part.x] - initial[part.x] - 0.25) < 1e-8)
  jackSceneEditor.begin('scale'); jackSceneEditor.update(gesture('scale', 1.2)); jackSceneEditor.commit(gesture('scale', 1.2))
  assert.ok(Math.abs(getTune()[part.s] - initial[part.s] * 1.2) < 1e-8)
  jackSceneEditor.begin('rotate'); jackSceneEditor.update(gesture('rotate', 15)); jackSceneEditor.commit(gesture('rotate', 15))
  assert.ok(Math.abs(getTune()[part.r] - initial[part.r] - Math.PI / 12) < 1e-8)
  assert.ok(undoTune()); assert.equal(getTune()[part.r], initial[part.r])
  jackSceneEditor.begin('move'); jackSceneEditor.update(gesture('move', 0.5, 'y')); jackSceneEditor.cancel()
  assert.equal(getTune()[part.y], initial[part.y])
}
jackSceneEditor.pick(letter)
assert.equal(jackSceneEditor.selectedId(), 'JACK', 'Nested glyph picks its authored word')
assert.equal(jackSceneEditor.tree()[0].children.length, 2)
jackSceneEditor.begin('move'); jackSceneEditor.update(gesture('move', 0.5, 'y'))
const beforeCancel = getTune().jkJackY
jackSceneEditor.select('card')
assert.ok(Math.abs(getTune().jkJackY - (beforeCancel - 0.5)) < 1e-9, 'Selection change cancels transform')
removers.reverse().forEach(remove => remove())
assert.equal(jackSceneEditor.tree().length, 0)
console.log('PASS: two-object hierarchy/selection/G/S/R/confirm/cancel/undo/nested pick and cleanup')
