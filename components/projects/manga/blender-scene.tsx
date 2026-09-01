'use client'

/**
 * His PROJECTS scene, rebuilt in the browser from exported data alone.
 *
 * Nothing here is a transcription. Three files come out of Blender and this
 * component consumes them:
 *
 *   projects-scene.glb            geometry only (export_materials='NONE'), 53
 *                                 renderable meshes at frame 55, 116k verts
 *   projects-scene.manifest.json  which material each mesh wears
 *   projects-materials.ir.json    every material's node graph, from the
 *                                 library's tools/export_scene_materials.py
 *
 * The materials are built by buildMaterialFromIR, so re-exporting the JSON is
 * the entire update procedure when he changes a shader. Six of his seven
 * materials build with no hand work; the seventh uses a Principled BSDF and an
 * Image Texture, which the IR builder does not emit yet and REFUSES to fake, so
 * it falls back to a flat grey and says so on window.__scene.
 *
 * The rig is his, read out of the same file: a sun at 0.1 W carrying -0.578735
 * stops of Exposure, two point lamps at 12.6 W / +0.45197 stops and 10 W, and a
 * world of 0.0802479. See PROJECTS_LIGHTS in his-scene.tsx for the conversion.
 */
import { Suspense, useEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'
import {
  blenderFovY,
  blenderMatrixToThree,
  blenderToThree,
  buildMaterialFromIR,
  compileMaterial,
  graph,
  irCoverage,
  type IRGraph,
  type SketchLight,
} from 'blender-to-threejs'
import manifest from './projects-scene.manifest.json'
import materialsIR from './projects-materials.ir.json'

const GLB = '/models/projects-scene.glb'

/** his Scene's rig at frame 55, Blender axes converted with (x, y, z) -> (x, z, -y) */
const LIGHTS: readonly SketchLight[] = [
  { kind: 'sun', dir: new THREE.Vector3(0.37118, -0.22719, 0.90034).normalize(), energy: 0.1, exposure: -0.578735 },
  { kind: 'point', position: blenderToThree(0.88167, -0.13634, 0.49466), power: 12.6, exposure: 0.45197 },
  { kind: 'point', position: blenderToThree(-3.60949, -0.94623, 0.61978), power: 10.0 },
]
const WORLD_AMBIENT = 0.0802479

/** Camera.001 at frame 55: 50 mm on 36x24, looking -X with +Z up, 1920x1080 */
const CAM = blenderToThree(6.04, 0, 0.179558)
const LOOK = new THREE.Vector3(CAM.x - 1, CAM.y, CAM.z)
const LENS = { lens: 50, sensorWidth: 36, sensorHeight: 24, sensorFit: 'AUTO' as const }
export const ASPECT = 1920 / 1080

/**
 * Which of the scene's 53 meshes to draw. 'ship' is the spaceship on its own,
 * which is what the shader work is actually about; 'all' is the whole frame-55
 * scene (moon, sign, starfield, city).
 */
export type SceneSubset = 'ship' | 'all'

/** the two meshes that make up the ship, by the same normalised key the lookup uses */
const SHIP = new Set(['cube010', 'cube003'])

/**
 * The glTF exporter sanitises object names: Blender's "Object_12.001" comes back
 * as "Object_12001". Matching raw names silently sent 45 of 53 meshes to the
 * fallback material, which reads as a broken port rather than a broken lookup,
 * so both sides are normalised the same way.
 */
const key = (n: string) => n.replace(/\./g, '').toLowerCase()

interface ManifestObject {
  name: string
  materials: (string | null)[]
  verts: number
  /** the object's world matrix at the exported frame, row-major, Blender axes */
  matrix_blender: number[][]
}

/** a material the IR builder cannot emit yet: flat, and reported rather than faked */
function fallbackMaterial(): THREE.Material {
  const g = graph()
  const m = compileMaterial(g.rgb(0.55, 0.55, 0.55))
  m.side = THREE.DoubleSide
  return m
}

function Scene({ only }: { only: SceneSubset }) {
  const { scene } = useGLTF(GLB)

  const built = useMemo(() => {
    const wanted = (n: string) => only === 'all' || SHIP.has(key(n))
    const ir = materialsIR as unknown as IRGraph
    const byName = new Map<string, ManifestObject>()
    for (const o of (manifest as { objects: ManifestObject[] }).objects) byName.set(key(o.name), o)

    const meshes: { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4; material: THREE.Material; name: string }[] = []
    // one material per (material name, mesh) pair: Generated is per-OBJECT, so
    // two meshes wearing one Blender material still need two builds
    const failed: { mesh: string; material: string; why: string }[] = []
    let reused = 0

    scene.updateWorldMatrix(true, true)
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      // The character is a SEPARATE PASS in his own pipeline: the projects page
      // plays manga_bg_slowed and manga_man as two videos and composites them.
      // It is also skinned, and this export carries no armature, so including it
      // here would put a rest-pose figure across the sky that his background
      // render does not have.
      if (mesh.name.startsWith('Ch33')) return
      if (!wanted(mesh.name)) return
      const entry = byName.get(key(mesh.name))
      const matName = entry?.materials?.[0] ?? null
      const geometry = mesh.geometry
      geometry.computeBoundingBox()
      const b = geometry.boundingBox as THREE.Box3
      // bounds in the geometry's OWN (glTF) axes; the builder un-swaps the
      // normalised value back to Blender's with space: 'gltf'
      const bounds = {
        min: b.min.toArray() as [number, number, number],
        max: b.max.toArray() as [number, number, number],
      }
      let material: THREE.Material
      if (!matName || !ir.materials[matName]) {
        failed.push({ mesh: mesh.name, material: matName ?? '(none)', why: 'not in the exported IR' })
        material = fallbackMaterial()
      } else {
        try {
          const { node } = buildMaterialFromIR(ir, {
            lights: LIGHTS,
            worldAmbient: WORLD_AMBIENT,
            generatedBounds: bounds,
            space: 'gltf',
            material: matName,
          })
          material = compileMaterial(node)
          material.side = THREE.DoubleSide
          reused++
        } catch (e) {
          failed.push({ mesh: mesh.name, material: matName, why: (e as Error).message })
          material = fallbackMaterial()
        }
      }
      // Placement comes from the MANIFEST, not from the glTF node transform.
      // The exporter writes an animated object's REST transform (export_animations
      // off does not change that), so the ship arrived at its parked position
      // three units from where frame 55 puts it. The manifest carries each
      // object's evaluated world matrix at the exported frame, and the geometry
      // is still in its own local space, which is what Generated needs anyway.
      const matrix = entry?.matrix_blender
        ? blenderMatrixToThree(entry.matrix_blender)
        : mesh.matrixWorld.clone()
      meshes.push({ geometry, matrix, material, name: mesh.name })
    })

    // where things actually LANDED, so a frame that looks empty can be told
    // apart from a frame that is aimed somewhere else
    const box = new THREE.Box3()
    for (const m of meshes) {
      const b = new THREE.Box3().setFromBufferAttribute(m.geometry.getAttribute('position') as THREE.BufferAttribute)
      box.union(b.applyMatrix4(m.matrix))
    }
    const probe = ['Cube010', 'Cube003', 'Text', 'Plane'].map((n) => {
      const hit = meshes.find((m) => m.name === n)
      if (!hit) return { name: n, missing: true }
      const c = new THREE.Vector3().setFromMatrixPosition(hit.matrix)
      return { name: n, at: c.toArray().map((v) => +v.toFixed(3)) }
    })

    const cov = irCoverage(ir)
    const w = window as unknown as Record<string, unknown>
    w.__scene = {
      meshes: meshes.length,
      builtFromIR: reused,
      fallbacks: failed.length,
      failed: failed.slice(0, 8),
      irNodeTypes: cov.used.length,
      irMissing: cov.missing,
      sceneMin: box.min.toArray().map((v) => +v.toFixed(2)),
      sceneMax: box.max.toArray().map((v) => +v.toFixed(2)),
      camera: CAM.toArray(),
      probe,
      materials: Object.keys(ir.materials),
    }
    return meshes
  }, [scene])

  return (
    <>
      {built.map((m, i) => (
        <mesh key={i} geometry={m.geometry} material={m.material} matrixAutoUpdate={false} matrix={m.matrix} />
      ))}
    </>
  )
}

