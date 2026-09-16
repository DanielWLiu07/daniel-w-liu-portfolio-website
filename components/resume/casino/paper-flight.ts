import R from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import { jackBlastAt } from './jack-composition'

export const paperPhysicsReady = R.init()
const STEP = 1 / 480

/** A fixed-step flight in world space. Render frames only interpolate recorded
 * rigid poses: they never supply launch velocity or advance variable-size steps.
 * The existing chip physics uses the same Rapier runtime.
 */
export class PaperFlight {
  private world: R.World | null = null
  private ticks = 0
  private seeds: { p: THREE.Vector3; q: THREE.Quaternion; size: THREE.Vector3; offset: THREE.Vector3; bodyIndex: number; index: number; x: number; y: number; speed: number; orientation: THREE.Quaternion; parts: { mesh: THREE.Mesh; relative: THREE.Matrix4 }[] }[] = []
  private bodies: { body: R.RigidBody; previousP: THREE.Vector3; previousQ: THREE.Quaternion; drive: THREE.Vector3 }[] = []
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
      card.updateWorldMatrix(true, false)
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), scale = new THREE.Vector3()
      card.matrixWorld.decompose(p, q, scale)
      if (!card.geometry.boundingBox) card.geometry.computeBoundingBox()
      const size = card.geometry.boundingBox!.getSize(new THREE.Vector3()).multiply(scale)
      size.x += .1; size.y += .1 // keep numerical contact tolerance outside the printed edges
      size.z = Math.max(size.z, .4) // invisible contact margin covers fast rotating edges
      // Use the same wall coordinates and per-card identity as the authored
      // poker burst. Contacts may deflect these trajectories, but the driving
      // motion retains its stagger, upward arc and broadside flips.
      const local = p.clone().sub(centre).applyQuaternion(orientation.clone().invert())
      const motionIndex = groups.length === 67 ? (index < 4 ? 67 + index * 3 : index - 4) : index
      const rigid = new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1)).invert()
      this.seeds.push({ p, q, size, offset: new THREE.Vector3(), bodyIndex: index, index: motionIndex, x: local.x, y: local.y, speed, orientation: orientation.clone(), parts: parts.map(mesh => {
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
      seed.offset.copy(normal).multiplyScalar(shift)
      seed.p.add(seed.offset)
      occupied.push(box)
    }
    this.reset()
  }

  /** Ease collision clearance into the authored back flip before release.
   * The launch then starts at exactly the pose the viewer already sees. */
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
        .setLinearDamping(0).setAngularDamping(0).setCcdEnabled(true))
      this.world!.createCollider(R.ColliderDesc.cuboid(seed.size.x / 2, seed.size.y / 2, seed.size.z / 2)
        .setMass(.01).setFriction(.25).setRestitution(.18), body)
      return { body, previousP: seed.p.clone(), previousQ: seed.q.clone(), drive: new THREE.Vector3() }
    })
  }

  private motion(seed: typeof this.seeds[number], time: number) {
    const fall = jackBlastAt(time, seed.index, seed.x, seed.y, seed.speed)
    const p = new THREE.Vector3(fall.x, fall.y, 0).applyQuaternion(seed.orientation)
    const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(fall.pitch, fall.yaw, fall.roll, 'ZYX'))
    const q = seed.orientation.clone().multiply(turn).multiply(seed.orientation.clone().invert()).multiply(seed.q)
    return { p, q }
  }

  private angularVelocity(from: THREE.Quaternion, to: THREE.Quaternion, rate: number) {
    const delta = to.clone().multiply(from.clone().invert()).normalize()
    if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w)
    const length = Math.hypot(delta.x, delta.y, delta.z)
    return length < 1e-8 ? new THREE.Vector3() : new THREE.Vector3(delta.x, delta.y, delta.z)
      .multiplyScalar(2 * Math.atan2(length, delta.w) * rate / length)
  }

  sample(time: number) {
    if (!this.world) return
    // Paper is far below the set by twelve seconds. Returning to a background
    // tab must not simulate minutes of invisible motion in a single frame.
    const target = Math.min(12, Math.max(0, time)) / STEP
    const ticks = Math.ceil(target)
    if (ticks < this.ticks) this.reset()
    while (this.ticks < ticks) {
      for (const [i, b] of this.bodies.entries()) {
        b.previousP.copy(b.body.translation())
        b.previousQ.copy(b.body.rotation())
        const now = this.motion(this.seeds[i], this.ticks * STEP)
        const next = this.motion(this.seeds[i], (this.ticks + 1) * STEP)
        const drive = next.p.clone().sub(now.p).multiplyScalar(1 / STEP)
        // Drive the reference arc with a damped spring. Contacts can deflect
        // the stock, then air damping settles it back toward the burst instead
        // of letting one collision permanently throw a card out of the field.
        const velocity = new THREE.Vector3().copy(b.body.linvel()).sub(b.drive)
          .multiplyScalar(Math.exp(-10 * STEP)).add(drive)
          .addScaledVector(now.p.clone().add(this.seeds[i].p).sub(b.previousP), 60 * STEP)
        b.body.setLinvel(velocity, true)
        b.drive.copy(drive)
        const angular = this.angularVelocity(now.q, next.q, 1 / STEP)
          .add(this.angularVelocity(b.previousQ, now.q, 18))
        b.body.setAngvel(angular, true)
      }
      this.world!.step()
      this.ticks++
    }
    const alpha = ticks === 0 ? 0 : target - (ticks - 1)
    this.bodies.forEach((b, i) => {
      this.seeds[i].parts[0].mesh.userData.paperFlightBody = this.seeds[i].bodyIndex
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
