/** Offline entrance baking. Print clip JSON; entrance playback needs no solver.
 * node scripts/bake-dice.cjs
 */
const R = require('@dimforge/rapier3d-compat')
const THREE = require('three')

async function main() {
  await R.init()
  const clips = []
  const jumping = process.argv.includes('--jump')
  for (let variant = 0; variant < (jumping ? 160 : 2); variant++) {
    const world = new R.World({ x: 0, y: -35, z: 0 })
    world.timestep = 1 / 240
    world.createCollider(R.ColliderDesc.cuboid(30, 0.1, 30).setTranslation(0, -0.1, 0).setFriction(0.65).setRestitution(0.58))
    // The left entrance is a low lateral throw, with spin about its travel axis's
    // perpendicular. Cross-axis tilt previously redirected it in depth on impact.
    const leftThrow = !jumping && variant === 0
    const initial = jumping ? new THREE.Quaternion() : new THREE.Quaternion().setFromEuler(leftThrow
      ? new THREE.Euler(0, 0, 0.22)
      : new THREE.Euler(0.32 + variant * 0.15, 0.2, -0.18))
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic()
      .setTranslation(0, jumping ? 0.5 : leftThrow ? 2.5 : 5.5, 0).setRotation(initial)
      .setLinvel(jumping ? 0 : leftThrow ? 9 : 6.5, jumping ? 8 : leftThrow ? 1.4 : -0.5, jumping || leftThrow ? 0 : -0.16)
      .setAngvel(jumping ? { x: Math.sin(variant * 2.4) * 5, y: Math.cos(variant * 1.7) * 1.5, z: Math.cos(variant * 2.4) * 5 } : leftThrow ? { x: 0, y: 0, z: -2.5 } : { x: 1.4, y: -0.45, z: -0.8 })
      .setLinearDamping(0.08).setAngularDamping(jumping ? 0.8 : 0.25).setCcdEnabled(true))
    world.createCollider(R.ColliderDesc.roundCuboid(0.4, 0.4, 0.4, 0.1)
      .setDensity(1).setFriction(0.65).setRestitution(0.58), body)
    const frames = []
    for (let step = 0; step <= 240 * 8; step++) {
      if (step % 4 === 0) {
        const p = body.translation(), q = body.rotation()
        frames.push([p.x, p.y, p.z, q.x, q.y, q.z, q.w])
        if (body.isSleeping()) break
      }
      world.step()
    }
    if (!body.isSleeping()) throw Error('Dice bake did not settle')
    if (jumping) {
      const end = frames.at(-1)
      // Reject wandering takes offline. Playback never clamps a flying die.
      if (Math.hypot(end[0], end[2]) <= 0.4 && Math.max(...frames.map(f => Math.hypot(f[0], f[2]))) <= 0.65) {
        clips.push(frames.map(f => f.map(n => +n.toFixed(6))))
      }
      world.free()
      if (clips.length >= 20) break
      continue
    }
    // Rigidly align the whole clip to the saved landing, never warp its trajectory.
    const end = frames.at(-1)
    const qEnd = new THREE.Quaternion(...end.slice(3))
    const horizontal = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]
      .map(v => v.applyQuaternion(qEnd)).sort((a, b) => Math.abs(a.y) - Math.abs(b.y))[0]
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(-horizontal.z, horizontal.x))
    // After removing yaw the resting orientation is a cube symmetry. Relabeling
    // faces with its inverse preserves the collider while retaining the saved face.
    const face = yaw.clone().multiply(qEnd).invert()
    const aligned = frames.map(f => {
      const p = new THREE.Vector3(f[0] - end[0], f[1] - end[1] + 0.5, f[2] - end[2]).applyQuaternion(yaw)
      const q = yaw.clone().multiply(new THREE.Quaternion(...f.slice(3))).multiply(face).normalize()
      return [...p.toArray(), ...q.toArray()].map(n => +n.toFixed(6))
    })
    aligned[aligned.length - 1] = [0, 0.5, 0, 0, 0, 0, 1]
    clips.push(aligned)
    world.free()
  }
  if (jumping && clips.length < 8) throw Error('Not enough bounded jump takes')
  console.log(JSON.stringify({ fps: 60, engine: 'Rapier 0.12.0', clips }))
}
main().catch(e => { console.error(e); process.exitCode = 1 })
