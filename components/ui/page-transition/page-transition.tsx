'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Image from 'next/image'
import { triggerSvgAnimations } from '@/lib/svg-utils'
import { usePerformanceMode } from '@/contexts/performance-mode-context'
import { TransitionContext } from './context'
import { InkMaskSvg } from './ink-mask-svg'
import { LoadingContent } from './loading-content'
import { MIN_LOADING_TIME, REVEAL_DURATION, NAVIGATION_DELAY } from './constants'
import type { OverlayState } from './types'

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { mode } = usePerformanceMode()

  // Start hidden if quality selector should show (mode === null)
  // Start with loading if mode is already selected
  const [overlayState, setOverlayState] = useState<OverlayState>(() =>
    mode === null ? 'hidden' : 'loading'
  )
  const [isNavigating, setIsNavigating] = useState(false)

  const prevPathname = useRef(pathname)
  const pendingHref = useRef<string | null>(null)
  const pageReadyRef = useRef(false)
  const revealTriggeredRef = useRef(false)
  const revealTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const loadingStartTimeRef = useRef<number>(0)
  const coverSvgRef = useRef<SVGSVGElement>(null)
  const revealSvgRef = useRef<SVGSVGElement>(null)
  const onBeforeRevealRef = useRef<(() => void) | null>(null)

  const doReveal = useCallback(() => {
    if (revealTriggeredRef.current) return
    revealTriggeredRef.current = true

    if (revealTimeoutRef.current) {
      clearTimeout(revealTimeoutRef.current)
    }

    // Call the before reveal callback if set
    if (onBeforeRevealRef.current) {
      onBeforeRevealRef.current()
      onBeforeRevealRef.current = null
    }

    setOverlayState('revealing')
    setIsNavigating(false)

    revealTimeoutRef.current = setTimeout(() => {
      setOverlayState('hidden')
      revealTimeoutRef.current = null
    }, REVEAL_DURATION)
  }, [])

  const signalReady = useCallback(() => {
    pageReadyRef.current = true
  }, [])

  const triggerCover = useCallback(() => {
    if (revealTimeoutRef.current) {
      clearTimeout(revealTimeoutRef.current)
      revealTimeoutRef.current = null
    }
    setIsNavigating(true)
    pageReadyRef.current = false
    revealTriggeredRef.current = false
    setOverlayState('covering')
  }, [])

  const checkReadyAndReveal = useCallback(() => {
    if (!pageReadyRef.current) return false

    const elapsed = Date.now() - loadingStartTimeRef.current
    if (elapsed < MIN_LOADING_TIME) {
      setTimeout(doReveal, MIN_LOADING_TIME - elapsed)
      return true
    }

    doReveal()
    return true
  }, [doReveal])

  const navigateWithTransition = useCallback((href: string, onBeforeReveal?: () => void) => {
    if (revealTimeoutRef.current) {
      clearTimeout(revealTimeoutRef.current)
      revealTimeoutRef.current = null
    }

    onBeforeRevealRef.current = onBeforeReveal || null

    setIsNavigating(true)
    pageReadyRef.current = false
    revealTriggeredRef.current = false
    setOverlayState('covering')

    const isSamePage = href === pathname

    setTimeout(() => {
      if (isSamePage) {
        // For same-page navigation with callback (like quality selector),
        // call the callback first to trigger content change, then wait for ready
        if (onBeforeRevealRef.current) {
          onBeforeRevealRef.current()
          onBeforeRevealRef.current = null
        }

        loadingStartTimeRef.current = Date.now()
        pageReadyRef.current = false // Reset since content changed
        setOverlayState('loading')

        // Wait for page to signal ready, same as other navigations
        const interval = setInterval(() => {
          if (checkReadyAndReveal()) clearInterval(interval)
        }, 50)

        // Fallback timeout
        setTimeout(() => {
          clearInterval(interval)
          doReveal()
        }, MIN_LOADING_TIME + 2000)
      } else {
        router.push(href)
      }
    }, NAVIGATION_DELAY)
  }, [pathname, router, doReveal, checkReadyAndReveal])

  // Initial page load - skip if mode is null (quality selector showing)
  useEffect(() => {
    if (mode === null || overlayState !== 'loading' || isNavigating) return

    loadingStartTimeRef.current = Date.now()

    const interval = setInterval(() => {
      if (checkReadyAndReveal()) clearInterval(interval)
    }, 50)

    const timeout = setTimeout(() => {
      clearInterval(interval)
      doReveal()
    }, MIN_LOADING_TIME + 2000)

    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [mode, overlayState, isNavigating, doReveal, checkReadyAndReveal])

  // Handle navigation completion
  useEffect(() => {
    if (!isNavigating || pathname === prevPathname.current) return

    prevPathname.current = pathname
    pendingHref.current = null
    pageReadyRef.current = false
    loadingStartTimeRef.current = Date.now()

    const stateTimer = setTimeout(() => setOverlayState('loading'), 0)

    const interval = setInterval(() => {
      if (checkReadyAndReveal()) clearInterval(interval)
    }, 50)

    const timeout = setTimeout(() => {
      clearInterval(interval)
      doReveal()
    }, MIN_LOADING_TIME + 2000)

    return () => {
      clearTimeout(stateTimer)
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [pathname, isNavigating, doReveal, checkReadyAndReveal])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (revealTimeoutRef.current) clearTimeout(revealTimeoutRef.current)
    }
  }, [])

  // Trigger SVG animations
  useEffect(() => {
    if (overlayState === 'covering') triggerSvgAnimations(coverSvgRef.current)
  }, [overlayState])

  useEffect(() => {
    if (overlayState === 'revealing') triggerSvgAnimations(revealSvgRef.current)
  }, [overlayState])

  const startNavigation = useCallback((href: string) => {
    if (isNavigating || href === pathname) return

    if (revealTimeoutRef.current) {
      clearTimeout(revealTimeoutRef.current)
      revealTimeoutRef.current = null
    }

    setIsNavigating(true)
    pendingHref.current = href
    pageReadyRef.current = false
    revealTriggeredRef.current = false
    setOverlayState('covering')

    setTimeout(() => router.push(href), NAVIGATION_DELAY)
  }, [isNavigating, pathname, router])

  // Global link click interceptor
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest('a')
      if (!link) return

      const href = link.getAttribute('href')
      if (!href || href.startsWith('http') || href.startsWith('#') || href === pathname) {
        return
      }

      e.preventDefault()
      e.stopPropagation()
      startNavigation(href)
    }

    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [pathname, startNavigation])

  const isRevealed = overlayState === 'hidden'

  return (
    <TransitionContext.Provider value={{ transitionStage: overlayState, signalReady, isRevealed, triggerCover, navigateWithTransition }}>
      {children}

      {overlayState === 'loading' && (
        <div className="fixed inset-0 z-[9999] pointer-events-none">
          <div className="relative w-full h-full">
            <Image src="/landing/images/white_paper.png" alt="" fill className="object-cover" priority />
            <LoadingContent />
          </div>
        </div>
      )}

      {overlayState === 'covering' && (
        <div className="fixed inset-0 z-[9999] pointer-events-none">
          <InkMaskSvg svgRef={coverSvgRef} maskType="cover" />
        </div>
      )}

      {overlayState === 'revealing' && (
        <div className="fixed inset-0 z-[9999] pointer-events-none">
          <InkMaskSvg svgRef={revealSvgRef} maskType="reveal" />
        </div>
      )}
    </TransitionContext.Provider>
  )
}
