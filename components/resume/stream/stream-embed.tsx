'use client'

import { useEffect, useRef, useState } from 'react'

export type StreamEvent =
  | { type: 'live' }
  | { type: 'intro' }
  | { type: 'fallback'; reason: string }
  | { type: 'navigate'; path: string }

/**
 * The casino rendered on a render server and streamed in, under the real navbar
 * (the stream hides its own copy). It reports what happens (live, the intro
 * started, it can't continue) and takes two commands:
 * `allowIntro` (the page is showing, start the show) and `release` (the page
 * took over with local rendering; give the seat back).
 */
export default function StreamEmbed({ url, ticket, device, allowIntro, release, fading, onEvent }: {
  url: string
  /** the front door's seat ticket for this device */
  ticket: string
  device: string
  allowIntro: boolean
  release: boolean
  /** fade out (the local render underneath takes over) */
  fading: boolean
  onEvent: (e: StreamEvent) => void
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [loaded, setLoaded] = useState(false)
  const origin = new URL(url).origin
  const onEventRef = useRef(onEvent)
  useEffect(() => { onEventRef.current = onEvent }, [onEvent])

  useEffect(() => {
    let live = false
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== origin || e.source !== frame.current?.contentWindow || e.data?.source !== 'pixel-stream') return
      const { type } = e.data as { type: string }
      if (type === 'live') live = true
      if (type === 'live' || type === 'intro') onEventRef.current({ type })
      else if (type === 'fallback') onEventRef.current({ type, reason: String(e.data.reason ?? 'unknown') })
      else if (type === 'navigate') onEventRef.current({ type, path: String(e.data.path) })
    }
    window.addEventListener('message', onMessage)
    // The embed has its own 10 s limit; this covers an iframe that never loads.
    const timer = setTimeout(() => { if (!live) onEventRef.current({ type: 'fallback', reason: 'timeout' }) }, 12_000)
    return () => {
      window.removeEventListener('message', onMessage)
      clearTimeout(timer)
    }
  }, [origin])

  useEffect(() => {
    if (loaded && allowIntro) frame.current?.contentWindow?.postMessage({ source: 'pixel-stream-host', type: 'visible' }, origin)
  }, [loaded, allowIntro, origin])

  useEffect(() => {
    if (release) frame.current?.contentWindow?.postMessage({ source: 'pixel-stream-host', type: 'release' }, origin)
  }, [release, origin])

  return (
    <iframe
      ref={frame}
      src={`${url}/?embed=1&device=${encodeURIComponent(device)}&ticket=${encodeURIComponent(ticket)}`}
      title="Always bet on Daniel W Liu: casino résumé"
      allow="autoplay; fullscreen"
      onLoad={() => setLoaded(true)}
      style={{ opacity: fading ? 0 : 1, transition: 'opacity 450ms ease', zIndex: 9000, pointerEvents: fading ? 'none' : 'auto' }}
      className="fixed inset-0 h-[100dvh] w-screen border-0 bg-black"
    />
  )
}
