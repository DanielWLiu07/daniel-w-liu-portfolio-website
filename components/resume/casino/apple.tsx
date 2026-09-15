'use client'

/**
 * Pomme's hero apple (web/public/scene/apple.glb), placed beside the chip so
 * the compositor's watercolour can be compared against pomme's on the same
 * object. Shaded with the library's port of pomme's painterly cel style (toon
 * ramp, stroke-wobbled normals, dithered pigment, hull outline) under pomme's
 * light rig, so the compositor paints the same input pomme's pass painted.
 */
import { useEffect, useLayoutEffect, useMemo } from 'react'
import { useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { applyPainterlyStyle, bakeMapToVertexColors, laplacianSmooth, weldPositionColor } from 'blender-to-threejs'

export const APPLE_URL = '/models/pomme-apple.glb'

// the cleanup (bake, weld, 120 laplacian iterations on 78k verts) runs once per
// page, not per mount: StrictMode double-mounts and route revisits would redo it
const cleaned = new Map<THREE.Object3D, THREE.Object3D>()

export default function Apple({
  position = [1.6, 0, 0],
  height = 1.1,
  centred = false,
}: {
  position?: [number, number, number]
  height?: number
  /** pomme placement: model centred on the group origin (not bottom-aligned) */
  centred?: boolean
}) {
  const { scene } = useGLTF(APPLE_URL)
  const model = useMemo(() => {
    const hit = cleaned.get(scene)
    if (hit) return hit
    const root = scene.clone(true)
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return
      o.castShadow = true
      // pomme's apple casts but never receives (no self-shadow crease from the leaves)
      o.receiveShadow = false
      // pomme's cleanup: bake the atlas to vertex colours, weld, melt facet
      // creases (laplacian 120 / 0.6), recompute normals, roughness 1
      const mat = (Array.isArray(o.material) ? o.material[0] : o.material) as THREE.MeshStandardMaterial
      o.material = mat.clone()
      try {
        const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
        bakeMapToVertexColors(o)
        o.geometry = weldPositionColor(o.geometry)
        if (!q?.has('nosmooth')) laplacianSmooth(o.geometry, 120, 0.6)
        o.geometry.computeVertexNormals()
      } catch (err) {
        console.warn('apple mesh cleanup skipped', err)
      }
      const m = o.material as THREE.MeshStandardMaterial
      m.roughness = 1
      m.flatShading = false
      m.needsUpdate = true
    })
    cleaned.set(scene, root)
    return root
  }, [scene])
  const normalMap = useTexture('/models/watercolor_normal.png')
  useEffect(() => {
    const dbg = new URLSearchParams(window.location.search).get('pdbg') as 'strokes' | 'op' | 'pig' | 'cel' | 'lit' | 'dobj' | 'base' | 'nrm' | 'nrmw' | null
    const nohull = new URLSearchParams(window.location.search).has('nohull')
    const handle = applyPainterlyStyle(model, { normalMap, debug: dbg ?? undefined, hull: !nohull })
    return () => handle.remove()
  }, [model, normalMap])
  useLayoutEffect(() => {
    // normalise in the model's OWN frame: bounding boxes from setFromObject are
    // world-space, and the parent group's offset would otherwise leak into the
    // placement (the apple sat below the ground plane, whose shadow then cut
    // through it as a dark band)
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
    model.position.set(-(c.x - parentPos.x), centred ? -(c.y - parentPos.y) : -(box.min.y - parentPos.y), -(c.z - parentPos.z))
  }, [model, height, centred])
  return (
    <group position={position}>
      <primitive object={model} />
    </group>
  )
}

useGLTF.preload(APPLE_URL)

/** pomme's cel-tuned light rig (natureScene.js), world positions. */
export function PommeLights() {
  const noShadow = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('noshadow')
  return (
    <>
      <directionalLight
        color="#ffe3b8"
        intensity={3.2}
        position={[4.5, 4.2, 0.4]}
        castShadow={!noShadow}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
        shadow-radius={6}
      />
      <directionalLight color="#8fa0c4" intensity={0.65} position={[-4, 2, 1]} />
      <directionalLight color="#ffd28a" intensity={1.6} position={[-1.5, 3.5, -4]} />
      <ambientLight color="#5a4c3c" intensity={0.85} />
    </>
  )
}
