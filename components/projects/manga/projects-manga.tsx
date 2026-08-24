'use client'

/**
 * The projects section on the WebGPU + node-graph stack, printed as manga.
 *
 * Mounted behind ?v3 on /projects so the shipping carousel is untouched while
 * this is built. Same shape as the casino page: a tall scroll container, a
 * pinned stage, and a Canvas whose renderer is built by an async factory
 * because WebGPURenderer has to init() before r3f can use it.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { WebGPURenderer } from 'three/webgpu'
import { projects } from '@/data/projects'
import MangaPost, { type MangaKnobs } from './manga-post'
import ProjectsScene from './projects-scene'
import { useScrollRef } from './scroll'

/** one viewport of scroll per project, plus a little run-out */
const PAGE_HEIGHT_VH = (projects.length + 0.5) * 100

export default function ProjectsManga() {
  const [ready, setReady] = useState(false)
  const knobs = useRef<MangaKnobs>({ grit: 0.3, collapse: 0 })
  const scroll = useScrollRef()
  const onReady = useCallback(() => setReady(true), [])
  const [raw, setRaw] = useState(false)
  useEffect(() => {
    setRaw(new URLSearchParams(window.location.search).has('raw'))
  }, [])

  return (
    <div style={{ height: `${PAGE_HEIGHT_VH}vh`, background: '#f5f5f2' }}>
      <div style={{ position: 'fixed', inset: 0 }}>
        <Canvas
          camera={{ position: [0, 0.45, 5.2], fov: 42 }}
          dpr={[1, 1.5]}
          gl={async (props) => {
            const renderer = new WebGPURenderer({
              canvas: props.canvas as HTMLCanvasElement,
              antialias: true,
            })
            await renderer.init()
            return renderer as unknown as never
          }}
        >
          <ProjectsScene scroll={scroll} knobs={knobs} />
          {/* ?raw drops the print pass so the scene underneath can be read on its
              own. Whether a tone problem is the MATERIALS or the PASS is not
              something you can tell from the printed frame, and guessing costs
              more than the switch does. */}
          {!raw && <MangaPost knobs={knobs} onReady={onReady} />}
        </Canvas>
      </div>
      {!ready && !raw && <div style={{ position: 'fixed', inset: 0, background: '#f5f5f2', zIndex: 10 }} />}
    </div>
  )
}
