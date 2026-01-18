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

  const [overlayState, setOverlayState] = useState<OverlayState>(() =>
    mode === null ? 'hidden' : 'loading'
  )
  const [isNavigating, setIsNavigating] = useState(false)

  // Use ref for initial load tracking to avoid state timing issues
  const isInitialLoadRef = useRef(true)
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
    onIntroStartRef.current = callback
  }, [])

  const doReveal = useCallback(() => {
    if (revealTriggeredRef.current) return
    revealTriggeredRef.current = true

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

    // Skip min time for initial load
    if (isInitialLoadRef.current) {
      doReveal()
      return true
    }

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

    if (pageReadyRef.current) {
      if (isInitialLoadRef.current) {
        doReveal()
        return
      }
      const elapsed = Date.now() - loadingStartTimeRef.current
      if (elapsed >= MIN_LOADING_TIME) {
        doReveal()
        return
      }
      fallbackTimeoutRef.current = setTimeout(doReveal, MIN_LOADING_TIME - elapsed)
      return
    }

    readyCheckIntervalRef.current = setInterval(() => {
      if (checkReadyAndReveal()) {
        cleanupTimers()
      }
    }, 50)

    const fallbackTime = isInitialLoadRef.current ? 3000 : MIN_LOADING_TIME + 3000
    fallbackTimeoutRef.current = setTimeout(() => {
      cleanupTimers()
      doReveal()
    }, fallbackTime)
  }, [checkReadyAndReveal, doReveal, cleanupTimers])

  const navigateWithTransition = useCallback((href: string, onBeforeReveal?: () => void) => {
    cleanupTimers()
    if (revealTimeoutRef.current) {
      clearTimeout(revealTimeoutRef.current)
      revealTimeoutRef.current = null
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
  }, [pathname, router, startWaitingForReady, cleanupTimers])

  // Handle quality selection (mode changing from null to non-null)
  useEffect(() => {
    if (prevModeRef.current === null && mode !== null) {
      if (isInitialLoadRef.current) {
        // First quality selection - mandatory 3s loading to ensure everything is ready
        const INITIAL_LOAD_DELAY = 3000

        const triggerIntros = () => {
          if (onIntroStartRef.current) {
            onIntroStartRef.current()
            onIntroStartRef.current = null
            return true
          }
          return false
        }

        const timeout = setTimeout(() => {
          // After 3s, trigger intros (poll briefly for callback if needed)
          if (triggerIntros()) return

          const interval = setInterval(() => {
            if (triggerIntros()) {
              clearInterval(interval)
            }
          }, 10)

          // Final fallback
          setTimeout(() => clearInterval(interval), 500)
        }, INITIAL_LOAD_DELAY)

        prevModeRef.current = mode
        return () => {
          clearTimeout(timeout)
        }
      } else {
        // Subsequent quality selection - show loading overlay and wait for ready
        pageReadyRef.current = false
        revealTriggeredRef.current = false
        revealAnimationFiredRef.current = false
        setOverlayState('loading')
        startWaitingForReady()
      }
    }
    prevModeRef.current = mode
  }, [mode, startWaitingForReady])

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

  // Trigger cover animation
  useLayoutEffect(() => {
    if (overlayState === 'covering' && !isInitialLoadRef.current && coverSvgRef.current) {
      triggerSvgAnimations(coverSvgRef.current)
    }
  }, [overlayState])

  // Trigger reveal animation and intro
  useLayoutEffect(() => {
    if (overlayState === 'revealing') {
      if (revealAnimationFiredRef.current) return
      revealAnimationFiredRef.current = true

      if (isInitialLoadRef.current) {
        // Initial load: just trigger intros, no SVG
        if (onIntroStartRef.current) {
          onIntroStartRef.current()
          onIntroStartRef.current = null
        }
      } else {
        // Navigation: trigger SVG reveal and intros
        if (revealSvgRef.current) {
          triggerSvgAnimations(revealSvgRef.current)
        }
        if (onIntroStartRef.current) {
          onIntroStartRef.current()
          onIntroStartRef.current = null
        }
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

    const currentTransitionId = ++transitionIdRef.current

    setIsNavigating(true)
    isInitialLoadRef.current = false
    pageReadyRef.current = false
    revealTriggeredRef.current = false
    setOverlayState('covering')

    navigationTimeoutRef.current = setTimeout(() => {
      if (transitionIdRef.current !== currentTransitionId) return
      router.push(href)
    }, NAVIGATION_DELAY)
  }, [isNavigating, pathname, router, cleanupTimers])

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
  const showOverlays = !isInitialLoadRef.current

  return (
    <TransitionContext.Provider value={{ transitionStage: overlayState, signalReady, isRevealed, isInitialLoad: isInitialLoadRef.current, navigateWithTransition, onIntroStart }}>
      {children}

      {/* Cover SVG - only for navigation */}
      {showOverlays && (overlayState === 'covering' || overlayState === 'loading') && (
        <div className="fixed inset-0 z-[9998] pointer-events-none">
          <InkMaskSvg svgRef={coverSvgRef} maskType="cover" triggerAnimation={overlayState === 'covering'} />
        </div>
      )}

      {/* Reveal SVG - only for navigation */}
      {showOverlays && (overlayState === 'loading' || overlayState === 'revealing') && (
        <div className="fixed inset-0 z-[9999] pointer-events-none">
          <InkMaskSvg svgRef={revealSvgRef} maskType="reveal" triggerAnimation={false} />
        </div>
      )}
    </TransitionContext.Provider>
  )
}
