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
  // Start with loading if mode is already selected (direct page load)
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
  const readyCheckIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const fallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Cleanup helper
  const cleanupTimers = useCallback(() => {
    if (readyCheckIntervalRef.current) {
      clearInterval(readyCheckIntervalRef.current)
      readyCheckIntervalRef.current = null
    }
    if (fallbackTimeoutRef.current) {
      clearTimeout(fallbackTimeoutRef.current)
      fallbackTimeoutRef.current = null
    }
  }, [])

  const doReveal = useCallback(() => {
    if (revealTriggeredRef.current) return
    revealTriggeredRef.current = true

    cleanupTimers()

    if (revealTimeoutRef.current) {
      clearTimeout(revealTimeoutRef.current)
    }

    // Call the before reveal callback if set (for same-page navigation)
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
  }, [cleanupTimers])

  const signalReady = useCallback(() => {
    pageReadyRef.current = true
  }, [])

  const triggerCover = useCallback(() => {
    cleanupTimers()
    if (revealTimeoutRef.current) {
      clearTimeout(revealTimeoutRef.current)
      revealTimeoutRef.current = null
    }
    setIsNavigating(true)
    pageReadyRef.current = false
    revealTriggeredRef.current = false
    setOverlayState('covering')
  }, [cleanupTimers])

  const checkReadyAndReveal = useCallback(() => {
    if (!pageReadyRef.current) return false

    const elapsed = Date.now() - loadingStartTimeRef.current
    if (elapsed < MIN_LOADING_TIME) {
      // Schedule reveal after minimum time
      setTimeout(doReveal, MIN_LOADING_TIME - elapsed)
      return true
    }

    doReveal()
    return true
  }, [doReveal])

  // Start waiting for page to be ready
  const startWaitingForReady = useCallback(() => {
    cleanupTimers()
    loadingStartTimeRef.current = Date.now()
    revealTriggeredRef.current = false

    // Note: We don't reset pageReadyRef here because child effects run before
    // parent effects in React, so the page may have already signaled ready.
    // pageReadyRef is reset in navigateWithTransition and startNavigation instead.

    // If page already signaled ready (child effect ran first), handle immediately
    if (pageReadyRef.current) {
      const elapsed = Date.now() - loadingStartTimeRef.current
      if (elapsed >= MIN_LOADING_TIME) {
        doReveal()
        return
      }
      // Wait for minimum loading time
      fallbackTimeoutRef.current = setTimeout(doReveal, MIN_LOADING_TIME - elapsed)
      return
    }

    // Check every 50ms if page is ready
    readyCheckIntervalRef.current = setInterval(() => {
      if (checkReadyAndReveal()) {
        cleanupTimers()
      }
    }, 50)

    // Fallback: reveal after max wait time
    fallbackTimeoutRef.current = setTimeout(() => {
      cleanupTimers()
      doReveal()
    }, MIN_LOADING_TIME + 3000)
  }, [checkReadyAndReveal, doReveal, cleanupTimers])

  const navigateWithTransition = useCallback((href: string, onBeforeReveal?: () => void) => {
    cleanupTimers()
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
        // For same-page navigation (like quality selector -> landing),
        // call the callback first to trigger the content change
        if (onBeforeRevealRef.current) {
          onBeforeRevealRef.current()
          onBeforeRevealRef.current = null
        }

        setOverlayState('loading')
        startWaitingForReady()
      } else {
        router.push(href)
      }
    }, NAVIGATION_DELAY)
  }, [pathname, router, startWaitingForReady, cleanupTimers])

  // Initial page load - skip if mode is null (quality selector showing)
  useEffect(() => {
    if (mode === null || overlayState !== 'loading' || isNavigating) return

    startWaitingForReady()

    return () => cleanupTimers()
  }, [mode, overlayState, isNavigating, startWaitingForReady, cleanupTimers])

  // Handle navigation completion (when pathname changes after router.push)
  useEffect(() => {
    if (!isNavigating || pathname === prevPathname.current) return

    prevPathname.current = pathname
    pendingHref.current = null

    setOverlayState('loading')
    startWaitingForReady()

    return () => cleanupTimers()
  }, [pathname, isNavigating, startWaitingForReady, cleanupTimers])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupTimers()
      if (revealTimeoutRef.current) clearTimeout(revealTimeoutRef.current)
    }
  }, [cleanupTimers])

  // Trigger SVG animations
  useEffect(() => {
    if (overlayState === 'covering') triggerSvgAnimations(coverSvgRef.current)
  }, [overlayState])

  useEffect(() => {
    if (overlayState === 'revealing') triggerSvgAnimations(revealSvgRef.current)
  }, [overlayState])

  const startNavigation = useCallback((href: string) => {
    if (isNavigating || href === pathname) return

    cleanupTimers()
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
  }, [isNavigating, pathname, router, cleanupTimers])

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

      {/* Loading overlay - solid white with loading animation */}
      {overlayState === 'loading' && (
        <div className="fixed inset-0 z-[9999] pointer-events-none">
          <div className="relative w-full h-full">
            <Image src="/landing/images/white_paper.png" alt="" fill className="object-cover" priority />
            <LoadingContent />
          </div>
        </div>
      )}

      {/* Cover animation overlay */}
      {overlayState === 'covering' && (
        <div className="fixed inset-0 z-[9999] pointer-events-none">
          <InkMaskSvg svgRef={coverSvgRef} maskType="cover" />
        </div>
      )}

      {/* Reveal animation overlay */}
      {overlayState === 'revealing' && (
        <div className="fixed inset-0 z-[9999] pointer-events-none">
          <InkMaskSvg svgRef={revealSvgRef} maskType="reveal" />
        </div>
      )}
    </TransitionContext.Provider>
  )
}
