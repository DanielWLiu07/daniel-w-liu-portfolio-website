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
  const { mode, isHydrated, isLowPerformance } = usePerformanceMode()

  // Start as 'hidden' — no loading screen flash on fresh visits (mode === null)
  // Switch to 'loading' only when mode is already set (returning user with localStorage)
  const [overlayState, setOverlayState] = useState<OverlayState>('hidden')

  // Handle context hydration - determine correct initial state after mode is resolved
  // This only affects INITIAL page load, not subsequent navigation
  useEffect(() => {
    if (!isHydrated) return
    if (!isInitialLoadRef.current) return
    // Instant mode: stay 'hidden', skip loading overlay entirely
    if (isLowPerformance) {
      isInitialLoadRef.current = false
      // Fire registered intro callback on next tick after page mounts
      Promise.resolve().then(() => {
        if (onIntroStartRef.current) {
          onIntroStartRef.current()
          onIntroStartRef.current = null
        }
      })
      return
    }
    if (mode !== null) {
      setOverlayState('loading')
    }
  }, [isHydrated, mode, isLowPerformance])
  const [isNavigating, setIsNavigating] = useState(false)

  // Use ref for initial load tracking to avoid state timing issues
  const isInitialLoadRef = useRef(true)
  const isFirstQualitySelectionRef = useRef(true)
  const windowLoadedRef = useRef(typeof document !== 'undefined' && document.readyState === 'complete')
  const prevModeRef = useRef(mode)
  const prevPathname = useRef(pathname)
  const pageReadyRef = useRef(false)
  const revealTriggeredRef = useRef(false)
  const revealTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const loadingStartTimeRef = useRef<number>(0)
  const coverSvgRef = useRef<SVGSVGElement>(null)
  const revealSvgRef = useRef<SVGSVGElement>(null)
  const onBeforeRevealRef = useRef<(() => void) | null>(null)
  const readyCheckIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const fallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const transitionIdRef = useRef(0)
  const onIntroStartRef = useRef<(() => void) | null>(null)
  const revealAnimationFiredRef = useRef(false)

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

  const onIntroStart = useCallback((callback: () => void) => {
    // Instant mode: fire immediately, no transition gate to wait for
    if (isLowPerformance) {
      callback()
      return
    }
    onIntroStartRef.current = callback
  }, [isLowPerformance])

  const doReveal = useCallback(() => {
    if (revealTriggeredRef.current) return
    revealTriggeredRef.current = true

    // Mark first quality selection as done
    isFirstQualitySelectionRef.current = false

    cleanupTimers()

    if (revealTimeoutRef.current) {
      clearTimeout(revealTimeoutRef.current)
      revealTimeoutRef.current = null
    }

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

  const checkReadyAndReveal = useCallback(() => {
    if (!pageReadyRef.current) return false

    const elapsed = Date.now() - loadingStartTimeRef.current

    // Skip min time for initial load (mode already set from localStorage)
    if (isInitialLoadRef.current) {
      doReveal()
      return true
    }

    // First quality selection: wait for browser to finish loading (no more spinning favicon)
    if (isFirstQualitySelectionRef.current) {
      if (!windowLoadedRef.current) {
        return false // Keep polling until browser finishes loading
      }
      // Browser loaded, now just ensure minimum time has passed
      if (elapsed < MIN_LOADING_TIME) {
        setTimeout(doReveal, MIN_LOADING_TIME - elapsed)
        return true
      }
      doReveal()
      return true
    }

    // Subsequent navigations: just use MIN_LOADING_TIME
    if (elapsed < MIN_LOADING_TIME) {
      setTimeout(doReveal, MIN_LOADING_TIME - elapsed)
      return true
    }

    doReveal()
    return true
  }, [doReveal])

  const startWaitingForReady = useCallback(() => {
    cleanupTimers()
    loadingStartTimeRef.current = Date.now()
    revealTriggeredRef.current = false

    // For initial load (mode from localStorage), reveal immediately when ready
    if (isInitialLoadRef.current && pageReadyRef.current) {
      doReveal()
      return
    }

    // For first quality selection: wait for both page ready AND browser load
    // For subsequent: just use MIN_LOADING_TIME
    if (pageReadyRef.current && !isFirstQualitySelectionRef.current) {
      const elapsed = Date.now() - loadingStartTimeRef.current
      if (elapsed >= MIN_LOADING_TIME) {
        doReveal()
        return
      }
      fallbackTimeoutRef.current = setTimeout(doReveal, MIN_LOADING_TIME - elapsed)
      return
    }

    // Poll for ready state - no fallback timeout, wait until page signals ready
    readyCheckIntervalRef.current = setInterval(() => {
      if (checkReadyAndReveal()) {
        cleanupTimers()
      }
    }, 50)
  }, [checkReadyAndReveal, doReveal, cleanupTimers])

  const navigateWithTransition = useCallback((href: string, onBeforeReveal?: () => void) => {
    cleanupTimers()
    if (revealTimeoutRef.current) {
      clearTimeout(revealTimeoutRef.current)
      revealTimeoutRef.current = null
    }

    // Instant mode: skip all transition states, navigate immediately
    if (isLowPerformance) {
      isInitialLoadRef.current = false
      isFirstQualitySelectionRef.current = false
      if (onBeforeReveal) onBeforeReveal()
      const isSamePage = href === pathname
      if (!isSamePage) {
        // Pre-update prevPathname so the Navigation useEffect doesn't misfire
        // on a later Animated navigation (it would otherwise see a stale
        // mismatch between prevPathname and the current pathname and trigger
        // a premature loading state before NAVIGATION_DELAY completes).
        prevPathname.current = href
        router.push(href)
      }
      // Fire intro animations on next tick after new page mounts
      Promise.resolve().then(() => {
        if (onIntroStartRef.current) {
          onIntroStartRef.current()
          onIntroStartRef.current = null
        }
      })
      return
    }

    const currentTransitionId = ++transitionIdRef.current

    onBeforeRevealRef.current = onBeforeReveal || null

    setIsNavigating(true)
    isInitialLoadRef.current = false
    pageReadyRef.current = false
    revealTriggeredRef.current = false
    setOverlayState('covering')

    const isSamePage = href === pathname

    navigationTimeoutRef.current = setTimeout(() => {
      if (transitionIdRef.current !== currentTransitionId) return

      if (isSamePage) {
        setOverlayState('loading')
        pageReadyRef.current = false
        revealTriggeredRef.current = false

        if (onBeforeRevealRef.current) {
          onBeforeRevealRef.current()
          onBeforeRevealRef.current = null
        }

        startWaitingForReady()
      } else {
        router.push(href)
      }
    }, NAVIGATION_DELAY)
  }, [pathname, router, startWaitingForReady, cleanupTimers, isLowPerformance])

  // Track mode changes
  useEffect(() => {
    prevModeRef.current = mode
  }, [mode])

  // Track when browser finishes loading (spinning favicon stops)
  useEffect(() => {
    if (windowLoadedRef.current) return

    const handleLoad = () => {
      windowLoadedRef.current = true
    }

    if (document.readyState === 'complete') {
      windowLoadedRef.current = true
      return
    }

    window.addEventListener('load', handleLoad)
    return () => window.removeEventListener('load', handleLoad)
  }, [])

  // Initial page load only: when mode is already set from localStorage
  useEffect(() => {
    if (!isInitialLoadRef.current) return
    if (mode === null || overlayState !== 'loading' || isNavigating) return

    startWaitingForReady()
    return () => cleanupTimers()
  }, [mode, overlayState, isNavigating, startWaitingForReady, cleanupTimers])

  // Navigation: when pathname changes, start loading
  useEffect(() => {
    if (!isNavigating || pathname === prevPathname.current) return

    prevPathname.current = pathname
    pageReadyRef.current = false
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

  // Trigger cover animation with robust retry logic
  useLayoutEffect(() => {
    if (overlayState === 'covering' && !isInitialLoadRef.current) {
      const delays = [0, 16, 32, 50, 100, 150, 200, 300]
      let animationStarted = false
      const timeouts: NodeJS.Timeout[] = []

      delays.forEach((delay) => {
        const timeout = setTimeout(() => {
          if (animationStarted) return
          if (coverSvgRef.current) {
            const success = triggerSvgAnimations(coverSvgRef.current)
            if (success) {
              animationStarted = true
              timeouts.forEach(t => clearTimeout(t))
            }
          }
        }, delay)
        timeouts.push(timeout)
      })
    }
  }, [overlayState])

  // Trigger reveal animation and intro when revealing
  useLayoutEffect(() => {
    if (overlayState === 'revealing') {
      if (revealAnimationFiredRef.current) return
      revealAnimationFiredRef.current = true

      // Trigger SVG reveal animation with robust retry logic
      // Retry until animations are actually triggered (not just until ref is set)
      const delays = [0, 16, 32, 50, 100, 150, 200, 300, 400, 500]
      let animationStarted = false
      const timeouts: NodeJS.Timeout[] = []

      delays.forEach((delay) => {
        const timeout = setTimeout(() => {
          if (animationStarted) return
          if (revealSvgRef.current) {
            const success = triggerSvgAnimations(revealSvgRef.current)
            if (success) {
              animationStarted = true
              timeouts.forEach(t => clearTimeout(t))
            }
          }
        }, delay)
        timeouts.push(timeout)
      })

      // Trigger intro animations
      if (onIntroStartRef.current) {
        onIntroStartRef.current()
        onIntroStartRef.current = null
      }
    } else if (overlayState === 'loading' || overlayState === 'covering') {
      revealAnimationFiredRef.current = false
    }
  }, [overlayState])

  // Handle link clicks for navigation
  const startNavigation = useCallback((href: string) => {
    if (isNavigating || href === pathname) return

    cleanupTimers()
    if (revealTimeoutRef.current) {
      clearTimeout(revealTimeoutRef.current)
      revealTimeoutRef.current = null
    }

    // Instant mode: skip all overlays, push immediately
    if (isLowPerformance) {
      isInitialLoadRef.current = false
      // Pre-update prevPathname so the Navigation useEffect doesn't misfire
      // on a later Animated navigation.
      prevPathname.current = href
      router.push(href)
      Promise.resolve().then(() => {
        if (onIntroStartRef.current) {
          onIntroStartRef.current()
          onIntroStartRef.current = null
        }
      })
      return
    }

    const currentTransitionId = ++transitionIdRef.current

    setIsNavigating(true)
    isInitialLoadRef.current = false
    pageReadyRef.current = false
    revealTriggeredRef.current = false
    setOverlayState('covering')

    router.prefetch(href)

    navigationTimeoutRef.current = setTimeout(() => {
      if (transitionIdRef.current !== currentTransitionId) return
      router.push(href)
    }, NAVIGATION_DELAY)
  }, [isNavigating, pathname, router, cleanupTimers, isLowPerformance])

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
  // Show overlays for navigation OR for initial load when mode is already set (page reload)
  // Only show after context hydration to avoid SSR mismatch
  // Instant mode: never show overlays
  const showOverlays = isHydrated && !isLowPerformance && (!isInitialLoadRef.current || mode !== null)

  return (
    <TransitionContext.Provider value={{ transitionStage: overlayState, signalReady, isRevealed, isInitialLoad: isInitialLoadRef.current, navigateWithTransition, onIntroStart }}>
      {children}

      {/* Cover SVG - only for navigation */}
      {showOverlays && (overlayState === 'covering' || overlayState === 'loading') && (
        <div className="fixed inset-0 z-[10001] pointer-events-none">
          <InkMaskSvg svgRef={coverSvgRef} maskType="cover" triggerAnimation={overlayState === 'covering'} />
        </div>
      )}

      {/* Reveal SVG - only for navigation */}
      {showOverlays && (overlayState === 'loading' || overlayState === 'revealing') && (
        <div className="fixed inset-0 z-[10002] pointer-events-none">
          <InkMaskSvg svgRef={revealSvgRef} maskType="reveal" triggerAnimation={overlayState === 'revealing'} />
        </div>
      )}
    </TransitionContext.Provider>
  )
}
