'use client'

/**
 * The spaceship out of his own Blender scene, as the shader test subject.
 *
 * It is the object the cross-hatching shader was authored against, which is the
 * only reason it is here: a sphere shows you the tonal SWEEP but nothing about
 * how the hatch sits on panel lines, hard creases, and a silhouette that turns
 * away from the key. Those are where a hatching shader either reads or falls
 * apart, and a ball cannot tell you which.
 *
 * Source: ~/Dev/3D/personal_website_assets/scenes/"hatching & manga shaders.blend",
 * the EMPTY named "spaceship" and its two children (Cube.010 -> Cube.003).
 * Exported geometry only (export_materials='NONE'), modifiers applied, so the
 * 38,350 authored verts arrive as the 63,395 the subsurf actually renders. His
 * file was never opened for writing; the export ran on a scratch copy.
 */
import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

const URL = '/models/spaceship.glb'

/**
 * Its parts as standalone geometry, centred on the origin and scaled so the
 * whole ship fits inside a sphere of diameter `size`.
 *
 * A BOUNDING SPHERE, not the longest axis, because the subject turns. Fitting
 * the longest axis frames the pose you happened to fit it in and lets every
 * other one grow: this hull is 12.3 x 9.6 x 1.8, so a fit that just fits head-on
 * is 27 percent oversize by the time the diagonal swings toward the camera, and
 * it clips. The sphere is the one fit no rotation can break.
 *
 * Baked rather than rendered through the loaded graph on purpose. useGLTF hands
 * back a CACHED scene, so posing or re-materialling it in place edits the copy
 * every other consumer gets; cloning the geometry and folding each mesh's world
 * matrix into it leaves the cache untouched and collapses the hierarchy (the
 * ship's hull is parented under a 0.149 scale) into plain buffers that any
 * material can be pointed at.
 *
 * Normals ride through applyMatrix4 on the normal matrix, so they stay correct
 * and are NOT recomputed: recomputing would smooth the hard creases flat, and
 * the creases are half of what this model is here to show.
 */
/**
 * The ship's parts in the coordinates BLENDER had them in, converted to Y-up by
 * the exporter and otherwise untouched: no centring, no fit.
 *
 * Separate from useSpaceshipParts because a faithful scene copy needs the ship
 * where his file puts it, not where a framing rule puts it, and the two callers
 * must not share geometry: the fit below mutates buffers in place, so a shared
 * array would quietly re-scale the copy every time the projects page mounted.
 * Each caller clones.
 */
export function useSpaceshipWorld(): THREE.BufferGeometry[] {
  const { scene } = useGLTF(URL)
  return useMemo(() => {
    scene.updateWorldMatrix(true, true)
    const parts: THREE.BufferGeometry[] = []
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const g = mesh.geometry.clone()
      g.applyMatrix4(mesh.matrixWorld)
      g.computeBoundingBox()
      g.computeBoundingSphere()
      parts.push(g)
    })
    return parts
  }, [scene])
}

/** The union bounding box of a set of geometries, in their own space. */
export function partsBounds(parts: THREE.BufferGeometry[]): THREE.Box3 {
  const box = new THREE.Box3()
  for (const g of parts) {
    if (!g.boundingBox) g.computeBoundingBox()
    box.union(g.boundingBox as THREE.Box3)
  }
  return box
}

export function useSpaceshipParts(size: number): THREE.BufferGeometry[] {
  const world = useSpaceshipWorld()
  return useMemo(() => {
    const parts = world.map((g) => g.clone())

    const box = new THREE.Box3()
    for (const g of parts) {
      g.computeBoundingBox()
      box.union(g.boundingBox as THREE.Box3)
    }
    const centre = box.getCenter(new THREE.Vector3())
    // the true radius about that centre, off the points, not the box corners:
    // the box diagonal over-reads a hull this flat and would shrink it for a
    // bulk that is not there
    let r = 0
    const v = new THREE.Vector3()
    for (const g of parts) {
      const pos = g.getAttribute('position')
      for (let i = 0; i < pos.count; i++) {
        r = Math.max(r, v.fromBufferAttribute(pos, i).sub(centre).length())
      }
    }
    const s = size / 2 / r
    const fit = new THREE.Matrix4()
      .makeScale(s, s, s)
      .multiply(new THREE.Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z))
    for (const g of parts) {
      g.applyMatrix4(fit)
      g.computeBoundingBox()
      g.computeBoundingSphere()
    }
    return parts
  }, [world, size])
}

/**
 * The ship as the glTF gives it: every mesh with its OWN geometry and its own
 * local transform, unbaked.
 *
 * Needed because Blender's Generated coordinate (the "orco") is per-OBJECT and
 * pre-transform, normalised into that object's own bounding box. Baking world
 * matrices into the geometry, which useSpaceshipWorld does, destroys exactly
 * that: the bounding box becomes the world-space one and every part shares a
 * space it should not. A shader reading Generated has to see the local space.
 *
 * Returns clones, so a consumer may transform them without touching the cached
 * glTF or the other consumer.
 */
export interface ShipPart {
  geometry: THREE.BufferGeometry
  /** the mesh's own matrix relative to the glTF root */
  matrix: THREE.Matrix4
  /** the geometry's bounding box in its OWN space, for Generated */
  bounds: { min: [number, number, number]; max: [number, number, number] }
  name: string
}

export function useSpaceshipLocal(): ShipPart[] {
  const { scene } = useGLTF(URL)
  return useMemo(() => {
    scene.updateWorldMatrix(true, true)
    const parts: ShipPart[] = []
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const g = mesh.geometry.clone()
      g.computeBoundingBox()
      g.computeBoundingSphere()
      const b = g.boundingBox as THREE.Box3
      parts.push({
        geometry: g,
        matrix: mesh.matrixWorld.clone(),
        bounds: { min: b.min.toArray() as [number, number, number], max: b.max.toArray() as [number, number, number] },
        name: mesh.name,
      })
    })
    return parts
  }, [scene])
}

/** the ship under one material, as many meshes as it has parts */
export function Spaceship({ size, material }: { size: number; material: THREE.Material }) {
  const parts = useSpaceshipParts(size)
  return (
    <>
      {parts.map((g, i) => (
        <mesh key={i} geometry={g} material={material} />
      ))}
    </>
  )
}

useGLTF.preload(URL)
