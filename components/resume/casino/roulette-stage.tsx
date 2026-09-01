'use client'

/**
 * /roulette: the wheel on the felt, spinning, through the resume's own pass.
 *
 * Same shape as the shuffle stage: built apart from the casino scene so it can
 * be tuned without the table, but on the real materials and the real compositor,
 * so what looks right here looks right when it is dropped in.
 */
import { Suspense, useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { WebGPURenderer } from 'three/webgpu'
import { COMP_GRAPHS } from './comp-graphs'
import CompositorPost from './compositor-post'
import { driveLamp, feltMaterial, solidWatercolorMaterial, LAMP } from './materials'
import Roulette from './roulette-wheel'
import { pocketColour } from './roulette'

function Lamp() {
  const { size } = useThree()
  useEffect(() => {
    // no casino scene here to drive it, so the stage drives it once itself
    driveLamp({ y: LAMP.position[1], cone: LAMP.cone, gain: LAMP.gain })
    return undefined
  }, [size])
  return null
}

/**
 * The table the wheel stands on, as a PIECE rather than as a floor.
 *
 * It was a 30 by 30 plane, which is a floor with felt printed on it: the green
 * ran to every edge of the frame, so the wheel read as sitting on baize that
 * goes on forever rather than on a table. This is a round top with a padded
 * rail, a brass trim line and a skirt under it, so it has an edge and a
 * thickness and the dark of the room shows past it.
 *
 * The top is 2.35 against the wheel's 1.25, which is roughly the proportion a
 * real wheel has to the well it sits in.
 */
const TOP_R = 2.35
const TOP_H = 0.07

function Table({ mesh, paused, scrub, table, onResult }: { mesh: boolean; paused: boolean; scrub?: number; table: boolean; onResult: (n: number | null) => void }) {
  const felt = useMemo(() => feltMaterial(), [])
  const wood = useMemo(() => solidWatercolorMaterial('black', 'rouletteRail'), [])
  const brass = useMemo(() => solidWatercolorMaterial('gold', 'rouletteTrim'), [])
  const rail = useMemo(() => {
    const g = new THREE.TorusGeometry(TOP_R + 0.02, 0.085, 12, 96)
    g.rotateX(Math.PI / 2)
    return g
  }, [])
  const trim = useMemo(() => {
    const g = new THREE.TorusGeometry(TOP_R - 0.075, 0.012, 8, 96)
    g.rotateX(Math.PI / 2)
    return g
  }, [])
  useEffect(
    () => () => {
      rail.dispose()
      trim.dispose()
    },
    [rail, trim],
  )
  return (
    <>
      {/* the table is off by default: he wants the wheel on its own. Kept behind
          ?table rather than removed, because it is a finished piece and the
          casino page may well want the wheel standing in one. */}
      {table && (
        <>
          {/* the baize, a disc with a real edge rather than a plane to the horizon */}
          <mesh position={[0, -TOP_H / 2, 0]} material={felt} receiveShadow>
            <cylinderGeometry args={[TOP_R, TOP_R, TOP_H, 96]} />
          </mesh>
          {/* the padded rail, and a brass line inside it */}
          <mesh position={[0, 0.012, 0]} material={wood} castShadow receiveShadow>
            <primitive object={rail} attach="geometry" />
          </mesh>
          <mesh position={[0, 0.004, 0]} material={brass} castShadow receiveShadow>
            <primitive object={trim} attach="geometry" />
          </mesh>
          {/* the skirt, so the table has a thickness under the baize */}
          <mesh position={[0, -0.28, 0]} material={wood} receiveShadow>
            <cylinderGeometry args={[TOP_R - 0.03, TOP_R - 0.22, 0.5, 96]} />
          </mesh>
        </>
      )}
      <Roulette position={[0, 0, 0]} size={1.25} mesh={mesh} paused={paused} scrub={scrub} onResult={onResult} />
    </>
  )
}

export default function RouletteStage({
  comp = 'night',
  mesh = false,
  paused = false,
  scrub,
  table = false,
}: {
  comp?: string
  mesh?: boolean
  paused?: boolean
  scrub?: number
  table?: boolean
}) {
  const entry = COMP_GRAPHS[comp] ?? COMP_GRAPHS.night
  const [result, setResult] = useState<number | null>(null)
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0d0f0d', zIndex: 100000 }}>
      <Canvas
        dpr={[1, 1.75]}
        shadows
        camera={table ? { position: [0, 2.55, 3.0], fov: 36 } : { position: [0, 2.15, 2.62], fov: 36 }}
        gl={async (props) => {
          const renderer = new WebGPURenderer({ canvas: props.canvas as HTMLCanvasElement, antialias: true })
          await renderer.init()
          return renderer as unknown as never
        }}
      >
        <color attach="background" args={['#0d0f0d']} />
        <Lamp />
        <Suspense fallback={null}>
          <Table mesh={mesh} paused={paused} scrub={scrub} table={table} onResult={setResult} />
        </Suspense>
        {/**
          * positionPass ALWAYS, not the graph's own 'onChange'.
          *
          * The watercolour pass anchors its wash to the world through a POSITION
          * pass, which in 'onChange' mode renders once and waits for a call to
          * invalidatePosition that only the casino scene makes. The wheel turns,
          * so the wash would stay pinned to where it first was and leave a ghost.
          */}
        <CompositorPost
          build={entry.build}
          rawOutput={entry.rawOutput}
          renderScale={entry.renderScale ?? 1}
          positionPass="always"
        />
      </Canvas>
      {/* the winning number, read from the same spinAt the wheel is driven by,
          so the readout cannot disagree with where the ball actually is */}
      <div
        data-result={result ?? ''}
        style={{
          position: 'absolute',
          left: 24,
          bottom: 24,
          font: '600 15px Georgia, serif',
          letterSpacing: '0.08em',
          color: result === null ? 'rgba(246,242,230,0.45)' : '#f6f2e6',
          background: 'rgba(0,0,0,0.35)',
          padding: '8px 14px',
          borderRadius: 4,
        }}
      >
        {result === null ? 'spinning' : `${result} ${pocketColour(result)}`}
      </div>
    </div>
  )
}
