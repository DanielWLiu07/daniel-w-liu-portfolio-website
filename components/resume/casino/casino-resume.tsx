'use client'

/**
 * Resume, Cinematic mode: "Always bet on Daniel W Liu". A WebGPU casino floor
 * rendered through the manga pass, pinned behind a long scroll. The DOM
 * supplies the type (marquee, per role copy, the cash-out sign) and the scroll
 * position drives the scene.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { WebGPURenderer } from 'three/webgpu'
import type { MangaUniforms } from 'blender-to-threejs'
import { createInteractiveButtons } from '@/data/resume-buttons'
import { useTransitionState } from '@/components/ui/page-transition'
import { LoadingContent } from '@/components/ui/page-transition/loading-content'
import { SocialLinks } from '@/components/ui/social-links'
import { katieRozeFont } from '@/lib/fonts/katie-roze'
import CasinoScene, { BEATS, HAND, CHIP_STACKS, type ScrollState } from './casino-scene'
import TunePanel from './tune-panel'
import { FOLDER_KEYS } from './tune'
import type { ImpactFx } from './hero-chip'
import './casino.css'

const PAGE_HEIGHT_VH = 520
// Parked while the opening beat is tuned: no marquee, cards, chips or sign copy.
const SHOW_COPY = false

export default function CasinoResume() {
  const scroll = useRef<ScrollState>({ progress: 0, velocity: 0 })
  const uniforms = useRef<MangaUniforms | null>(null)
  const fx = useRef<ImpactFx>({ impactAge: -1, jolt: 0, landed: false })
  const [landed, setLanded] = useState(false)
  const [sceneReady, setSceneReady] = useState(false)
  const [progress, setProgress] = useState(0)
  const { transitionStage, signalReady } = useTransitionState()
  const signalled = useRef(false)

  // scroll -> shared ref (per frame, no React) + coarse state for the DOM
  useEffect(() => {
    let last = window.scrollY
    let raf = 0
    const tick = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      const y = window.scrollY
      scroll.current.velocity = y - last
      last = y
      const p = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0
      scroll.current.progress = p
      // the marquee comes in on the chip's impact beat, like pomme's login sign
      if (fx.current.landed) setLanded(true)
      setProgress((prev) => (Math.abs(prev - p) > 0.004 ? p : prev))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // ready handshake with the site transition
  useEffect(() => {
    if (sceneReady && !signalled.current) {
      signalled.current = true
      signalReady()
    }
  }, [sceneReady, signalReady])
  useEffect(() => {
    if (transitionStage === 'loading' && sceneReady) signalReady()
  }, [transitionStage, sceneReady, signalReady])

  // page transition hook: collapse the print to ink while the site covers
  useEffect(() => {
    const u = uniforms.current
    if (!u) return
    u.collapse.value = transitionStage === 'covering' ? 1 : 0
  }, [transitionStage])

  const onReady = useCallback(() => setSceneReady(true), [])
  // the resume file: click the folder to open it (camera settles over it, the two-pane view slides up)
  const [fileOpen, setFileOpen] = useState(false)
  const openFile = useCallback(() => setFileOpen(true), [])
  const closeFile = useCallback(() => setFileOpen(false), [])
  useEffect(() => {
    if (!fileOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFileOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fileOpen])
  // the beat (hand in, flick, RESUME, drop) starts once the paper cover starts peeling, never under it
  const armed = transitionStage === 'revealing' || transitionStage === 'hidden'
  // per-frame impact state from the hero chip (age, camera jolt)
  const report = useCallback((impactAge: number, jolt: number) => {
    const f = fx.current
    f.impactAge = impactAge
    f.jolt = jolt
    f.landed = f.landed || impactAge >= 0
  }, [])
  // the desk scene's links (github, linkedin, email, waterloo), minus the
  // photo props that only made sense on the desk
  const buttons = createInteractiveButtons().filter((b) => !['folder', 'selfie', 'cat'].includes(b.id))

  // which card is "in hand": the one most recently flipped
  const dealT = Math.min(1, Math.max(0, (progress - BEATS.deal[0]) / (BEATS.deal[1] - BEATS.deal[0])))
  const n = HAND.length
  const per = 1 / n
  let active = -1
  for (let i = 0; i < n; i++) {
    const local = (dealT - i * per * 0.75) / (per * 1.6)
    if (local > 0.6) active = i
  }
  const inDeal = progress > BEATS.deal[0] - 0.02 && progress < BEATS.chips[0] + 0.06
  const inMarquee = progress < BEATS.marquee[1]
  const inChips = progress > BEATS.chips[0] + 0.02 && progress < BEATS.sign[0] + 0.04
  const inSign = progress > BEATS.sign[0] + 0.1

  // ?tune shows the live layout sliders (values also readable straight from the URL, see tune.ts)
  const showTune = useMemo(() => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).has('tune') : false), [])
  // ?fld: just the presented folder's own knobs, for dialling the open file in place on the site itself
  const showFolderTune = useMemo(() => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).has('fld') : false), [])

  return (
    <div className="casino-root" style={{ height: `${PAGE_HEIGHT_VH}vh` }}>
      <div className="casino-stage">
        <Canvas
          camera={{ position: [0, 6.2, 5.4], fov: 38 }}
          dpr={[1, 1.5]}
          shadows="soft"
          gl={async (props) => {
            const renderer = new WebGPURenderer({
              canvas: props.canvas as HTMLCanvasElement,
              antialias: true,
            })
            await renderer.init()
            return renderer as unknown as never
          }}
        >
          <CasinoScene armed={armed} folderOpen={fileOpen} onFolderOpen={openFile} scroll={scroll} fx={fx} report={report} onReady={onReady} uniformsRef={uniforms} />
        </Canvas>
        {showTune && <TunePanel />}
        {!showTune && showFolderTune && <TunePanel only={FOLDER_KEYS} title="the open folder" />}

        {/* the open file lives in the scene (pages inside the folder); only a close control here */}
        <button type="button" className={`casino-file-close ${fileOpen ? 'is-open' : ''}`} onClick={closeFile} aria-label="Close the file">
          Close
        </button>

        {SHOW_COPY && (<>
        <section className={`casino-copy casino-marquee ${inMarquee && landed ? 'is-on' : ''}`}>
          <p className="casino-kicker">The House</p>
          <h1 className={`casino-title ${katieRozeFont.className}`}>Always bet on<br />Daniel W Liu</h1>
          <p className="casino-sub">Scroll to deal the hand.</p>
        </section>

        <section className={`casino-copy casino-hand ${inDeal && active >= 0 ? 'is-on' : ''}`}>
          {active >= 0 && (
            <article key={HAND[active].company}>
              <p className="casino-kicker">
                Card {active + 1} of {n}, {HAND[active].period}
              </p>
              <h2>{HAND[active].title}</h2>
              <p className="casino-company">{HAND[active].company}</p>
              <p className="casino-desc">{HAND[active].description}</p>
            </article>
          )}
        </section>

        <section className={`casino-copy casino-chips ${inChips ? 'is-on' : ''}`}>
          <p className="casino-kicker">Buy-in</p>
          <h2>The stack</h2>
          <p className="casino-sub">One stack per category, one chip per tool I have shipped with.</p>
          <ul className="casino-tech">
            {CHIP_STACKS.map((c) => (
              <li key={c.title}>{c.title}: {c.count}</li>
            ))}
          </ul>
        </section>

        <section className={`casino-copy casino-sign ${inSign ? 'is-on' : ''}`}>
          <p className="casino-kicker">Cash out</p>
          <h2>Take the hand</h2>
          <div className="casino-links casino-cashout">
            <a href="/assets/resume.pdf" target="_blank" rel="noreferrer">Resume PDF</a>
            {buttons.map((b) => (
              <button key={b.id} type="button" onClick={b.action}>{b.id}</button>
            ))}
          </div>
          <a className="casino-lite" href="/resume/lite">Lite version</a>
        </section>
        </>)}
      </div>

      {SHOW_COPY && inSign && <SocialLinks variant="black" />}

      {!sceneReady && (
        <div className="fixed inset-0 z-[10000]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/images/white_paper.webp" alt="" className="absolute inset-0 w-full h-full object-cover" />
          <LoadingContent />
        </div>
      )}
    </div>
  )
}
