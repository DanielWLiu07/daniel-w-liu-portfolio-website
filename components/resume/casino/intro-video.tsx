'use client'

import { preload } from 'react-dom'
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react'
import { useTransitionState } from '@/components/ui/page-transition'
import { preloadCasino } from './preload-casino'
import { INTRO_VIDEO } from './startup-assets'
import { introVideoTake } from './intro-video-choice'
import { holdIntroLook, releaseIntroLook, setIntroPinned, setIntroSkip } from './intro-clock'

export { INTRO_VIDEO }
export { wantsIntroVideo } from './intro-video-choice'

/**
 * Ahead of /resume (behind the transition cover): the poster only. A fetch of
 * the video would not be shared with the element's own range requests while
 * still in flight, so on a slow link it would be downloaded twice at once.
 */
export function warmIntroVideo() {
  preload(introVideoTake().poster, { as: 'image', fetchPriority: 'high' })
}

export interface IntroVideoLocal {
  introHold: boolean
  introAt: number
  hideLoader: boolean
  frameAspect: number | undefined
  renderWidth: number
  onSceneReady: () => void
}

type Phase = 'video' | 'settling' | 'live'

/** frames the scene plays in step behind the video before the cut: every eased actor has caught up */
const FOLLOW_FRAMES = 30
/** and this many of the last ones on time, so the cut never lands on a hitch (shader compiles, decode) */
const STEADY_FRAMES = 12

