import R from '@dimforge/rapier3d-compat'
import * as THREE from 'three'

export const paperPhysicsReady = R.init()
const STEP = 1 / 480

/** A fixed-step flight in world space. Render frames only interpolate recorded
 * rigid poses: they never supply launch velocity or advance variable-size steps.
 * The existing chip physics uses the same Rapier runtime.
 */
export class PaperFlight {
  private world: R.World | null = null
  private ticks = 0
  private seeds: { p: THREE.Vector3; q: THREE.Quaternion; size: THREE.Vector3; velocity: THREE.Vector3; spin: THREE.Vector3; parts: { mesh: THREE.Mesh; relative: THREE.Matrix4 }[] }[] = []
  private bodies: { body: R.RigidBody; previousP: THREE.Vector3; previousQ: THREE.Quaternion }[] = []
  private matrix = new THREE.Matrix4()
  private inverse = new THREE.Matrix4()
  private pose = new THREE.Matrix4()
  private position = new THREE.Vector3()
  private rotation = new THREE.Quaternion()
  private nextRotation = new THREE.Quaternion()
  private scale = new THREE.Vector3(1, 1, 1)

  get active() { return this.world !== null }

  start(groups: readonly (readonly THREE.Mesh[])[], speed: number, centre: THREE.Vector3, orientation = new THREE.Quaternion()) {
    this.dispose()
    this.seeds = []
    for (const [index, parts] of groups.entries()) {
      const card = parts[0]
      if (!card.visible) continue
      card.userData.paperFlightBody = index
      card.updateWorldMatrix(true, false)
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), scale = new THREE.Vector3()
      card.matrixWorld.decompose(p, q, scale)
      if (!card.geometry.boundingBox) card.geometry.computeBoundingBox()
      const size = card.geometry.boundingBox!.getSize(new THREE.Vector3()).multiply(scale)
      size.x += .03; size.y += .03 // keep numerical contact tolerance outside the printed edges
      size.z = Math.max(size.z, .2) // invisible contact margin covers fast rotating edges
      // Preserve the full upward punch. Limit lateral scatter so the burst reads
      // as a rising column instead of the wall exploding outward.
      const distance = Math.hypot(p.x - centre.x, p.y - centre.y)
      const pickup = Math.exp(-distance * distance / 50) * (1.08 + (index * 11 % 7) * .035)
      const side = ((index * 13 % 17) - 8) * .035
      const velocity = new THREE.Vector3(side + (p.x - centre.x) * .15, speed * pickup, (index % 5 - 2) * .12)
      const spin = new THREE.Vector3((index % 3 - 1) * .7, (index % 2 === 0 ? 7 : 1.2) * (index % 4 < 2 ? 1 : -1), (index % 5 - 2) * .45)
      const rigid = new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1)).invert()
      this.seeds.push({ p, q, size, velocity, spin, parts: parts.map(mesh => {
        mesh.updateWorldMatrix(true, false)
        return { mesh, relative: new THREE.Matrix4().multiplyMatrices(rigid, mesh.matrixWorld) }
      }) })
    }
    // Give overlapping collage pieces distinct starting depths. Packing in
    // the wall frame preserves their X/Y layout and prevents the solver from
    // inheriting penetrations from the authored, previously nonphysical wall.
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
      seed.p.addScaledVector(normal, shift)
      occupied.push(box)
    }
    this.reset()
  }

  private reset() {
    this.world?.free()
    this.world = new R.World({ x: 0, y: 0, z: 0 })
    this.world.timestep = STEP
    this.world.numSolverIterations = 12
    this.world.integrationParameters.maxCcdSubsteps = 4
    this.ticks = 0
    this.bodies = this.seeds.map(seed => {
      const body = this.world!.createRigidBody(R.RigidBodyDesc.dynamic()
        .setTranslation(seed.p.x, seed.p.y, seed.p.z).setRotation(seed.q)
        .setLinearDamping(.35).setAngularDamping(2).setCcdEnabled(true))
      this.world!.createCollider(R.ColliderDesc.cuboid(seed.size.x / 2, seed.size.y / 2, seed.size.z / 2)
        .setMass(.01).setFriction(.25).setRestitution(.18), body)
      return { body, previousP: seed.p.clone(), previousQ: seed.q.clone() }
    })
    this.world.gravity = { x: 0, y: -40, z: 0 }
    this.bodies.forEach((b, i) => {
      b.previousP.copy(b.body.translation())
      b.previousQ.copy(b.body.rotation())
      b.body.setLinvel(this.seeds[i].velocity, true)
      b.body.setAngvel(this.seeds[i].spin, true)
    })
  }

  sample(time: number) {
    if (!this.world) return
    // Paper is far below the set by twelve seconds. Returning to a background
    // tab must not simulate minutes of invisible motion in a single frame.
    const target = Math.min(12, Math.max(0, time)) / STEP
    const ticks = Math.ceil(target)
    if (ticks < this.ticks) this.reset()
    while (this.ticks < ticks) {
      for (const b of this.bodies) {
        b.previousP.copy(b.body.translation())
        b.previousQ.copy(b.body.rotation())
      }
      this.world!.step()
      this.ticks++
    }
    const alpha = ticks === 0 ? 0 : target - (ticks - 1)
    this.bodies.forEach((b, i) => {
      this.position.copy(b.previousP).lerp(b.body.translation(), alpha)
      this.rotation.copy(b.previousQ).slerp(this.nextRotation.copy(b.body.rotation()), alpha)
      this.pose.compose(this.position, this.rotation, this.scale)
      for (const { mesh, relative } of this.seeds[i].parts) {
        this.matrix.multiplyMatrices(this.pose, relative)
        if (mesh.parent) {
          mesh.parent.updateWorldMatrix(true, false)
          this.inverse.copy(mesh.parent.matrixWorld).invert()
          this.matrix.premultiply(this.inverse)
        }
        this.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale)
      }
    })
  }

  dispose() { this.world?.free(); this.world = null; this.bodies = []; this.ticks = 0 }
}
