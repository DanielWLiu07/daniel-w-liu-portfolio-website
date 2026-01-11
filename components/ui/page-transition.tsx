'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Image from 'next/image'
import localFont from 'next/font/local'
import { triggerSvgAnimations } from '@/lib/svg-utils'

const fredrick = localFont({
  src: '../../public/fonts/FrederickatheGreat-Regular.ttf',
})

type OverlayState = 'hidden' | 'covering' | 'loading' | 'revealing'

interface TransitionContextType {
  transitionStage: OverlayState
  signalReady: () => void
  isRevealed: boolean
  triggerCover: () => void
  navigateWithTransition: (href: string, onBeforeReveal?: () => void) => void
}

const TransitionContext = createContext<TransitionContextType>({
  transitionStage: 'hidden',
  signalReady: () => {},
  isRevealed: true,
  triggerCover: () => {},
  navigateWithTransition: () => {}
})

export function useTransitionState() {
  return useContext(TransitionContext)
}

const MIN_LOADING_TIME = 250
const REVEAL_DURATION = 3700
const NAVIGATION_DELAY = 930
const ANIMATION_DURATION = '3.5s'
const ANIMATION_KEYSPLINE = '0.2 0.8 0.3 1'

const SPIN_DURATION = 1000

function LoadingContent() {
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    let animationId: number

    const updateRotation = () => {
      if (imgRef.current) {
        const rotation = (Date.now() % SPIN_DURATION) / SPIN_DURATION * 360
        imgRef.current.style.transform = `rotate(${rotation}deg)`
      }
      animationId = requestAnimationFrame(updateRotation)
    }

    animationId = requestAnimationFrame(updateRotation)
    return () => cancelAnimationFrame(animationId)
  }, [])

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Image
          ref={imgRef}
          src="/images/cat_spin.png"
          alt="Loading"
          width={256}
          height={256}
        />
        <p className={`text-5xl md:text-7xl text-center tracking-wider text-stroke-white text-[#2c1810] ${fredrick.className}`}>
          Loading
          <span className="loading-dot-1">.</span>
          <span className="loading-dot-2">.</span>
          <span className="loading-dot-3">.</span>
        </p>
      </div>
    </div>
  )
}

function InkMaskSvg({
  svgRef,
  maskType
}: {
  svgRef: React.RefObject<SVGSVGElement | null>
  maskType: 'cover' | 'reveal'
}) {
  const filterId = maskType === 'cover' ? 'inkNoiseCover' : 'inkNoiseReveal'
  const maskId = maskType === 'cover' ? 'inkMaskCover' : 'inkMaskReveal'
  const baseFill = maskType === 'cover' ? 'black' : 'white'
  const animFill = maskType === 'cover' ? 'white' : 'black'

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      className="absolute inset-0 w-full h-full"
    >
      <defs>
        <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="6" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="200" xChannelSelector="R" yChannelSelector="G">
            <animate
              attributeName="scale"
              values="200;490"
              dur={ANIMATION_DURATION}
              begin="indefinite"
              calcMode="spline"
              keySplines={ANIMATION_KEYSPLINE}
              fill="freeze"
            />
          </feDisplacementMap>
        </filter>
        <mask id={maskId}>
          <rect x="0" y="0" width="100%" height="100%" fill={baseFill} />
          <rect x="50%" y="50%" width="0%" height="0%" fill={animFill} filter={`url(#${filterId})`}>
            <animate attributeName="x" values="50%;-25%" dur={ANIMATION_DURATION} begin="indefinite" calcMode="spline" keySplines={ANIMATION_KEYSPLINE} fill="freeze" />
            <animate attributeName="y" values="50%;-25%" dur={ANIMATION_DURATION} begin="indefinite" calcMode="spline" keySplines={ANIMATION_KEYSPLINE} fill="freeze" />
            <animate attributeName="width" values="0%;150%" dur={ANIMATION_DURATION} begin="indefinite" calcMode="spline" keySplines={ANIMATION_KEYSPLINE} fill="freeze" />
            <animate attributeName="height" values="0%;150%" dur={ANIMATION_DURATION} begin="indefinite" calcMode="spline" keySplines={ANIMATION_KEYSPLINE} fill="freeze" />
          </rect>
        </mask>
      </defs>
      <foreignObject width="100%" height="100%" mask={`url(#${maskId})`}>
        <div className="relative w-full h-full overflow-hidden">
          <Image src="/landing/images/white_paper.png" alt="" fill className="object-cover" priority />
          <LoadingContent />
        </div>
      </foreignObject>
    </svg>
  )
}

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [overlayState, setOverlayState] = useState<OverlayState>('loading')
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
    setIsNavigating(false) // Allow navigation during reveal/intro animations

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

  const navigateWithTransition = useCallback((href: string, onBeforeReveal?: () => void) => {
    if (revealTimeoutRef.current) {
      clearTimeout(revealTimeoutRef.current)
      revealTimeoutRef.current = null
    }

    // Store the callback to be called before reveal
    onBeforeRevealRef.current = onBeforeReveal || null

    setIsNavigating(true)
    pageReadyRef.current = false
    revealTriggeredRef.current = false
    setOverlayState('covering')

    const isSamePage = href === pathname

    setTimeout(() => {
      if (isSamePage) {
        // Same page - manually trigger loading → revealing flow
        loadingStartTimeRef.current = Date.now()
        setOverlayState('loading')

        // Signal ready after a brief moment and reveal
        setTimeout(() => {
          pageReadyRef.current = true
          doReveal()
        }, MIN_LOADING_TIME)
      } else {
        // Different page - let the pathname change trigger the flow
        router.push(href)
      }
    }, NAVIGATION_DELAY)
  }, [pathname, router, doReveal])

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

  // Initial page load
  useEffect(() => {
    if (overlayState !== 'loading' || isNavigating) return

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
  }, [overlayState, isNavigating, doReveal, checkReadyAndReveal])

  // Handle navigation completion
  useEffect(() => {
    if (!isNavigating || pathname === prevPathname.current) return

    prevPathname.current = pathname
    pendingHref.current = null
    pageReadyRef.current = false
    loadingStartTimeRef.current = Date.now()

    setOverlayState('loading')

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
