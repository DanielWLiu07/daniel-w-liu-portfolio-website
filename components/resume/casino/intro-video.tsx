'use client'

import { preload } from 'react-dom'
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react'
import { useTransitionState } from '@/components/ui/page-transition'
import { preloadCasino } from './preload-casino'
import { INTRO_VIDEO } from './startup-assets'
import { holdIntroLook, releaseIntroLook, setIntroPinned, setIntroSkip } from './intro-clock'

export { INTRO_VIDEO }
export { wantsIntroVideo } from './intro-video-choice'

/**
 * Ahead of /resume (behind the transition cover): the poster only. A fetch of
 * the video would not be shared with the element's own range requests while
 * still in flight, so on a slow link it would be downloaded twice at once.
 */
export function warmIntroVideo() {
  preload(INTRO_VIDEO.poster, { as: 'image', fetchPriority: 'high' })
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

/** release the scene (pinned) this long before the frame it cuts on, so it is settled by then */
const SETTLE_S = 1
/** frames the pinned scene draws before the cut: every eased actor has arrived */
const SETTLE_FRAMES = 45

export default function IntroVideo({ Local }: { Local: ComponentType<Partial<IntroVideoLocal>> }) {
  const { transitionStage, signalReady } = useTransitionState()
  const video = useRef<HTMLVideoElement>(null)
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
   * The handoff. The video runs on past the intro (the dealer idling), so the
   * cut can land on whichever frame the scene is ready for, from the end of
   * the intro (INTRO_VIDEO.seconds) to the last frame (INTRO_VIDEO.end):
   *
   * 1. Once the scene is compiled, pick the cut frame about a second ahead and
   *    release the scene PINNED at that beat time, behind the video, so every
   *    eased actor settles exactly where the capture has it.
   * 2. When the video presents that frame, pause it there (and pin the scene
   *    to the exact frame time it stopped on).
   * 3. In one animation frame the scene's clock runs on from there and the
   *    video is hidden. The two pictures match, so there is nothing to see.
   */
  const [cutAt, setCutAt] = useState(INTRO_VIDEO.seconds)
  const release = useCallback(() => {
    const v = video.current
    if (phase !== 'video' || !sceneReady || !v) return
    if (!v.ended && v.currentTime < INTRO_VIDEO.seconds - SETTLE_S) return
    const frame = Math.ceil((v.ended ? INTRO_VIDEO.end : v.currentTime + SETTLE_S) * INTRO_VIDEO.fps) / INTRO_VIDEO.fps
    const at = Math.min(INTRO_VIDEO.end, Math.max(INTRO_VIDEO.seconds, frame))
    setIntroSkip(at)
    setIntroPinned(true)
    setCutAt(at)
    setPhase('settling')
  }, [phase, sceneReady])
  useEffect(() => { release() }, [release, ended])
  useEffect(() => {
    const v = video.current
    if (phase !== 'settling' || !v) return
    let frames = 0, raf = 0, held = v.ended || v.paused, live = true
    const hold = (mediaTime: number) => {
      v.pause()
      setIntroSkip(mediaTime) // the frame it actually stopped on
      held = true
    }
    const near = (t: number) => t >= cutAt - 0.5 / INTRO_VIDEO.fps
    if (held) setIntroSkip(Math.min(cutAt, Math.round(v.currentTime * INTRO_VIDEO.fps) / INTRO_VIDEO.fps))
    // the exact presented frame where supported, else the playback position each frame
    const onFrame = (_: number, meta: VideoFrameCallbackMetadata) => {
      if (!live || held) return
      if (near(meta.mediaTime)) hold(meta.mediaTime)
      else v.requestVideoFrameCallback(onFrame)
    }
    const exact = typeof (v as { requestVideoFrameCallback?: unknown }).requestVideoFrameCallback === 'function'
    if (exact && !held) v.requestVideoFrameCallback(onFrame)
    const tick = () => {
      frames++
      if (!held && (v.ended || (!exact && near(v.currentTime)))) hold(Math.min(cutAt, v.currentTime))
      if (held && frames >= SETTLE_FRAMES) {
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
  }, [phase, cutAt])
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
      {loadScene && <Local introHold={phase === 'video'} introAt={failed ? 0 : cutAt} hideLoader={!failed} frameAspect={!failed && cropped ? INTRO_VIDEO.aspect : undefined} renderWidth={INTRO_VIDEO.renderWidth} onSceneReady={onReady} />}
      {showing && (
        <video
          ref={video}
          src={INTRO_VIDEO.src}
          poster={INTRO_VIDEO.poster}
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
