import assert from 'node:assert/strict'
import * as THREE from 'three'
import { listenForFolderDismiss } from '../components/resume/casino/folder-dismiss'

class CanvasTarget extends EventTarget {
  getBoundingClientRect() { return { left: 100, top: 50, width: 1000, height: 800 } }
}
const canvas = new CanvasTarget()
const camera = new THREE.PerspectiveCamera(50, 1.25, 0.1, 100)
camera.position.z = 5
const folder = new THREE.Group()
const leaf = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial())
folder.add(leaf)
let closed = 0, behind = 0
const cleanup = listenForFolderDismiss(canvas as unknown as HTMLCanvasElement, camera, folder, () => { closed++ })
canvas.addEventListener('click', () => { behind++ })
const send = (type: string, x: number, y: number, button = 0) => {
  const event = new Event(type)
  Object.assign(event, { clientX: x, clientY: y, button })
  canvas.dispatchEvent(event)
}
const click = (x: number, y: number, button = 0) => {
  send('pointerdown', x, y, button)
  send('click', x, y, button)
}
click(600, 450)
assert.equal(closed, 0, 'folder clicks remain available to its own controls')
assert.equal(behind, 1)
click(1050, 750)
assert.equal(closed, 1, 'outside click closes')
assert.equal(behind, 1, 'dismissal cannot click through to the scene')
send('pointerdown', 600, 450)
send('click', 1050, 750)
assert.equal(closed, 1, 'dragging out of the folder does not close')
click(1050, 750, 2)
assert.equal(closed, 1, 'right-click does not close')
send('pointerdown', 1050, 750)
send('pointercancel', 1050, 750)
send('click', 1050, 750)
assert.equal(closed, 1, 'cancelled gestures do not close')
leaf.visible = false
click(600, 450)
assert.equal(closed, 2, 'invisible geometry cannot claim an inside click')
leaf.visible = true
folder.visible = false
click(600, 450)
assert.equal(closed, 3, 'invisible ancestors cannot claim an inside click')
cleanup()
click(1050, 750)
assert.equal(closed, 3, 'listeners are removed after closing/unmounting')
leaf.geometry.dispose()
leaf.material.dispose()
console.log('Folder dismissal: inside/outside, no click-through, drag, right-click, cancellation, visibility and cleanup pass.')
