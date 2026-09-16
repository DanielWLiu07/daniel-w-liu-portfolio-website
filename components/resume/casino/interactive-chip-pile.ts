import R from '@dimforge/rapier3d-compat'
import { Vector3, type Matrix4, type Object3D, type Quaternion } from 'three'

/** Visible D-shaped tabletop, including its rail, transformed into pile space. */
export function chipTableHull(radius: number, chord: number, tableToPile: Matrix4) {
  const vertices: number[] = []
  const a = Math.asin(Math.max(-1, Math.min(1, chord / radius)))
  for (let i = 0; i <= 96; i++) {
    const angle = a + (Math.PI - 2 * a) * i / 96
    for (const depth of [0, -0.2]) {
      const p = new Vector3(radius * Math.cos(angle), -radius * Math.sin(angle), depth).applyMatrix4(tableToPile)
      vertices.push(p.x, p.y, p.z)
    }
  }
  return new Float32Array(vertices)
}

const ready = R.init()
function tableCollider(vertices: Float32Array) {
  // A fixed triangle surface gives thin chips stable face contacts; a very wide,
  // thin convex hull can jitter under rounded-cylinder support points.
  const indices: number[] = []
  const count = vertices.length / 3
  for (let i = 2; i < count - 2; i += 2) {
    indices.push(0, i + 2, i, 1, i + 1, i + 3)
  }
  for (let i = 0; i < count; i += 2) {
    const next = (i + 2) % count
    indices.push(i, next, i + 1, next, next + 1, i + 1)
  }
  return R.ColliderDesc.trimesh(vertices, new Uint32Array(indices))
}
export async function createChipPile(homes: { position: Vector3; quaternion: Quaternion; radius?: number; height?: number }[], radius: number, height: number, tableVertices: Float32Array, startSleeping = false, floorY?: number) {
  await ready
  const world = new R.World({ x: 0, y: -30 * radius, z: 0 })
  world.timestep = 1 / 480
  world.integrationParameters.numSolverIterations = 12
  world.integrationParameters.numAdditionalFrictionIterations = 4
  world.integrationParameters.maxCcdSubsteps = 4
  world.integrationParameters.allowedLinearError = radius * 0.001
  let currentTableVertices = tableVertices.slice()
  const tableShape = tableCollider(tableVertices)
  const table = world.createCollider(tableShape.setFriction(0.75).setRestitution(0.02))
  // This is the room floor, well below the table—not an invisible extension of
  // the felt. Fallen chips can finish their fall and rest without passing through it.
  if (floorY !== undefined) world.createCollider(R.ColliderDesc.cuboid(60, 0.1, 60)
    .setTranslation(0, floorY - 0.1, 0).setFriction(0.9).setRestitution(0.02))
  const bodies = homes.map(home => {
    const r = home.radius ?? radius, h = home.height ?? height
    const bevel = Math.min(h * 0.1, r * 0.02)
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic()
      .setTranslation(home.position.x, home.position.y, home.position.z).setRotation(home.quaternion)
      .setAngularDamping(3).setLinearDamping(0.6).setCcdEnabled(true).setSleeping(startSleeping))
    world.createCollider(R.ColliderDesc.roundCylinder(h / 2 - bevel, r - bevel, bevel)
      .setFriction(0.9).setRestitution(0.02), body)
    return body
  })
  let accumulator = 0
  let quiet = 0
  const stable = homes.map(home => ({ position: home.position.clone(), quaternion: home.quaternion.clone(), age: 0 }))
  const simulation = {
    setTable(vertices: Float32Array) {
      // Replacing a fixed collider wakes every resting body touching it. A
      // punch refreshes the table transform, but must not wake distant piles
      // when the actual surface has not changed.
      if (vertices.length === currentTableVertices.length && vertices.every((v, i) => v === currentTableVertices[i])) return
      table.setShape(tableCollider(vertices).shape)
      currentTableVertices = vertices.slice()
    },
    kick(index: number, direction: Vector3, strength = 1, point?: Vector3): void {
      const body = bodies[index]
      if (!body) return
      quiet = 0
      stable[index].age = 0
      const v = body.linvel()
      const d = direction.clone().normalize()
      const along = v.x * d.x + v.y * d.y + v.z * d.z
      const r = homes[index].radius ?? radius
      const impulse = body.mass() * Math.min(22 * r * strength, Math.max(0, 24 * r - along))
      // Push into the scene along the pointer ray. Contact with the felt creates
      // the slide/tumble; don't manufacture an upward launch or a remote lever.
      const force = { x: d.x * impulse, y: d.y * impulse, z: d.z * impulse }
      if (point) body.applyImpulseAtPoint(force, point, true)
      else body.applyImpulse(force, true)
      const w = body.angvel(), speed = Math.hypot(w.x, w.y, w.z)
      if (speed > 20) body.setAngvel({ x: w.x * 20 / speed, y: w.y * 20 / speed, z: w.z * 20 / speed }, true)
    },
    impact(point: Vector3, reach: number, direction: Vector3): void {
      bodies.forEach((body, index) => {
        if (!body.isEnabled()) return
        // Distance to the actual chip surface, not a sphere around its centre:
        // thin chips above/below the hit should not all receive full strength.
        const projection = body.collider(0).projectPoint(point, true)
        if (!projection) return
        const contact = projection.point
        const distance = Math.hypot(contact.x - point.x, contact.y - point.y, contact.z - point.z)
        const t = Math.max(0, 1 - distance / reach)
        const strength = t ** 4
        // Apply at each chip's closest surface, never at a remote cursor lever.
        if (strength > 0.001) simulation.kick(index, direction, strength, new Vector3(contact.x, contact.y, contact.z))
      })
    },
    step(dt: number, meshes: Object3D[]) {
      // Fine steps only during fast blasts/spins; settled and slow piles do not
      // pay for the high-speed collision budget.
      const fast = bodies.some(body => {
        if (!body.isEnabled() || body.isSleeping()) return false
        const v = body.linvel(), w = body.angvel()
        return Math.hypot(v.x, v.y, v.z) > radius * 3 || Math.hypot(w.x, w.y, w.z) > 6
      })
      world.timestep = fast ? 1 / 480 : 1 / 120
      accumulator += Math.min(dt, 0.1)
      let moving = bodies.some(body => body.isEnabled() && !body.isSleeping())
      while (moving && accumulator >= world.timestep) {
        // Let contact friction dissipate a scattered pile naturally. Confining
        // every chip to one tiny disc can trap leaning chips in perpetual contact.
        world.step()
        // Fallen chips stay gone until replay; stop spending simulation time
        // on objects far below the visible table, without a hidden catch floor.
        bodies.forEach(body => { if (body.isEnabled() && body.translation().y < -20 * radius) body.setEnabled(false) })
        bodies.forEach((body, i) => {
          if (!body.isEnabled() || body.isSleeping()) return
          const probe = stable[i], p = body.translation(), q = body.rotation()
          const drift = Math.hypot(p.x - probe.position.x, p.y - probe.position.y, p.z - probe.position.z)
          const dot = Math.abs(q.x * probe.quaternion.x + q.y * probe.quaternion.y + q.z * probe.quaternion.z + q.w * probe.quaternion.w)
          if (drift > radius * 0.025 || dot < Math.cos(0.035 / 2)) {
            probe.position.copy(p); probe.quaternion.copy(q); probe.age = 0
          } else probe.age += world.timestep
          const v = body.linvel(), w = body.angvel()
          // Contact jitter can have noisy instantaneous velocity but no net pose
          // change. Sleep each truly stationary chip, not a still-sliding pile.
          if (probe.age > 1 && Math.hypot(v.x, v.y, v.z) < radius * 0.7 && Math.hypot(w.x, w.y, w.z) < 2) body.sleep()
        })
        accumulator -= world.timestep
        const resting = bodies.every(body => {
          if (!body.isEnabled()) return true
          const v = body.linvel(), w = body.angvel()
          return Math.hypot(v.x, v.y, v.z) < radius * 0.2 && Math.hypot(w.x, w.y, w.z) < 0.5
        })
        quiet = resting ? quiet + world.timestep : 0
        // Thin stacks can retain tiny solver jitter despite looking at rest.
        // Sleep only after sustained low linear AND angular speed, never mid-flight.
        if (quiet > 1) bodies.forEach(body => body.sleep())
        moving = bodies.some(body => body.isEnabled() && !body.isSleeping())
      }
      if (!moving) accumulator = 0
      bodies.forEach((body, i) => {
        meshes[i].visible = body.isEnabled()
        const p = body.translation(), q = body.rotation()
        meshes[i].position.set(p.x, p.y, p.z)
        meshes[i].quaternion.set(q.x, q.y, q.z, q.w)
      })
      return moving
    },
    velocity(index: number) {
      const v = bodies[index].linvel()
      return { x: v.x, y: v.y, z: v.z }
    },
    contactDistance(a: number, b: number) {
      return bodies[a].collider(0).contactCollider(bodies[b].collider(0), 0)?.distance ?? 0
    },
    dispose: () => world.free(),
  }
  return simulation
}
