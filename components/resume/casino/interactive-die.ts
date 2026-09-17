import R from '@dimforge/rapier3d-compat'
import { Vector3, type Quaternion } from 'three'

export { chipTableHull } from './interactive-chip-pile'

const ready = R.init()
export async function createInteractiveDie(position: Vector3, rotation: Quaternion, velocity: Vector3, size: number, angularVelocity = { x: 0, y: 0, z: 0 }, surface?: { vertices: Float32Array; floorY: number }) {
  await ready
  const world = new R.World({ x: 0, y: -35 * size, z: 0 })
  world.timestep = 1 / 120
  if (surface) {
    const table = R.ColliderDesc.convexHull(surface.vertices)
    if (!table) throw new Error('Invalid dice tabletop hull')
    world.createCollider(table.setFriction(0.75).setRestitution(0.48))
    world.createCollider(R.ColliderDesc.cuboid(60, .1, 60)
      .setTranslation(0, surface.floorY - .1, 0).setFriction(.9).setRestitution(.2))
  } else {
    world.createCollider(R.ColliderDesc.cuboid(40 * size, .1 * size, 40 * size)
      .setTranslation(0, -.1 * size, 0).setFriction(.75).setRestitution(.48))
  }
  const body = world.createRigidBody(R.RigidBodyDesc.dynamic()
    .setTranslation(position.x, position.y, position.z).setRotation(rotation)
    .setLinvel(velocity.x, velocity.y, velocity.z).setAngvel(angularVelocity).setAngularDamping(0.8).setCcdEnabled(true))
  world.createCollider(R.ColliderDesc.roundCuboid(size * 0.4, size * 0.4, size * 0.4, size * 0.1)
    .setFriction(0.75).setRestitution(0.48), body)
  let accumulator = 0
  return {
    kick(direction = new Vector3(0, 1, 0), point?: Vector3) {
      const v = body.linvel(), d = direction.clone().normalize()
      const along = v.x * d.x + v.y * d.y + v.z * d.z
      // Match chip hits: impulse along the pointer ray, with no home circle or
      // height ceiling. A velocity limit keeps repeated hits numerically stable.
      const impulse = body.mass() * Math.min(22 * size, Math.max(0, 24 * size - along))
      const force = { x: d.x * impulse, y: d.y * impulse, z: d.z * impulse }
      const contact = point && body.collider(0).projectPoint(point, true)?.point
      if (contact) body.applyImpulseAtPoint(force, contact, true)
      else body.applyImpulse(force, true)
      const w = body.angvel(), speed = Math.hypot(w.x, w.y, w.z)
      if (speed > 20) body.setAngvel({ x: w.x * 20 / speed, y: w.y * 20 / speed, z: w.z * 20 / speed }, true)
    },
    step(dt: number, p: Vector3, q: Quaternion) {
      accumulator += Math.min(dt, 0.1)
      while (accumulator >= world.timestep && !body.isSleeping()) {
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
