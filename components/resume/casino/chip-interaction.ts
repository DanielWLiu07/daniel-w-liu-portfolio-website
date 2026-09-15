import R from '@dimforge/rapier3d-compat'
import type { Quaternion, Vector3 } from 'three'

const ready = R.init()

/** Unit-size chip and felt. Rendering scales both body and position. */
export async function createInteractiveChip(rotation: Quaternion) {
  await ready
  const world = new R.World({ x: 0, y: -24, z: 0 })
  world.timestep = 1 / 120
  world.createCollider(R.ColliderDesc.cuboid(20, 0.1, 20)
    .setTranslation(0, -0.1, 0).setFriction(0.85).setRestitution(0.22))
  const body = world.createRigidBody(R.RigidBodyDesc.dynamic()
    .setTranslation(0, 0.065, 0).setRotation(rotation)
    .setAngularDamping(0.35).setLinearDamping(0.12).setCcdEnabled(true))
  // Rounded rim matching the visible 1.10 diameter / 0.13 height.
  world.createCollider(R.ColliderDesc.roundCylinder(0.053, 0.538, 0.012)
    .setFriction(0.85).setRestitution(0.22), body)
  let accumulator = 0
  let folder: R.Collider | null = null
  let folderKey = ''
  return {
    setFolder(min: Vector3, max: Vector3, wake = true) {
      const key = [min.x, min.y, min.z, max.x, max.y, max.z].map(n => n.toFixed(4)).join(',')
      if (key === folderKey) return
      folderKey = key
      const hx = Math.max(0.005, (max.x - min.x) / 2)
      const hy = Math.max(0.005, (max.y - min.y) / 2)
      const hz = Math.max(0.005, (max.z - min.z) / 2)
      if (!folder) folder = world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setFriction(0.8).setRestitution(0.1))
      else folder.setShape(new R.Cuboid(hx, hy, hz))
      folder.setTranslation({ x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 })
      // Hover rescaling changes coordinate units, not the physical folder.
      if (wake) body.wakeUp()
    },
    kick() {
      const v = body.linvel()
      const headroom = Math.max(0, 2.8 - body.translation().y)
      const vy = Math.min(Math.sqrt(48 * headroom), Math.max(0, v.y) + 7.5)
      body.applyImpulse({ x: 0, y: Math.max(0, vy - v.y) * body.mass(), z: 0 }, true)
      const spin = body.angvel()
      body.setAngvel({ x: Math.min(16, spin.x + 11), y: spin.y, z: spin.z }, true)
    },
    step(dt: number, p: Vector3, q: Quaternion) {
      accumulator += Math.min(dt, 0.1)
      while (accumulator >= world.timestep && !body.isSleeping()) {
        const at = body.translation(), v = body.linvel()
        const distance = Math.hypot(at.x, at.z)
        // Same bounded-area convention as dice; no attraction inside the disc.
        if (distance > 0.35) {
          const nx = at.x / distance, nz = at.z / distance
          const radial = v.x * nx + v.z * nz
          const limit = -Math.min(2, (distance - 0.35) * 12)
          if (radial > limit) body.applyImpulse({ x: nx * (limit - radial) * body.mass(), y: 0, z: nz * (limit - radial) * body.mass() }, false)
        }
        world.step()
        accumulator -= world.timestep
      }
      if (body.isSleeping()) accumulator = 0
      const at = body.translation(), rot = body.rotation()
      p.set(at.x, at.y, at.z)
      q.set(rot.x, rot.y, rot.z, rot.w)
      return !body.isSleeping()
    },
    sleeping: () => body.isSleeping(),
    velocity: () => { const v = body.linvel(); return { x: v.x, y: v.y, z: v.z } },
    dispose: () => world.free(),
  }
}
