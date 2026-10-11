'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { usePerformanceMode } from '@/contexts/performance-mode-context'
import { prefetchCasinoInBackground } from './preload-casino'

const DONE_KEY = 'casino-prefetched'

/**
 * Most visitors reach /resume from another page. While they read that page,
 * fetch the casino's ~3 MB into the cache so /resume starts without waiting on
 * the network. Waits for the page's own intro (8 s visible), an idle moment and
 * the page's videos (see prefetchCasinoInBackground),
 * skips Lite mode, the home page's quality picker and data-saver/2G links, and
 * runs once per session.
 */
export default function CasinoPrefetch() {
  const pathname = usePathname()
  const { mode, isHydrated } = usePerformanceMode()
  // Lite visitors never load the casino; on the home page wait for their pick.
  const eligible = isHydrated && mode !== 'low' && !(pathname === '/' && mode === null)
    && !pathname?.startsWith('/resume') && !pathname?.startsWith('/panel')

  useEffect(() => {
    if (!eligible) return
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
    if (connection?.saveData || /2g/.test(connection?.effectiveType ?? '')) return
    try {
      if (sessionStorage.getItem(DONE_KEY)) return
    } catch {
      return
    }
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let idle: number | undefined
    let started = false
    const start = () => {
      started = true
      try { if (sessionStorage.getItem(DONE_KEY)) return } catch {}
      void prefetchCasinoInBackground(controller.signal).then(() => {
        if (!controller.signal.aborted) try { sessionStorage.setItem(DONE_KEY, '1') } catch {}
      })
    }
    const arm = () => {
      clearTimeout(timer)
      if (started || document.visibilityState !== 'visible') return
      timer = setTimeout(() => {
        if ('requestIdleCallback' in window) idle = requestIdleCallback(start, { timeout: 4000 })
        else start()
      }, 8000)
    }
    arm()
    document.addEventListener('visibilitychange', arm)
    return () => {
      clearTimeout(timer)
      if (idle !== undefined) cancelIdleCallback(idle)
      document.removeEventListener('visibilitychange', arm)
      // Leaving for /resume: its own preload takes over and reuses whatever finished.
      controller.abort()
    }
  }, [eligible])

  return null
}
