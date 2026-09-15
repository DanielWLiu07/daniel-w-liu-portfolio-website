import R from '@dimforge/rapier3d-compat'
import type { Quaternion, Vector3 } from 'three'

const ready = R.init()
export async function createInteractiveDie(position: Vector3, rotation: Quaternion, velocity: Vector3, size: number, angularVelocity = { x: 0, y: 0, z: 0 }) {
  await ready
  const world = new R.World({ x: 0, y: -35 * size, z: 0 })
  world.timestep = 1 / 120
  world.createCollider(R.ColliderDesc.cuboid(40 * size, 0.1 * size, 40 * size)
    .setTranslation(0, -0.1 * size, 0).setFriction(0.75).setRestitution(0.48))
  const body = world.createRigidBody(R.RigidBodyDesc.dynamic()
    .setTranslation(position.x, position.y, position.z).setRotation(rotation)
    .setLinvel(velocity.x, velocity.y, velocity.z).setAngvel(angularVelocity).setAngularDamping(0.8).setCcdEnabled(true))
  world.createCollider(R.ColliderDesc.roundCuboid(size * 0.4, size * 0.4, size * 0.4, size * 0.1)
    .setFriction(0.75).setRestitution(0.48), body)
  let accumulator = 0
  return {
    kick() {
      const v = body.linvel()
      // Every click contributes an impulse, even during another jump. Cap energy,
      // not clicks, so spam doesn't launch the die permanently out of view.
      const headroom = Math.max(0, 4 * size - body.translation().y)
      const vy = Math.min(12 * size, Math.sqrt(2 * 35 * size * headroom), Math.max(0, v.y) + 7 * size)
      // A click may add lift or hit the height limit, never apply a downward kick.
      body.applyImpulse({ x: 0, y: Math.max(0, vy - v.y) * body.mass(), z: 0 }, true)
      const spin = body.angvel()
      const addSpin = (value: number) => Math.max(-7, Math.min(7, value + (Math.random() - 0.5) * 5))
      body.setAngvel({ x: addSpin(spin.x), y: addSpin(spin.y), z: addSpin(spin.z) }, true)
    },
    step(dt: number, p: Vector3, q: Quaternion) {
      accumulator += Math.min(dt, 0.1)
      const start = body.translation()
      if (body.isSleeping() && Math.hypot(start.x, start.z) > size * 0.55) body.wakeUp()
      while (accumulator >= world.timestep && !body.isSleeping()) {
        const v = body.linvel(), at = body.translation()
        // No attraction to a random point inside the disc. Only constrain the
        // outward radial velocity at its edge; preserve tangent and vertical motion.
        const distance = Math.hypot(at.x, at.z)
        if (distance > size * 0.5) {
          const nx = at.x / distance, nz = at.z / distance
          const radial = v.x * nx + v.z * nz
          const limit = -Math.min(size * 2, (distance - size * 0.5) * 12)
          if (radial > limit) body.applyImpulse({ x: nx * (limit - radial) * body.mass(), y: 0, z: nz * (limit - radial) * body.mass() }, false)
        }
        world.step()
        accumulator -= world.timestep
      }
      if (body.isSleeping()) accumulator = 0
      const at = body.translation(), rot = body.rotation()
      p.set(at.x, at.y, at.z); q.set(rot.x, rot.y, rot.z, rot.w)
      return !body.isSleeping()
    },
    dispose() { world.free() },
    velocity() { const v = body.linvel(); return { x: v.x, y: v.y, z: v.z } },
  }
}
