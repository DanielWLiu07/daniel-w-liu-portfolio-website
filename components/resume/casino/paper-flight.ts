import * as THREE from 'three'
import { jackBlastAt } from './jack-composition'

/** Authored world-space burst. One direct pose per card per frame, with fixed
 * launch spacing; no rigid bodies, collision solver, or catch-up simulation. */
export class PaperFlight {
  private seeds: { p: THREE.Vector3; q: THREE.Quaternion; size: THREE.Vector3; offset: THREE.Vector3; bodyIndex: number; index: number; x: number; y: number; speed: number; orientation: THREE.Quaternion; parts: { mesh: THREE.Mesh; relative: THREE.Matrix4 }[] }[] = []
  private turn = new THREE.Quaternion()
  private inverseOrientation = new THREE.Quaternion()
  private angles = new THREE.Euler(0, 0, 0, 'ZYX')
  private parentInverses = new Map<THREE.Object3D, THREE.Matrix4>()
  private matrix = new THREE.Matrix4()
  private inverse = new THREE.Matrix4()
  private pose = new THREE.Matrix4()
  private position = new THREE.Vector3()
  private rotation = new THREE.Quaternion()
  private scale = new THREE.Vector3(1, 1, 1)

  get active() { return this.seeds.length > 0 }

  start(groups: readonly (readonly THREE.Mesh[])[], speed: number, centre: THREE.Vector3, orientation = new THREE.Quaternion()) {
    this.dispose()
    this.seeds = []
    for (const [index, parts] of groups.entries()) {
      const card = parts[0]
      if (!card.visible) continue
      card.updateWorldMatrix(true, false)
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), scale = new THREE.Vector3()
      card.matrixWorld.decompose(p, q, scale)
      if (!card.geometry.boundingBox) card.geometry.computeBoundingBox()
      const size = card.geometry.boundingBox!.getSize(new THREE.Vector3()).multiply(scale)
      size.x += .1; size.y += .1 // small spacing between neighboring printed edges
      size.z = Math.max(size.z, .4) // retain the existing layered launch silhouette
      // Use the same wall coordinates and per-card identity as the authored
      // poker burst, including its stagger, upward arc and broadside flips.
      const local = p.clone().sub(centre).applyQuaternion(orientation.clone().invert())
      const motionIndex = groups.length === 67 ? (index < 4 ? 67 + index * 3 : index - 4) : index
      const rigid = new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1)).invert()
      this.seeds.push({ p, q, size, offset: new THREE.Vector3(), bodyIndex: index, index: motionIndex, x: local.x, y: local.y, speed, orientation: orientation.clone(), parts: parts.map(mesh => {
        mesh.updateWorldMatrix(true, false)
        return { mesh, relative: new THREE.Matrix4().multiplyMatrices(rigid, mesh.matrixWorld) }
      }) })
    }
    // Give overlapping collage pieces distinct starting depths. Packing in
    // the wall frame preserves their X/Y layout without coplanar printed faces.
    const wallInverse = new THREE.Matrix4().compose(centre, orientation, new THREE.Vector3(1, 1, 1)).invert()
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(orientation)
    const occupied: THREE.Box3[] = []
    for (const seed of this.seeds) {
      const box = new THREE.Box3(seed.size.clone().multiplyScalar(-.5), seed.size.clone().multiplyScalar(.5))
        .applyMatrix4(new THREE.Matrix4().multiplyMatrices(wallInverse,
          new THREE.Matrix4().compose(seed.p, seed.q, new THREE.Vector3(1, 1, 1))))
      let shift = 0
      for (let pass = 0; pass < occupied.length; pass++) {
        let moved = false
        for (const other of occupied) if (box.intersectsBox(other)) {
          const dz = other.min.z - box.max.z - .015
          box.min.z += dz; box.max.z += dz; shift += dz; moved = true
        }
        if (!moved) break
      }
      seed.offset.copy(normal).multiplyScalar(shift)
      seed.p.add(seed.offset)
      occupied.push(box)
    }
  }

  /** Ease depth spacing into the back flip, preserving the smooth launch. */
  stage(amount: number) {
    const u = THREE.MathUtils.clamp(amount, 0, 1)
    const blend = u * u * u * (u * (u * 6 - 15) + 10)
    for (const seed of this.seeds) for (const { mesh } of seed.parts) {
      mesh.updateWorldMatrix(true, false)
      this.matrix.copy(mesh.matrixWorld)
      this.matrix.elements[12] += seed.offset.x * blend
      this.matrix.elements[13] += seed.offset.y * blend
      this.matrix.elements[14] += seed.offset.z * blend
      if (mesh.parent) this.matrix.premultiply(this.inverse.copy(mesh.parent.matrixWorld).invert())
      this.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale)
    }
  }

  private motion(seed: typeof this.seeds[number], time: number, p: THREE.Vector3, q: THREE.Quaternion) {
    const fall = jackBlastAt(time, seed.index, seed.x, seed.y, seed.speed)
    p.set(fall.x, fall.y, 0).applyQuaternion(seed.orientation)
    this.turn.setFromEuler(this.angles.set(fall.pitch, fall.yaw, fall.roll, 'ZYX'))
    q.copy(seed.orientation).multiply(this.turn).multiply(this.inverseOrientation.copy(seed.orientation).invert()).multiply(seed.q)
  }

  sample(time: number) {
    if (!this.active) return
    const age = Math.min(12, Math.max(0, time))
    // Every word/card sibling shares its parent transform for this frame.
    // Update and invert it once instead of walking the scene for each letter.
    for (const [parent, inverse] of this.parentInverses) {
      parent.updateWorldMatrix(true, false)
      inverse.copy(parent.matrixWorld).invert()
    }
    this.seeds.forEach(seed => {
      seed.parts[0].mesh.userData.paperFlightBody = seed.bodyIndex
      this.motion(seed, age, this.position, this.rotation)
      this.position.add(seed.p)
      this.pose.compose(this.position, this.rotation, this.scale)
      for (const { mesh, relative } of seed.parts) {
        this.matrix.multiplyMatrices(this.pose, relative)
        if (mesh.parent) {
          let inverse = this.parentInverses.get(mesh.parent)
          if (!inverse) {
            mesh.parent.updateWorldMatrix(true, false)
            inverse = mesh.parent.matrixWorld.clone().invert()
            this.parentInverses.set(mesh.parent, inverse)
          }
          this.matrix.premultiply(inverse)
        }
        this.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale)
      }
    })
  }

  dispose() { this.seeds = []; this.parentInverses.clear() }
}
