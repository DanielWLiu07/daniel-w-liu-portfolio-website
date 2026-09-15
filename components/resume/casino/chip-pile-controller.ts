import { Matrix4, Object3D, Quaternion, Vector3, type Group, type Mesh } from 'three'
import type { createChipPile } from './interactive-chip-pile'

type Pile = { root: Group; meshes: Mesh[]; radius: number; height: number }
type Hit = { point: Vector3; direction: Vector3; reach: number }

/** One lazy world for every side chip, stepped once, with world/local render adapters. */
export function createChipController(table: () => { radius: number; chord: number; matrix: Matrix4; floorY?: number }, chipRadius: () => number) {
  const piles = new Set<Pile>()
  let physics: Awaited<ReturnType<typeof createChipPile>> | null = null
  let proxies: Object3D[] = [], order: Pile[] = [], pending: Hit[] = []
  let generation = 0, loading = false, lastAge = -1
  let refreshTable: (() => void) | null = null
  const reset = () => {
    generation++; physics?.dispose(); physics = null; loading = false
    proxies = []; order = []; pending = []; refreshTable = null
  }
  return {
    get active() { return physics !== null },
    register(pile: Pile) {
      reset(); piles.add(pile)
      return () => { reset(); piles.delete(pile) }
    },
    impact(point: Vector3, reach: number, direction: Vector3) {
      if (physics) { refreshTable?.(); physics.impact(point, reach, direction); return }
      pending.push({ point: point.clone(), reach, direction: direction.clone() })
      if (loading) return
      loading = true
      const version = generation
      void import('./interactive-chip-pile').then(async ({ createChipPile, chipTableHull }) => {
        if (version !== generation) return
        const registered = [...piles]
        const homes = registered.flatMap(pile => {
          pile.root.updateWorldMatrix(true, true)
          const scale = pile.root.getWorldScale(new Vector3())
          return pile.meshes.map(mesh => ({
            position: mesh.getWorldPosition(new Vector3()), quaternion: mesh.getWorldQuaternion(new Quaternion()),
            radius: pile.radius * Math.max(Math.abs(scale.x), Math.abs(scale.z)), height: pile.height * Math.abs(scale.y),
          }))
        })
        const vertices = () => { const t = table(); return chipTableHull(t.radius, t.chord, t.matrix) }
        const world = await createChipPile(homes, chipRadius(), chipRadius() * 0.13 / 0.55, vertices(), true, table().floorY)
        if (version !== generation) { world.dispose(); return }
        order = registered; proxies = homes.map(() => new Object3D())
        physics = world; refreshTable = () => world.setTable(vertices()); loading = false
        for (const hit of pending) world.impact(hit.point, hit.reach, hit.direction)
        pending = []
      }).catch(error => {
        if (version !== generation) return
        loading = false; pending = []
        console.error('Shared side-chip physics failed to load', error)
      })
    },
    step(dt: number, age: number) {
      if (age < lastAge - 0.1) reset()
      lastAge = age
      if (!physics) return false
      const moving = physics.step(dt, proxies)
      let index = 0
      for (const pile of order) {
        pile.root.updateWorldMatrix(true, false)
        const inverse = pile.root.matrixWorld.clone().invert()
        const rotation = pile.root.getWorldQuaternion(new Quaternion()).invert()
        for (const mesh of pile.meshes) {
          const pose = proxies[index++]
          mesh.visible = pose.visible
          mesh.position.copy(pose.position).applyMatrix4(inverse)
          mesh.quaternion.copy(rotation).multiply(pose.quaternion)
        }
      }
      return moving
    },
    dispose: reset,
  }
}
