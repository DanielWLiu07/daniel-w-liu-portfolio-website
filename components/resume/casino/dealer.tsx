'use client'

/**
 * The dealer: a Meshy preview mesh (geometry only, see
 * documentation/CASINO-GENERATION.md for the prompt log) imported the way the
 * spec says every AI mesh is: flat normals recomputed, textures ignored, one
 * palette material. The pass does the rest.
 */
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { characterMaterial } from './materials'

export const DEALER_URL = '/models/casino-cat-v1.glb'

export const REAPER_URL = '/models/casino-reaper-v2.glb'

export default function Dealer({
  url = DEALER_URL,
  position = [1.7, 0, -2.75],
  height = 1.8,
  yaw = -0.35,
}: {
  url?: string
  position?: [number, number, number]
  height?: number
  yaw?: number
}) {
  const { scene } = useGLTF(url)
  const paper = useMemo(() => characterMaterial(), [])
  const group = useRef<THREE.Group>(null)

  // Derive from the cached scene, never mutate the loader's copy (field notes 4).
  const model = useMemo(() => {
    const root = scene.clone(true)
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return
      const flat = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()
      flat.computeVertexNormals()
      o.geometry = flat
      o.material = paper
    })
    return root
  }, [scene, paper])

  useLayoutEffect(() => {
    // normalise in the model's own frame (setFromObject is world-space; subtract the parent's offset)
    model.position.set(0, 0, 0)
    model.scale.setScalar(1)
    model.updateWorldMatrix(true, true)
    const parentPos = new THREE.Vector3()
    model.parent?.getWorldPosition(parentPos)
    const box = new THREE.Box3().setFromObject(model)
    const size = new THREE.Vector3()
    box.getSize(size)
    const s = height / (size.y || 1)
    model.scale.setScalar(s)
    model.updateWorldMatrix(true, true)
    box.setFromObject(model)
    const c = new THREE.Vector3()
    box.getCenter(c)
    model.position.set(-(c.x - parentPos.x), -(box.min.y - parentPos.y), -(c.z - parentPos.z))
  }, [model, height])

  return (
    <group ref={group} position={position} rotation={[0, yaw, 0]}>
      <primitive object={model} />
    </group>
  )
}

useGLTF.preload(DEALER_URL)
useGLTF.preload(REAPER_URL)
