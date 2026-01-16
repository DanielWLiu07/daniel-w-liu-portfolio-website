'use client'

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { triggerSvgAnimations } from '@/lib/svg-utils'
import { usePerformanceMode } from '@/contexts/performance-mode-context'
import { TransitionContext } from './context'
import { InkMaskSvg } from './ink-mask-svg'
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
  const svgReadyRef = useRef(false)
  const revealTriggeredRef = useRef(false)
  const revealTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const loadingStartTimeRef = useRef<number>(0)
  const coverSvgRef = useRef<SVGSVGElement>(null)
  const revealSvgRef = useRef<SVGSVGElement>(null)
  const onBeforeRevealRef = useRef<(() => void) | null>(null)
  const readyCheckIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const fallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const transitionIdRef = useRef(0) // Unique ID for each transition to prevent stale callbacks

  // Cleanup helper - clears ALL pending timers
  const cleanupTimers = useCallback(() => {
    if (readyCheckIntervalRef.current) {
      clearInterval(readyCheckIntervalRef.current)
      readyCheckIntervalRef.current = null
    }
    if (fallbackTimeoutRef.current) {
      clearTimeout(fallbackTimeoutRef.current)
      fallbackTimeoutRef.current = null
    }
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current)
      navigationTimeoutRef.current = null
    }
  }, [])

  // Called when SVG signals it's ready
  const handleSvgReady = useCallback(() => {
    svgReadyRef.current = true
  }, [])

  const doReveal = useCallback(() => {
    // Guard against multiple reveals in the same transition
    if (revealTriggeredRef.current) return
    revealTriggeredRef.current = true

    // Clean up any pending timers
    cleanupTimers()

    if (revealTimeoutRef.current) {
      clearTimeout(revealTimeoutRef.current)
      revealTimeoutRef.current = null
    }

    // Call the before reveal callback if set (for same-page navigation)
    // NOTE: This should have already been called in navigateWithTransition
    // but we keep it here as a fallback
    if (onBeforeRevealRef.current) {
      onBeforeRevealRef.current()
      onBeforeRevealRef.current = null
    }

    // CRITICAL: Set to 'revealing' state - this MUST show the reveal animation
    setOverlayState('revealing')
    setIsNavigating(false)

    // After the reveal animation duration, hide the overlay
    revealTimeoutRef.current = setTimeout(() => {
      setOverlayState('hidden')
      svgReadyRef.current = false // Reset for next transition
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
    svgReadyRef.current = false
    revealTriggeredRef.current = false
    setOverlayState('covering')
  }, [cleanupTimers])

  const checkReadyAndReveal = useCallback(() => {
    // Wait for BOTH page content AND SVG to be ready
    if (!pageReadyRef.current || !svgReadyRef.current) return false

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

    // If BOTH page and SVG already signaled ready, handle immediately
    if (pageReadyRef.current && svgReadyRef.current) {
      const elapsed = Date.now() - loadingStartTimeRef.current
      if (elapsed >= MIN_LOADING_TIME) {
        doReveal()
        return
      }
      // Wait for minimum loading time
      fallbackTimeoutRef.current = setTimeout(doReveal, MIN_LOADING_TIME - elapsed)
      return
    }

    // Check every 50ms if both page AND SVG are ready
    readyCheckIntervalRef.current = setInterval(() => {
      if (checkReadyAndReveal()) {
        cleanupTimers()
      }
    }, 50)

    // Fallback: reveal after max wait time (even if SVG not ready, CSS fallback handles it)
    fallbackTimeoutRef.current = setTimeout(() => {
      cleanupTimers()
      doReveal()
    }, MIN_LOADING_TIME + 3000)
  }, [checkReadyAndReveal, doReveal, cleanupTimers])

  const navigateWithTransition = useCallback((href: string, onBeforeReveal?: () => void) => {
    // Cancel any pending navigation/timers from previous calls
    cleanupTimers()
    if (revealTimeoutRef.current) {
      clearTimeout(revealTimeoutRef.current)
      revealTimeoutRef.current = null
    }

    // Increment transition ID to invalidate any stale callbacks
    const currentTransitionId = ++transitionIdRef.current

    onBeforeRevealRef.current = onBeforeReveal || null

    setIsNavigating(true)
    pageReadyRef.current = false
    svgReadyRef.current = false
    revealTriggeredRef.current = false
    setOverlayState('covering')

    const isSamePage = href === pathname

    navigationTimeoutRef.current = setTimeout(() => {
      // Check if this is still the current transition (not cancelled by another)
      if (transitionIdRef.current !== currentTransitionId) return

      if (isSamePage) {
        // IMPORTANT: Set overlay to loading FIRST, then call callback
        // This ensures we're ready to receive signalReady() from the page
        setOverlayState('loading')

        // Reset ready state before calling callback
        pageReadyRef.current = false
    svgReadyRef.current = false
        revealTriggeredRef.current = false

        // Now call the callback to trigger content change (e.g., setMode)
        if (onBeforeRevealRef.current) {
          onBeforeRevealRef.current()
          onBeforeRevealRef.current = null
        }

        // Start waiting for the page to signal ready
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

    // CRITICAL: Reset ready state before showing loading
    // The new page will set this to true when it's ready
    pageReadyRef.current = false
    svgReadyRef.current = false
    revealTriggeredRef.current = false

    setOverlayState('loading')
    startWaitingForReady()

    return () => cleanupTimers()
  }, [pathname, isNavigating, startWaitingForReady, cleanupTimers])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupTimers()
      if (revealTimeoutRef.current) {
        clearTimeout(revealTimeoutRef.current)
        revealTimeoutRef.current = null
      }
    }
  }, [cleanupTimers])

  // Trigger SVG animations with aggressive retry to ensure they ALWAYS play
  // useLayoutEffect runs synchronously after DOM mutations, before paint
  const triggerAnimationWithRetry = useCallback((svgRef: React.RefObject<SVGSVGElement | null>) => {
    const tryTrigger = (attempts: number) => {
      if (svgRef.current) {
        triggerSvgAnimations(svgRef.current)
        return
      }

      if (attempts < 10) {
        // Retry with requestAnimationFrame if ref not ready
        requestAnimationFrame(() => tryTrigger(attempts + 1))
      } else {
        // Last resort: try with setTimeout
        setTimeout(() => {
          if (svgRef.current) {
            triggerSvgAnimations(svgRef.current)
          }
        }, 50)
      }
    }

    // Start trying immediately
    tryTrigger(0)
  }, [])

  useLayoutEffect(() => {
    if (overlayState === 'covering') {
      triggerAnimationWithRetry(coverSvgRef)
    }
  }, [overlayState, triggerAnimationWithRetry])

  useLayoutEffect(() => {
    if (overlayState === 'revealing') {
      triggerAnimationWithRetry(revealSvgRef)
    }
  }, [overlayState, triggerAnimationWithRetry])

  const startNavigation = useCallback((href: string) => {
    if (isNavigating || href === pathname) return

    // Cancel any pending navigation/timers
    cleanupTimers()
    if (revealTimeoutRef.current) {
      clearTimeout(revealTimeoutRef.current)
      revealTimeoutRef.current = null
    }

    // Increment transition ID
    const currentTransitionId = ++transitionIdRef.current

    setIsNavigating(true)
    pendingHref.current = href
    pageReadyRef.current = false
    svgReadyRef.current = false
    revealTriggeredRef.current = false
    setOverlayState('covering')

    navigationTimeoutRef.current = setTimeout(() => {
      // Check if this is still the current transition
      if (transitionIdRef.current !== currentTransitionId) return
      router.push(href)
    }, NAVIGATION_DELAY)
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

      {/* Cover animation overlay - stays mounted during covering AND loading to complete animation */}
      {(overlayState === 'covering' || overlayState === 'loading') && (
        <div className="fixed inset-0 z-[9998] pointer-events-none">
          <InkMaskSvg svgRef={coverSvgRef} maskType="cover" triggerAnimation={overlayState === 'covering'} />
        </div>
      )}

      {/* Loading/Reveal overlay - SVG handles everything with mask effect */}
      {(overlayState === 'loading' || overlayState === 'revealing') && (
        <div className="fixed inset-0 z-[9999] pointer-events-none">
          <InkMaskSvg svgRef={revealSvgRef} maskType="reveal" onReady={handleSvgReady} triggerAnimation={overlayState === 'revealing'} />
        </div>
      )}
    </TransitionContext.Provider>
  )
}
