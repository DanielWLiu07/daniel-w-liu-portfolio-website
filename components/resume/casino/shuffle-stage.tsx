'use client'

/**
 * The stage the shuffle sits on: a camera looking down at the deck the way you
 * would look at your own hands, and the felt underneath so the cards have
 * something to read against.
 *
 * Deliberately thin. Everything about the SHUFFLE lives in deck-shuffle.tsx;
 * this file only exists so that component can be looked at.
 */
import { Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { WebGPURenderer } from 'three/webgpu'
import { COMP_GRAPHS } from './comp-graphs'
import CompositorPost from './compositor-post'
import { feltMaterial } from './materials'
import DeckShuffle from './deck-shuffle'

export default function ShuffleStage({
  scrub,
  paused,
  count,
  period,
  grid,
  comp = 'night',
}: {
  scrub?: number
  paused?: boolean
  count?: number
  period?: number
  grid?: boolean
  /** which of the resume's compositor graphs to print through */
  comp?: string
}) {
  const felt = useMemo(() => feltMaterial(), [])
  const entry = COMP_GRAPHS[comp] ?? COMP_GRAPHS.night

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0d0f0d', zIndex: 100000 }}>
      <Canvas
        dpr={[1, 1.75]}
        shadows
        camera={{ position: [0, 2.6, 4.2], fov: 32 }}
        gl={async (props) => {
          const renderer = new WebGPURenderer({ canvas: props.canvas as HTMLCanvasElement, antialias: true })
          await renderer.init()
          return renderer as unknown as never
        }}
      >
        <color attach="background" args={['#0d0f0d']} />
        {/* the resume's own felt, so the cards sit on the same green */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} material={felt} receiveShadow>
          <planeGeometry args={[24, 24]} />
        </mesh>
        {grid && <gridHelper args={[10, 20, '#2a4a34', '#1b3325']} position={[0, 0, 0]} />}
        <Suspense fallback={null}>
          <DeckShuffle scrub={scrub} paused={paused} count={count} period={period} />
        </Suspense>
        {/* the resume's own pass, so this is the same picture the casino page
            makes rather than a clean render of the same cards */}
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