export default function IntroVideo({ Local }: { Local: ComponentType<Partial<IntroVideoLocal>> }) {
  const { transitionStage, signalReady } = useTransitionState()
  const video = useRef<HTMLVideoElement>(null)
  // chosen once: a window resized mid-video keeps its take (cropped to fit)
  const [take] = useState(introVideoTake)
  const [phase, setPhase] = useState<Phase>('video')
  const [sceneReady, setSceneReady] = useState(false)
  const [ended, setEnded] = useState(false)
  // A video that can't play hands straight to the scene, from the top of the beat.
  const [failed, setFailed] = useState(false)
  const revealed = transitionStage === 'revealing' || transitionStage === 'hidden'
  // The video gets the connection to itself until it is fully buffered (or 6 s,
  // or it fails): on a slow link the scene's ~3 MB would otherwise stall it
  // mid-beat. Holding its last frame while the scene finishes reads far better
  // than a stutter, and a fast link buffers ~2 MB in well under a second.
  const [loadScene, setLoadScene] = useState(false)
  const started = useRef(false)
  const startScene = useCallback(() => {
    if (started.current) return
    started.current = true
    preloadCasino({ afterIntro: true })
    setLoadScene(true)
  }, [])
  // From the HTTP cache the whole file can land before its duration is known,
  // so ask again on every media event until it is.
  const checkBuffered = useCallback((e: { currentTarget: HTMLVideoElement }) => {
    const v = e.currentTarget
    if (v.duration && v.buffered.length && v.buffered.end(v.buffered.length - 1) >= v.duration - 0.1) startScene()
  }, [startScene])
  useEffect(() => {
    const timer = setTimeout(startScene, 6000)
    return () => clearTimeout(timer)
  }, [startScene])

  // The site cover lifts on the video's first frame, not on the scene.
  const onFirstFrame = useCallback(() => signalReady(), [signalReady])
  useEffect(() => {
    const v = video.current
    if (v && v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) signalReady()
  }, [signalReady])
  // before the scene is even requested, so it never draws a frame aimed at the cursor
  useEffect(() => { holdIntroLook(); return releaseIntroLook }, [])
  useEffect(() => {
    if (!failed) return
    releaseIntroLook()
    startScene()
    signalReady()
    setPhase('live')
  }, [failed, signalReady, startScene])

  useEffect(() => {
    const v = video.current
    if (!v || !revealed || phase !== 'video') return
    if (!performance.getEntriesByName('casino:intro-video-start').length) performance.mark('casino:intro-video-start')
    v.play().catch(() => setFailed(true))
  }, [revealed, phase])

  /**
   * The handoff. The scene is released behind the video once the intro-only
   * actors are gone (INTRO_VIDEO.seconds) and it is compiled, and from then on
   * its clock FOLLOWS the video: every frame it draws the beat time the video
   * is showing, so both are in motion and in step. Once it has kept up for a
   * while, on a steady frame, the video is hidden and the scene's clock simply
   * runs on. Nothing pauses, so there is no frozen frame to give the cut away.
   * The video runs on past the intro (the dealer idling) to cover slow scenes;
   * one that is still not ready at its last frame takes over from that frame.
   */
  const [cutAt, setCutAt] = useState(INTRO_VIDEO.seconds)
  const release = useCallback(() => {
    const v = video.current
    if (phase !== 'video' || !sceneReady || !v) return
    if (!v.ended && v.currentTime < INTRO_VIDEO.seconds) return
    const at = Math.min(INTRO_VIDEO.end, v.currentTime)
    setIntroSkip(at)
    setCutAt(at)
    setPhase('settling')
  }, [phase, sceneReady])
  useEffect(() => { release() }, [release, ended])
  useEffect(() => {
    const v = video.current
    if (phase !== 'settling' || !v) return
    // The last presented video frame and when it went on screen (rVFC), or the
    // playback position where that is not supported.
    const shown = { media: v.currentTime, at: performance.now() }
    let live = true, raf = 0, frames = 0, steady = 0, last = 0, interval = 1000 / 60
    const exact = typeof (v as { requestVideoFrameCallback?: unknown }).requestVideoFrameCallback === 'function'
    const onFrame = (_: number, meta: VideoFrameCallbackMetadata) => {
      if (!live) return
      shown.media = meta.mediaTime
      shown.at = meta.expectedDisplayTime
      v.requestVideoFrameCallback(onFrame)
    }
    if (exact) v.requestVideoFrameCallback(onFrame)
    // The beat the video will be showing when this animation frame reaches the screen.
    const beat = () => {
      if (v.paused || v.ended) return Math.min(v.currentTime, INTRO_VIDEO.end)
      if (!exact) return v.currentTime + interval / 1000
      return Math.min(INTRO_VIDEO.end, shown.media + Math.max(0, performance.now() + interval - shown.at) / 1000)
    }
    setIntroPinned(true, beat)
    const tick = (now: number) => {
      if (!live) return
      if (last) {
        const dt = now - last
        interval += (Math.min(dt, 50) - interval) * 0.1
        steady = dt < interval * 1.5 + 2 ? steady + 1 : 0
      }
      last = now
      frames++
      if (frames >= FOLLOW_FRAMES && steady >= STEADY_FRAMES) {
        // In this same frame the scene draws the video's beat and the video goes.
        setIntroSkip(beat())
        setIntroPinned(false)
        v.style.visibility = 'hidden'
        performance.mark('casino:intro-cut')
        setPhase('live')
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { live = false; cancelAnimationFrame(raf) }
  }, [phase])
  useEffect(() => () => setIntroPinned(false), [])

  // The video covers a fixed frame: no scrolling the scene underneath it. Not
  // with overflow: hidden, which would change the page width (scrollbar) at the cut.
  const showing = phase !== 'live'
  useEffect(() => {
    if (!showing) return
    const stop = (e: Event) => e.preventDefault()
    const keys = (e: KeyboardEvent) => { if ([' ', 'PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) e.preventDefault() }
    const top = () => { if (window.scrollY) window.scrollTo(0, 0) }
    top()
    window.addEventListener('wheel', stop, { passive: false })
    window.addEventListener('touchmove', stop, { passive: false })
    window.addEventListener('keydown', keys)
    window.addEventListener('scroll', top)
    return () => {
      window.removeEventListener('wheel', stop)
      window.removeEventListener('touchmove', stop)
      window.removeEventListener('keydown', keys)
      window.removeEventListener('scroll', top)
    }
  }, [showing])

  // The scene keeps the video's crop after the cut, until the window changes shape.
  const [cropped, setCropped] = useState(true)
  useEffect(() => {
    if (showing) return
    const width = window.innerWidth, height = window.innerHeight
    const resized = () => { if (window.innerWidth !== width || window.innerHeight !== height) setCropped(false) }
    window.addEventListener('resize', resized)
    return () => window.removeEventListener('resize', resized)
  }, [showing])

  const onReady = useCallback(() => setSceneReady(true), [])
  return (
    <>
      {loadScene && <Local introHold={phase === 'video'} introAt={failed ? 0 : cutAt} hideLoader={!failed} frameAspect={!failed && cropped ? take.aspect : undefined} renderWidth={take.renderWidth} onSceneReady={onReady} />}
      {showing && (
        <video
          ref={video}
          src={take.src}
          poster={take.poster}
          muted
          playsInline
          preload="auto"
          onLoadedData={onFirstFrame}
          onProgress={checkBuffered}
          onLoadedMetadata={checkBuffered}
          onCanPlayThrough={checkBuffered}
          onTimeUpdate={e => { checkBuffered(e); release() }}
          onEnded={() => setEnded(true)}
          onError={() => setFailed(true)}
          // Opaque to the pointer too: the scene underneath must not be hovered
          // or clicked into a state the video's last frame does not have.
          className="fixed inset-0 w-full h-full object-cover"
          style={{ zIndex: 9999, background: '#232323' }}
        />
      )}
    </>
  )
}
