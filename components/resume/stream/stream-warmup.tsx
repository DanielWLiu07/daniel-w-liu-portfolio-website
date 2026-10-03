'use client'

import { useEffect } from 'react'
import { STREAM_MODE } from './stream-config'

/**
 * Wake a render server early: once a real visitor (JavaScript running, page
 * visible for 5 s, so not a crawler or link preview) is anywhere on the site,
 * ask the front door to make sure seats are warming. A server takes ~1–2 min to
 * wake, which is about how long people take to reach /resume. Once per session.
 */
export default function StreamWarmup() {
  useEffect(() => {
    if (STREAM_MODE === 'off') return
    try {
      if (sessionStorage.getItem('ps-woke')) return
    } catch {
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const arm = () => {
      clearTimeout(timer)
      if (document.visibilityState !== 'visible') return
      timer = setTimeout(() => {
        try { sessionStorage.setItem('ps-woke', '1') } catch {}
        void fetch('/api/stream/seat?wake=1', { cache: 'no-store', keepalive: true }).catch(() => {})
      }, 5000)
    }
    arm()
    document.addEventListener('visibilitychange', arm)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', arm)
    }
  }, [])
  return null
}
