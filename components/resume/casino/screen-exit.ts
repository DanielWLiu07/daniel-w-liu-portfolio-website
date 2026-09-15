import * as THREE from 'three'

/** Retire only beyond the intended exit edge, never on a wall-clock deadline.
 * Whole world bounds include tilted stock and attached lettering. */
export class ScreenExit {
  private box = new THREE.Box3()
  private matrix = new THREE.Matrix4()
  private frustum = new THREE.Frustum()
  private corner = new THREE.Vector3()

  cleared(object: THREE.Object3D, camera: THREE.Camera, edge: 'right' | 'bottom') {
    camera.updateWorldMatrix(true, false)
    object.updateWorldMatrix(true, true)
    this.box.setFromObject(object)
    if (this.box.isEmpty()) return true
    this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    this.frustum.setFromProjectionMatrix(this.matrix, camera.coordinateSystem)
    const plane = this.frustum.planes[edge === 'right' ? 0 : 2]
    // Corner closest to the visible half-space: all corners must be outside.
    this.corner.set(
      plane.normal.x >= 0 ? this.box.max.x : this.box.min.x,
      plane.normal.y >= 0 ? this.box.max.y : this.box.min.y,
      plane.normal.z >= 0 ? this.box.max.z : this.box.min.z,
    )
    return plane.distanceToPoint(this.corner) < -.15
  }
}
