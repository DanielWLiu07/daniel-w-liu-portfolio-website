import * as THREE from 'three'

const FLIGHT_FOREGROUND = ['flight-roulette', 'flight-royal-flush', 'roulette-caption', 'royal-flush-caption'] as const

/** Conservative card/word volumes, in the common intro coordinate system.
 * Keep authored XY travel and rotations; overlapping volumes are separated
 * toward the back, never toward the chip/foreground flight props.
 */
export class FallingCardDepth {
  private boxes: THREE.Box3[]
  private inverse = new THREE.Matrix4()
  private matrix = new THREE.Matrix4()
  private part = new THREE.Box3()
  private foreground = new THREE.Box3()
  private paper = new THREE.Box3()
  private origin = new THREE.Vector3()
  private cameraOrigin = new THREE.Vector3()
  private authoredPosition = new THREE.Vector3()
  private authoredScale = new THREE.Vector3()
  private dilated = false
  constructor(private bodies: readonly (readonly THREE.Mesh[])[]) {
    this.boxes = bodies.map(() => new THREE.Box3())
  }

  restore(root: THREE.Object3D) {
    if (!this.dilated) return
    root.position.copy(this.authoredPosition)
    root.scale.copy(this.authoredScale)
    this.dilated = false
  }

  /** Perspective dilation: move the entire paper layer behind the foreground
   * without changing a single projected corner, gap, or falling trajectory.
   * Run after flight/dealer transforms and before the existing compositor.
   * The normal animation restores root's authored transform next frame.
   */
  behindForeground(root: THREE.Object3D, camera: THREE.Camera, scene: THREE.Scene) {
    camera.updateWorldMatrix(true, false)
    this.foreground.makeEmpty()
    for (const name of FLIGHT_FOREGROUND) {
      const object = scene.getObjectByName(name)
      if (!object?.visible) continue
      this.cameraBounds(object, camera, this.foreground)
    }
    if (this.foreground.isEmpty()) return
    this.paper.makeEmpty()
    this.cameraBounds(root, camera, this.paper)
    if (this.paper.isEmpty()) return
    const nearest = -this.paper.max.z
    const behind = -this.foreground.min.z + .15
    if (nearest <= .001 || nearest >= behind) return
    const factor = behind / nearest
    this.authoredPosition.copy(root.position)
    this.authoredScale.copy(root.scale)
    this.dilated = true
    root.getWorldPosition(this.origin)
    // Root can have a parent; do the dilation in world space first.
    const cameraPosition = this.cameraOrigin.setFromMatrixPosition(camera.matrixWorld)
    this.origin.sub(cameraPosition).multiplyScalar(factor).add(cameraPosition)
    if (root.parent) root.parent.worldToLocal(this.origin)
    root.position.copy(this.origin)
    root.scale.multiplyScalar(factor)
    root.updateWorldMatrix(false, true)
  }

  private cameraBounds(root: THREE.Object3D, camera: THREE.Camera, target: THREE.Box3) {
    root.updateWorldMatrix(true, true)
    root.traverseVisible(object => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh) return
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
      this.matrix.multiplyMatrices(camera.matrixWorldInverse, mesh.matrixWorld)
      this.part.copy(mesh.geometry.boundingBox!).applyMatrix4(this.matrix)
      target.union(this.part)
    })
  }

  resolve(root: THREE.Object3D) {
    root.updateWorldMatrix(true, true)
    this.inverse.copy(root.matrixWorld).invert()
    for (let i = 0; i < this.bodies.length; i++) {
      const box = this.boxes[i]
      box.makeEmpty()
      for (const mesh of this.bodies[i]) {
        if (!mesh.visible) continue
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
        this.matrix.multiplyMatrices(this.inverse, mesh.matrixWorld)
        this.part.copy(mesh.geometry.boundingBox!).applyMatrix4(this.matrix)
        box.union(this.part)
      }
      if (box.isEmpty()) continue
      box.expandByScalar(.015)
      let shift = 0
      // Fixed order prevents transparent sorting from swapping front/back.
      // Moving monotonically back cannot re-enter an already cleared volume.
      for (let pass = 0; pass <= i; pass++) {
        let moved = false
        for (let j = 0; j < i; j++) {
          const other = this.boxes[j]
          if (other.isEmpty() || !box.intersectsBox(other)) continue
          const dz = other.min.z - box.max.z - .015
          box.min.z += dz; box.max.z += dz
          shift += dz
          moved = true
        }
        if (!moved) break
      }
      // Bodies live in translation-only groups under root; share the same
      // correction between the card stock and every attached letter.
      if (shift) for (const mesh of this.bodies[i]) mesh.position.z += shift
    }
  }
}