function Rig() {
  const { camera, size } = useThree()
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    cam.position.copy(CAM)
    cam.up.set(0, 1, 0)
    cam.lookAt(LOOK)
    cam.fov = blenderFovY(LENS, size.width / size.height)
    cam.near = 0.1
    cam.far = 1000
    cam.updateProjectionMatrix()
  }, [camera, size.width, size.height])
  return null
}

export default function BlenderScene({
  background = '#000000',
  only = 'ship',
}: {
  background?: string
  only?: SceneSubset
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background, display: 'grid', placeItems: 'center', zIndex: 100000 }}>
      <div
        data-capture="stage"
        style={{
          aspectRatio: String(ASPECT),
          width: `min(100vw, calc(100vh * ${ASPECT}))`,
          height: `min(100vh, calc(100vw / ${ASPECT}))`,
          background,
        }}
      >
        <Canvas
          dpr={1}
          // NoToneMapping: r3f defaults to ACESFilmic and overwrites whatever the
          // gl factory sets, which is a 2.3x error in the darks against Blender's
          // Standard view transform
          flat
          gl={async (props) => {
            const renderer = new WebGPURenderer({ canvas: props.canvas as HTMLCanvasElement, antialias: true, alpha: true })
            await renderer.init()
            renderer.toneMapping = THREE.NoToneMapping
            renderer.outputColorSpace = THREE.SRGBColorSpace
            return renderer as unknown as never
          }}
        >
          <Rig />
          {/* useGLTF suspends, and without a boundary the whole subtree just
              stops rendering with no error to show for it */}
          <Suspense fallback={null}>
            <Scene only={only} />
          </Suspense>
        </Canvas>
      </div>
    </div>
  )
}

useGLTF.preload(GLB)
