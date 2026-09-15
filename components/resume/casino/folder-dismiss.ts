import * as THREE from 'three'

/** Test the folder itself: a click on the table still counts as outside. */
export function listenForFolderDismiss(
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  folder: THREE.Object3D,
  onClose: () => void,
) {
  const ray = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let down: { x: number; y: number } | null = null
  const onDown = (event: PointerEvent) => {
    down = event.button === 0 ? { x: event.clientX, y: event.clientY } : null
  }
  const onCancel = () => { down = null }
  const onClick = (event: MouseEvent) => {
    const start = down
    down = null
    if (event.button !== 0 || !start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2)
    camera.updateWorldMatrix(true, false)
    folder.updateWorldMatrix(true, true)
    ray.setFromCamera(pointer, camera)
    const inside = ray.intersectObject(folder, true).some(({ object }) => {
      for (let node: THREE.Object3D | null = object; node; node = node.parent) {
        if (!node.visible) return false
      }
      return true
    })
    if (inside) return
    // Consume the dismissal so it cannot also activate a prop behind the file.
    event.stopImmediatePropagation()
    onClose()
  }
  const options = { capture: true }
  canvas.addEventListener('pointerdown', onDown, options)
  canvas.addEventListener('pointercancel', onCancel, options)
  canvas.addEventListener('click', onClick, options)
  return () => {
    canvas.removeEventListener('pointerdown', onDown, options)
    canvas.removeEventListener('pointercancel', onCancel, options)
    canvas.removeEventListener('click', onClick, options)
  }
}
