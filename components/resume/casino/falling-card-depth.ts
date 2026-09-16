import * as THREE from 'three'

const FLIGHT_FOREGROUND = ['flight-roulette', 'flight-royal-flush', 'roulette-caption', 'royal-flush-caption'] as const

/** Conservative card/word volumes in camera space.
 * Keep the authored screen trajectory and rotations; overlapping volumes are
 * separated by camera-centred dilation so depth changes never pop on screen.
 */
export class FallingCardDepth {
  private boxes: THREE.Box3[]
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

  resolve(root: THREE.Object3D, camera: THREE.Camera) {
    root.updateWorldMatrix(true, true)
    camera.updateWorldMatrix(true, false)
    const cameraPosition = this.cameraOrigin.setFromMatrixPosition(camera.matrixWorld)
    for (let i = 0; i < this.bodies.length; i++) {
      const box = this.boxes[i]
      box.makeEmpty()
      for (const mesh of this.bodies[i]) {
        if (!mesh.visible) continue
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
        this.matrix.multiplyMatrices(camera.matrixWorldInverse, mesh.matrixWorld)
        this.part.copy(mesh.geometry.boundingBox!).applyMatrix4(this.matrix)
        box.union(this.part)
      }
      if (box.isEmpty() || box.max.z >= -.001) continue
      box.expandByScalar(.015)
      let factor = 1
      for (let pass = 0; pass <= i; pass++) {
        let moved = false
        for (let j = 0; j < i; j++) {
          const other = this.boxes[j]
          if (other.isEmpty() || !box.intersectsBox(other)) continue
          const dilation = (other.min.z - .015) / box.max.z
          if (dilation <= 1) continue
          // Scale about the camera, not the card centre: every projected corner
          // stays in exactly the same place even when overlap starts or ends.
          box.min.multiplyScalar(dilation)
          box.max.multiplyScalar(dilation)
          factor *= dilation
          moved = true
        }
        if (!moved) break
      }
      if (factor !== 1) for (const mesh of this.bodies[i]) {
        this.origin.copy(cameraPosition)
        if (mesh.parent) mesh.parent.worldToLocal(this.origin)
        mesh.position.sub(this.origin).multiplyScalar(factor).add(this.origin)
        mesh.scale.multiplyScalar(factor)
      }
    }
  }
}
