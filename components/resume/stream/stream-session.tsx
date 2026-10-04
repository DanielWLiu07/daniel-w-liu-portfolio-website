'use client'

import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react'
import { useTransitionState } from '@/components/ui/page-transition'
import { canHandOff, deviceId, lastLocalReadyMs, localGraceMs, rememberLocalReadyMs, requestSeat } from './stream-config'
import StreamEmbed, { type StreamEvent } from './stream-embed'

/** What the session tells the local casino: hold at frame 0 until it takes over. */
export interface LocalControl {
  introHold: boolean
  onSceneReady: () => void
}

type Phase = 'asking' | 'streaming' | 'handing-off' | 'local'

const FADE_MS = 450

/**
 * One streamed visit to /resume.
 *
 *   asking ──seat──▶ streaming ──handoff──▶ handing-off ──fade──▶ local
 *      │                 │
 *      └──no seat────────┴──fallback (full, network, server ending…)──▶ local
 *
 * Capable devices warm a local copy underneath from the first moment (held at
 * frame 0). If it is ready before the show starts, it takes over and plays the
 * show itself (the seat was held for seconds); otherwise the visitor stays on the
 * stream (see canHandOff). Weak devices stay streamed and only load the local
 * casino if the stream fails.
 */
export default function StreamSession({ capable, Local }: {
  capable: boolean
  /** the local render: the casino (held/offset by the session), or Lite's video page */
  Local: ComponentType<Partial<LocalControl>>
}) {
  const { transitionStage, navigateWithTransition } = useTransitionState()
  const [phase, setPhase] = useState<Phase>('asking')
  const [url, setUrl] = useState<string | null>(null)
  const [device] = useState(deviceId)
  const [graceOver, setGraceOver] = useState(!capable)
  const [fading, setFading] = useState(false)
  const [released, setReleased] = useState(false)
  // Inputs to the handoff decision; read from callbacks, never during render.
  const s = useRef({ phase: 'asking' as Phase, localReady: false, introStarted: false })
  const arrivedAt = useRef(0)
  const graceTimer = useRef(0)
  useEffect(() => () => clearTimeout(graceTimer.current), [])
  const lastReady = useRef<number | null>(null)
  useEffect(() => {
    arrivedAt.current = performance.now()
    lastReady.current = lastLocalReadyMs() // read before this visit overwrites it
  }, [])

  const enter = useCallback((next: Phase) => {
    s.current.phase = next
    setPhase(next)
  }, [])

  /**
   * Local takes over: it plays the show from the top (after a mid-show failure
   * too: a fresh start beats a broken mid-show scene), the stream fades out and
   * its seat goes back.
   */
  const goLocal = useCallback((why: string) => {
    const st = s.current
    if (st.phase === 'local' || st.phase === 'handing-off') return
    console.info(`[resume] ${why}: rendering locally`)
    if (st.phase !== 'streaming') return enter('local')
    enter('handing-off')
    // Let the local scene draw its first frame at the new moment before revealing it.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setFading(true)
      setTimeout(() => {
        setReleased(true) // the seat goes back to the pool right away…
        setTimeout(() => enter('local'), 100) // …then the faded iframe is removed
      }, FADE_MS)
    }))
  }, [enter])

  const tryHandoff = useCallback(() => {
    const st = s.current
    if (capable && st.phase === 'streaming' && canHandOff(st)) goLocal('local copy ready before the show')
  }, [capable, goLocal])

  // 1. Ask the front door for a seat (a capable device's local copy is already warming).
  useEffect(() => {
    let current = true
    void requestSeat().then((seatUrl) => {
      if (!current || s.current.phase !== 'asking') return
      if (seatUrl) {
        setUrl(seatUrl)
        enter('streaming')
        tryHandoff() // local may already be ready
      } else {
        enter('local')
      }
    })
    return () => { current = false }
  }, [enter, tryHandoff])

  const onSceneReady = useCallback(() => {
    // How long this device's local copy takes, for the next visit's grace (localGraceMs).
    rememberLocalReadyMs(performance.now() - arrivedAt.current)
    const ready = () => {
      s.current.localReady = true
      // Ready before a seat was even assigned: no stream needed at all.
      if (s.current.phase === 'asking') return enter('local')
      tryHandoff()
    }
    // Testing: ?streamLocalDelay=<ms> pretends the local copy is slower than it is.
    const delay = Number(new URLSearchParams(window.location.search).get('streamLocalDelay') ?? 0)
    if (delay > 0) setTimeout(ready, delay)
    else ready()
  }, [enter, tryHandoff])

  const onEvent = useCallback((e: StreamEvent) => {
    const st = s.current
    switch (e.type) {
      case 'live':
        // Give the local copy a moment to win before the stream starts the show,
        // but only when it was fast here before (localGraceMs).
        clearTimeout(graceTimer.current)
        graceTimer.current = window.setTimeout(() => setGraceOver(true), capable ? localGraceMs(lastReady.current, performance.now() - arrivedAt.current) : 0)
        return
      case 'intro':
        st.introStarted = true
        if (capable) console.info('[resume] staying on the stream (local copy not ready before the show)')
        return
      case 'fallback':
        return goLocal(`stream unavailable (${e.reason})`)
      case 'navigate':
        return navigateWithTransition(e.path)
    }
  }, [capable, goLocal, navigateWithTransition])

  // The streamed page can't scroll the local page underneath it.
  const streamShowing = phase === 'streaming' || phase === 'handing-off'
  useEffect(() => {
    if (!streamShowing) return
    const root = document.documentElement
    const before = root.style.overflow
    root.style.overflow = 'hidden'
    return () => { root.style.overflow = before }
  }, [streamShowing])

  const revealed = transitionStage === 'revealing' || transitionStage === 'hidden'
  const mountLocal = capable || phase === 'local'
  return (
    <>
      {mountLocal && <Local introHold={phase === 'asking' || phase === 'streaming'} onSceneReady={onSceneReady} />}
      {url && streamShowing && (
        <StreamEmbed url={url} device={device} allowIntro={revealed && graceOver} release={released} fading={fading} onEvent={onEvent} />
      )}
    </>
  )
}
