'use client'

/**
 * The casino assets, laid out on the felt so they can be looked at together.
 *
 * Not a scene: a SHEET. Every piece is the real component with the real
 * materials, printed through the resume's own watercolour pass, so what is on
 * this page is exactly what lands in the casino page. It exists so a new chip
 * colour or a change to the dice can be judged next to the ones already there
 * instead of by loading the whole table and scrolling to it.
 */
import { Suspense, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { COMP_GRAPHS } from './comp-graphs'
import CompositorPost from './compositor-post'
import {
  CHIP_INKS,
  CHIP_VALUE,
  chipFaceWatercolorMaterial,
  chipWatercolorMaterial,
  driveLamp,
  feltMaterial,
  LAMP,
  solidWatercolorMaterial,
  type ChipInk,
} from './materials'
import Die from './dice'
import { useGLTF } from '@react-three/drei'

/**
 * The Meshy chip: a generated disc with the rim notches and the face ring as real
 * GEOMETRY rather than as UV maths.
 *
 * It arrives untinted, which is what makes it useful: the colour comes from the
 * existing chip palette, so one mesh gives every denomination. It deliberately
 * does NOT wear chipWatercolorMaterial, because that material draws the notches
 * and the ring from UVs and this mesh already has them; drawing them twice, on a
 * mesh whose unwrap has nothing to do with that convention, is a mess.
 */
const MESHY_CHIP = '/models/casino-chip-meshy.glb'

function useMeshyChip(): THREE.BufferGeometry | null {
  const { scene } = useGLTF(MESHY_CHIP)
  return useMemo(() => {
    let geo: THREE.BufferGeometry | null = null
    scene.updateWorldMatrix(true, true)
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh || geo) return
      const g = m.geometry.clone()
      g.applyMatrix4(m.matrixWorld)
      g.computeBoundingBox()
      const b = g.boundingBox as THREE.Box3
      const size = b.getSize(new THREE.Vector3())
      const c = b.getCenter(new THREE.Vector3())
      g.translate(-c.x, -c.y, -c.z)
      /**
       * Lay it flat, by finding the THIN axis rather than assuming one.
       *
       * Blender reported this mesh as thin along its Y, but that is Blender's Y
       * after the glTF import swaps axes; in the file it is thin along Z. Stacking
       * it along Y without checking put eight columns of chips on their edges like
       * wheels, which looks like a scaling bug and is not one.
       */
      const thin = size.x < size.y && size.x < size.z ? 'x' : size.z < size.y ? 'z' : 'y'
      if (thin === 'z') g.rotateX(-Math.PI / 2)
      else if (thin === 'x') g.rotateZ(Math.PI / 2)
      g.computeBoundingBox()
      const laid = (g.boundingBox as THREE.Box3).getSize(new THREE.Vector3())
      // scale so the DIAMETER matches the procedural chip; the thickness then
      // follows from the mesh's own proportions rather than being forced
      const k = (CHIP_R * 2) / Math.max(laid.x, laid.z)
      g.scale(k, k, k)
      g.computeBoundingBox()
      g.computeBoundingSphere()
      geo = g
    })
    return geo
  }, [scene])
}

const CHIP_R = 0.3
const CHIP_H = 0.075

/** one stack of a colour, tall enough to read as a stack rather than a coin */
function ChipStack({ ink, x, count, mesh }: { ink: ChipInk; x: number; count: number; mesh: boolean }) {
  const meshy = useMeshyChip()
  const uvMats = useMemo(
    () => [chipWatercolorMaterial(ink), chipFaceWatercolorMaterial(ink), chipFaceWatercolorMaterial(ink)],
    [ink],
  )
  const solid = useMemo(() => solidWatercolorMaterial(ink, 'meshyChip'), [ink])
  const useMesh = mesh && meshy !== null
  const mats = useMesh ? solid : uvMats
  const cyl = useMemo(() => new THREE.CylinderGeometry(CHIP_R, CHIP_R, CHIP_H, 40), [])
  const geo = useMesh ? (meshy as THREE.BufferGeometry) : cyl
  const step = useMesh
    ? ((meshy as THREE.BufferGeometry).boundingBox as THREE.Box3).getSize(new THREE.Vector3()).y
    : CHIP_H
  return (
    <group position={[x, 0, 0]}>
      {Array.from({ length: count }, (_, k) => (
        <mesh
          key={k}
          geometry={geo}
          material={mats}
          castShadow
          receiveShadow
          // the small wobble is what stops a stack reading as one extruded cylinder
          position={[Math.sin(k * 2.3) * 0.006, step / 2 + k * step, Math.cos(k * 1.7) * 0.006]}
          rotation={[0, k * 0.4, 0]}
        />
      ))}
    </group>
  )
}

