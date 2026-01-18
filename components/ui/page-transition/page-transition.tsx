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
  const transitionIdRef = useRef(0)
  const revealSvgReadyCallbackRef = useRef<(() => void) | null>(null)
  const onIntroStartRef = useRef<(() => void) | null>(null)

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

  const handleSvgReady = useCallback(() => {
    svgReadyRef.current = true
  }, [])

  const onRevealSvgReady = useCallback((callback: () => void) => {
    // Register callback to be called when reveal animation is triggered
    revealSvgReadyCallbackRef.current = callback
  }, [])

  const onIntroStart = useCallback((callback: () => void) => {
    // Register callback to be called when intro animations should start
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
      svgReadyRef.current = false
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
    if (!pageReadyRef.current || !svgReadyRef.current) return false

    const elapsed = Date.now() - loadingStartTimeRef.current
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

    if (pageReadyRef.current && svgReadyRef.current) {
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

    const currentTransitionId = ++transitionIdRef.current

    onBeforeRevealRef.current = onBeforeReveal || null

    setIsNavigating(true)
    pageReadyRef.current = false
    svgReadyRef.current = false
    revealTriggeredRef.current = false
    setOverlayState('covering')

    const isSamePage = href === pathname

    navigationTimeoutRef.current = setTimeout(() => {
      if (transitionIdRef.current !== currentTransitionId) return

      if (isSamePage) {
        setOverlayState('loading')

        pageReadyRef.current = false
    svgReadyRef.current = false
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

  useEffect(() => {
    if (mode === null || overlayState !== 'loading' || isNavigating) return

    startWaitingForReady()

    return () => cleanupTimers()
  }, [mode, overlayState, isNavigating, startWaitingForReady, cleanupTimers])

  useEffect(() => {
    if (!isNavigating || pathname === prevPathname.current) return

    prevPathname.current = pathname
    pendingHref.current = null

    pageReadyRef.current = false
    svgReadyRef.current = false
    revealTriggeredRef.current = false

    setOverlayState('loading')
    startWaitingForReady()

    return () => cleanupTimers()
  }, [pathname, isNavigating, startWaitingForReady, cleanupTimers])

  useEffect(() => {
    return () => {
      cleanupTimers()
      if (revealTimeoutRef.current) {
        clearTimeout(revealTimeoutRef.current)
        revealTimeoutRef.current = null
      }
    }
  }, [cleanupTimers])

  const triggerAnimationWithRetry = useCallback((svgRef: React.RefObject<SVGSVGElement | null>, label: string, onTriggered?: () => void) => {
    const tryTrigger = (attempts: number) => {
      if (svgRef.current) {
        console.log(`[PageTransition] ${label} - SVG animation triggered (attempt ${attempts})`)
        triggerSvgAnimations(svgRef.current)
        onTriggered?.()
        return
      }

      if (attempts < 10) {
        requestAnimationFrame(() => tryTrigger(attempts + 1))
      } else {
        setTimeout(() => {
          if (svgRef.current) {
            console.log(`[PageTransition] ${label} - SVG animation triggered (fallback)`)
            triggerSvgAnimations(svgRef.current)
            onTriggered?.()
          }
        }, 50)
      }
    }

    tryTrigger(0)
  }, [])

  useLayoutEffect(() => {
    if (overlayState === 'covering') {
      triggerAnimationWithRetry(coverSvgRef, 'COVER')
    }
  }, [overlayState, triggerAnimationWithRetry])

  const revealAnimationFiredRef = useRef(false)

  useLayoutEffect(() => {
    if (overlayState === 'revealing') {
      // Only fire once per transition
      if (revealAnimationFiredRef.current) return
      revealAnimationFiredRef.current = true

      // First: trigger intro animations so GSAP sets initial states
      if (onIntroStartRef.current) {
        onIntroStartRef.current()
        onIntroStartRef.current = null
      }

      // Then: start SVG reveal animation on next frame (after GSAP states are applied)
      requestAnimationFrame(() => {
        triggerAnimationWithRetry(revealSvgRef, 'REVEAL_SVG', () => {
          if (revealSvgReadyCallbackRef.current) {
            revealSvgReadyCallbackRef.current()
            revealSvgReadyCallbackRef.current = null
          }
        })
      })
    } else if (overlayState === 'loading' || overlayState === 'covering') {
      // Reset for next transition
      revealAnimationFiredRef.current = false
    }
  }, [overlayState, triggerAnimationWithRetry])

  const startNavigation = useCallback((href: string) => {
    if (isNavigating || href === pathname) return

    cleanupTimers()
    if (revealTimeoutRef.current) {
      clearTimeout(revealTimeoutRef.current)
      revealTimeoutRef.current = null
    }

    const currentTransitionId = ++transitionIdRef.current

    setIsNavigating(true)
    pendingHref.current = href
    pageReadyRef.current = false
    svgReadyRef.current = false
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

  return (
    <TransitionContext.Provider value={{ transitionStage: overlayState, signalReady, isRevealed, triggerCover, navigateWithTransition, onRevealSvgReady, onIntroStart }}>
      {children}

      {(overlayState === 'covering' || overlayState === 'loading') && (
        <div className="fixed inset-0 z-[9998] pointer-events-none">
          <InkMaskSvg svgRef={coverSvgRef} maskType="cover" triggerAnimation={overlayState === 'covering'} />
        </div>
      )}

      {(overlayState === 'loading' || overlayState === 'revealing') && (
        <div className="fixed inset-0 z-[9999] pointer-events-none">
          <InkMaskSvg svgRef={revealSvgRef} maskType="reveal" onReady={handleSvgReady} triggerAnimation={false} />
        </div>
      )}
    </TransitionContext.Provider>
  )
}
