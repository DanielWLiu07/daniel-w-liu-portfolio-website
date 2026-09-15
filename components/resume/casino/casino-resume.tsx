'use client'

/**
 * Resume, Cinematic mode: "Always bet on Daniel W Liu". A WebGPU casino floor
 * rendered through the manga pass, pinned behind a long scroll. The DOM
 * supplies the type (marquee, per role copy, the cash-out sign) and the scroll
 * position drives the scene.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Canvas } from '@react-three/fiber'
import { canStartCasinoIntro } from './intro-ready'
import { WebGPURenderer } from 'three/webgpu'
import type { MangaUniforms } from 'blender-to-threejs'
import { createInteractiveButtons } from '@/data/resume-buttons'
import { useTransitionState } from '@/components/ui/page-transition'
import { LoadingContent } from '@/components/ui/page-transition/loading-content'
import { SocialLinks } from '@/components/ui/social-links'
import CasinoScene, { BEATS, HAND, CHIP_STACKS, type ScrollState } from './casino-scene'
import { CHIP_KEYS, EYE_KEYS, FOLDER_KEYS, JACK_KEYS, SUIT_KEYS, TITLE_KEYS } from './tune'
import type { ImpactFx } from './hero-chip'
import './casino.css'

// Keep editor code out of the public scene's initial download.
const TunePanel = dynamic(() => import('./tune-panel'), { ssr: false })
const FlightWorkspace = dynamic(() => import('./flight-workspace'), { ssr: false })
const PanelRenderBridge = dynamic(() => import('@/components/panels/panel-render-bridge'), { ssr: false })
const CasinoLayoutPanel = dynamic(() => import('./layout-panel'), { ssr: false })
const JackWorkspace = dynamic(() => import('./jack-workspace'), { ssr: false })
const TitleEyeWorkspace = dynamic(() => import('./title-eye-workspace'), { ssr: false })

const PAGE_HEIGHT_VH = 520
// Parked while the opening beat is tuned: no marquee, cards, chips or sign copy.
const SHOW_COPY = false

export default function CasinoResume({ layoutTuning = false, jackEditing = false, eyeEditing = false }: { layoutTuning?: boolean; jackEditing?: boolean; eyeEditing?: boolean }) {
  const scroll = useRef<ScrollState>({ progress: 0, velocity: 0 })
  const uniforms = useRef<MangaUniforms | null>(null)
  const fx = useRef<ImpactFx>({ impactAge: -1, jolt: 0, landed: false })
  const [landed, setLanded] = useState(false)
  const [sceneReady, setSceneReady] = useState(false)
  const [progress, setProgress] = useState(0)
  const { transitionStage, signalReady } = useTransitionState()
  const signalled = useRef(false)

  // Keep scroll state current without a second animation loop polling layout.
  useEffect(() => {
    let last = window.scrollY
    const tick = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      const y = window.scrollY
      scroll.current.velocity = y - last
      last = y
      const p = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0
      scroll.current.progress = p
      if (SHOW_COPY) setProgress((prev) => (Math.abs(prev - p) > 0.004 ? p : prev))
    }
    tick()
    window.addEventListener('scroll', tick, { passive: true })
    window.addEventListener('resize', tick)
    return () => {
      window.removeEventListener('scroll', tick)
      window.removeEventListener('resize', tick)
    }
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
  // Never spend the opening beat under either loading cover. All actors share
  // the chip's start clock, which remains unset until this gate opens.
  const armed = canStartCasinoIntro(sceneReady, transitionStage)
  // per-frame impact state from the hero chip (age, camera jolt)
  const report = useCallback((impactAge: number, jolt: number) => {
    const f = fx.current
    f.impactAge = impactAge
    f.jolt = jolt
    if (!f.landed && impactAge >= 0) {
      f.landed = true
      setLanded(true)
    }
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
  /**
   * 1.35 drawing-buffer pixels per CSS pixel, not 1.5, and not 1 either.
   *
   * On a 2x display the old cap rendered 2.25 times the pixels, and this page is pixel-bound in the
   * painterly pass: measured, the same scene costs 20.2 ms a frame at 1920x1080 and 34.5 at the same size
   * on a 2x display. A pass whose whole job is to break edges up into brushwork is the last place that
   * resolution buys anything, so 1.5 was paying 70 percent more for a difference it then paints over.
   * A flat 1 was the other extreme and read as soft, so this is the middle: 1.82x the pixels of a 1x buffer
   * instead of 2.25x. Nothing changes on a 1x display, where every value here settles to 1. ?hi restores
   * the old cap for captures.
   */
  const hiDpr = useMemo(() => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).has('hi') : false), [])
  const showDealerTune = useMemo(() => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).has('dealer') : false), [])
  const showTune = useMemo(() => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).has('tune') : false), [])
  const showChipTune = useMemo(() => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).has('chippos') : false), [])
  // ?fld: just the presented folder's own knobs, for dialling the open file in place on the site itself
  const showFolderTune = useMemo(() => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).has('fld') : false), [])
  // ?jack: the opening title card's own knobs, on the right, with a save that survives a reload
  const showJackTune = useMemo(() => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).has('jack') : false), [])
  // ?suits: place the impact's suit burst, frozen mid-flash so there is something to drag
  const showSuitTune = useMemo(() => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).has('suits') : false), [])
  const showImpactEyeTune = useMemo(() => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).has('eyeTiming') : false), [])
  // ?flight: the coin's throw and the camera chasing it, and nothing else. Replays on a loop by default.
  const showTools = useMemo(() => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).has('tools') : false), [])
  const showFlightTune = useMemo(() => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).has('flight') : false), [])
  // ?eyes: the field of eyes over the title card, and nothing else
  const showEyeTune = useMemo(() => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).has('eyes') : false), [])
  // ?title: the ransom title, each line on its own, and the chips and dice round it
  const showTitleTune = useMemo(() => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).has('title') : false), [])

  return (
    <div className={`casino-root${jackEditing ? ' jack-editor-mode' : ''}${eyeEditing ? ' eye-editor-mode' : ''}`} style={{ height: jackEditing || eyeEditing ? '100dvh' : `${PAGE_HEIGHT_VH}vh` }}>
      <div className="casino-stage">
        <Canvas
          camera={{ position: [0, 6.2, 5.4], fov: 38 }}
          dpr={hiDpr ? [1, 1.5] : [1, 1.35]}
          shadows="soft"
          gl={async (props) => {
            const canvas = props.canvas as HTMLCanvasElement
            const renderer = new WebGPURenderer({
              canvas,
              // The scene target already has 4x MSAA. This canvas only receives
              // the painted fullscreen blit, so another 4x resolve adds no detail.
              antialias: false,
            })
            // Allocate the initial GPU attachments at the measured stage size,
            // not the canvas element's default 300×150 during async init.
            const resize = () => {
              const bounds = canvas.parentElement?.getBoundingClientRect()
              renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, hiDpr ? 1.5 : 1.35))
              renderer.setSize(Math.max(1, bounds?.width ?? canvas.clientWidth), Math.max(1, bounds?.height ?? canvas.clientHeight), false)
            }
            resize()
            await renderer.init()
            // Init can overlap a display/DPR change. Invalidate attachments once
            // it finishes as well, before Fiber starts the first render.
            resize()
            return renderer as unknown as never
          }}
        >
          <CasinoScene armed={armed} folderOpen={fileOpen} onFolderOpen={openFile} onFolderClose={closeFile} scroll={scroll} fx={fx} report={report} onReady={onReady} uniformsRef={uniforms} />
          {(showFlightTune || showTools || eyeEditing) && <PanelRenderBridge enabled />}
        </Canvas>
        {eyeEditing ? <TitleEyeWorkspace /> : jackEditing ? <JackWorkspace /> : layoutTuning ? <CasinoLayoutPanel /> : <>
        {showTune && <TunePanel />}
        {!showTune && showDealerTune && <CasinoLayoutPanel characterOnly />}
        {!showTune && !showSuitTune && showImpactEyeTune && <TunePanel only={['hitEyeDelay', 'hitEyeStagger', 'hitRevealNoise']} title="impact animation" compact />}
        {!showTune && showChipTune && <TunePanel only={CHIP_KEYS} title="the red chip" />}
        {!showTune && showFolderTune && <TunePanel only={FOLDER_KEYS} title="the open folder" />}
        {!showTune && !showFolderTune && showSuitTune && <TunePanel only={SUIT_KEYS} title="the suit burst" />}
        {!showTune && !showFolderTune && !showSuitTune && (showFlightTune || showTools) && <FlightWorkspace />}
        {!showTune && !showFolderTune && !showSuitTune && !showFlightTune && showJackTune && <TunePanel only={JACK_KEYS} title="jack of all trades" />}
        {!showTune && !showFolderTune && !showSuitTune && !showFlightTune && !showJackTune && showEyeTune && <TunePanel only={EYE_KEYS} title="the eyes" />}
        {!showTune && !showFolderTune && !showSuitTune && !showFlightTune && !showJackTune && !showEyeTune && showTitleTune && <TunePanel only={TITLE_KEYS} title="always bet on daniel w liu" />}
        </>}

        {/* Revealed on keyboard focus; the visible close mark lives on the folder. */}
        <button type="button" className={`casino-file-close ${fileOpen ? 'is-open' : ''}`} onClick={closeFile} aria-label="Close the folder" tabIndex={fileOpen ? 0 : -1}>
          Close
        </button>
        {landed && !jackEditing && !eyeEditing && <div className={`casino-mobile-actions${fileOpen ? ' is-file-open' : ''}`}>
          {!fileOpen && <button type="button" onClick={openFile}>Open folder</button>}
          <a href="/assets/resume.pdf" target="_blank" rel="noopener noreferrer">Read résumé ↗</a>
        </div>}

        {SHOW_COPY && (<>
        <section className={`casino-copy casino-marquee ${inMarquee && landed ? 'is-on' : ''}`}>
          <p className="casino-kicker">The House</p>
          <h1 className="casino-title" style={{ fontFamily: 'KatieRoze' }}>Always bet on<br />Daniel W Liu</h1>
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