function Sheet({ spin, mesh }: { spin: boolean; mesh: boolean }) {
  const felt = useMemo(() => feltMaterial(), [])
  const turn = useMemo(() => ({ t: 0 }), [])
  const g = useMemo(() => new THREE.Group(), [])
  useFrame((_, dt) => {
    if (!spin) return
    turn.t += dt * 0.25
    g.rotation.y = turn.t
  })
  const gap = CHIP_R * 2.35
  const x0 = -((CHIP_INKS.length - 1) * gap) / 2
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]} material={felt} receiveShadow>
        <planeGeometry args={[30, 30]} />
      </mesh>
      <primitive object={g}>
        <group position={[0, 0, -0.35]}>
          {CHIP_INKS.map((ink, i) => (
            // taller stacks for the low denominations, the way a rack sits
            <ChipStack key={ink} ink={ink} x={x0 + i * gap} count={CHIP_VALUE[ink] <= 25 ? 7 : 5} mesh={mesh} />
          ))}
        </group>
        {/* a matched pair: both white with black pips, the pips cut IN. y is half
            the die's size, so each rests on the felt the way a chip does */}
        <Die value={5} ink="white" pipInk="black" spin={0.3} position={[-0.3, 0.21, 0.85]} />
        <Die value={2} ink="white" pipInk="black" spin={-0.55} position={[0.3, 0.21, 0.95]} />
      </primitive>
    </>
  )
}

function Lamp() {
  const { size } = useThree()
  useMemo(() => {
    // no casino scene here to drive it, so the sheet drives it once itself
    driveLamp({ y: LAMP.position[1], cone: LAMP.cone, gain: LAMP.gain })
    return size
  }, [size])
  return null
}

export default function AssetsStage({ comp = 'night', spin = true, mesh = false }: { comp?: string; spin?: boolean; mesh?: boolean }) {
  const entry = COMP_GRAPHS[comp] ?? COMP_GRAPHS.night
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0d0f0d', zIndex: 100000 }}>
      <Canvas
        dpr={[1, 1.75]}
        shadows
        camera={{ position: [0, 2.15, 5.1], fov: 34 }}
        gl={async (props) => {
          const renderer = new WebGPURenderer({ canvas: props.canvas as HTMLCanvasElement, antialias: true })
          await renderer.init()
          return renderer as unknown as never
        }}
      >
        <color attach="background" args={['#0d0f0d']} />
        <Lamp />
        <Suspense fallback={null}>
          <Sheet spin={spin} mesh={mesh} />
        </Suspense>
        {/**
          * positionPass ALWAYS, not the graph's own 'onChange'.
          *
          * The watercolour pass anchors its wash to the world through a POSITION
          * pass. In 'onChange' mode that pass renders once and is only re-rendered
          * when the page calls invalidatePosition, which the casino scene does and
          * this one has no way to. Everything here moves every frame, so the wash
          * stayed pinned to where the models FIRST were and left a smeared ghost
          * of them at their starting position.
          */}
        <CompositorPost
          build={entry.build}
          rawOutput={entry.rawOutput}
          renderScale={entry.renderScale ?? 1}
          positionPass="always"
        />
      </Canvas>
    </div>
  )
}

useGLTF.preload(MESHY_CHIP)
