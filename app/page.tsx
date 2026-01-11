'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import gsap from 'gsap'
import localFont from 'next/font/local'
import Image from 'next/image'
import { SocialLinks } from '@/components/ui/social-links'
import { useBodyOverflow } from '@/hooks/use-body-overflow'
import { usePerformanceMode } from '@/contexts/performance-mode-context'
import { ModeSelector } from '@/components/ui/mode-selector'
import { useMobile } from '@/hooks/use-mobile'
import { LoadingScreen } from '@/components/ui/loading-screen'
import { useTransitionState } from '@/components/ui/page-transition'

const weddingDay = localFont({
  src: '../public/shared/fonts/weddingday-font/ancient-wedding-font/AncientWeddingDemoRegular-MAm1n.ttf',
})

const FALLBACK_TIMEOUT = 1500
const ANIMATION_KEYSPLINE = '0.2 0.8 0.3 1'

function InkMaskSvg({
  svgMaskRef,
  maskX,
  maskWidth
}: {
  svgMaskRef: React.RefObject<SVGAnimateElement | null>
  maskX: string
  maskWidth: string
}) {
  return (
    <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" className="absolute inset-0 w-full h-full z-[51]">
      <defs>
        <filter id="bgFilter">
          <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="6" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G">
            <animate
              ref={svgMaskRef}
              attributeName="scale"
              values="200;490"
              dur="3s"
              begin="indefinite"
              calcMode="spline"
              keySplines={ANIMATION_KEYSPLINE}
              fill="freeze"
            />
          </feDisplacementMap>
        </filter>
        <mask id="bgMask">
          <rect x="0" y="0" width="100%" height="100%" fill="white" />
          <rect x="50%" y="50%" width="0%" height="0%" fill="black" filter="url(#bgFilter)">
            <animate attributeName="x" values={`50%;${maskX}`} dur="3s" begin="indefinite" calcMode="spline" keySplines={ANIMATION_KEYSPLINE} fill="freeze" />
            <animate attributeName="y" values="50%;4%" dur="3s" begin="indefinite" calcMode="spline" keySplines={ANIMATION_KEYSPLINE} fill="freeze" />
            <animate attributeName="width" values={`0%;${maskWidth}`} dur="3s" begin="indefinite" calcMode="spline" keySplines={ANIMATION_KEYSPLINE} fill="freeze" />
            <animate attributeName="height" values="0%;95%" dur="3s" begin="indefinite" calcMode="spline" keySplines={ANIMATION_KEYSPLINE} fill="freeze" />
          </rect>
        </mask>
      </defs>
      <foreignObject width="100%" height="100%" mask="url(#bgMask)">
        <div className="relative w-full h-full overflow-hidden">
          <Image src="/landing/images/white_paper.png" alt="" fill className="object-cover" priority />
        </div>
      </foreignObject>
    </svg>
  )
}

function TreeOverlays({
  isLowPerformance,
  treeRightRef,
  treeLeftRef
}: {
  isLowPerformance: boolean
  treeRightRef: React.RefObject<HTMLVideoElement | null>
  treeLeftRef: React.RefObject<HTMLVideoElement | null>
}) {
  const baseClasses = 'fixed inset-0 overflow-hidden pointer-events-none will-change-transform'

  if (isLowPerformance) {
    return (
      <>
        <div className={`${baseClasses} z-[65]`}>
          <Image src="/animation_frames/landing/tree_right0200.png" alt="" width={1920} height={1080} className="tree-right absolute top-0 right-0 h-screen w-auto object-cover object-top will-change-transform" />
        </div>
        <div className={`${baseClasses} z-[60]`}>
          <Image src="/animation_frames/landing/tree_left0200.png" alt="" width={1920} height={1080} className="tree-left absolute top-0 left-0 h-screen w-auto object-cover object-top will-change-transform" />
        </div>
      </>
    )
  }

  return (
    <>
      <div className={`${baseClasses} z-[65]`}>
        <video ref={treeRightRef} className="tree-right absolute top-0 right-0 h-screen w-auto object-cover object-top will-change-transform" src="/landing/videos/tree_right.webm" autoPlay loop muted playsInline preload="auto" />
      </div>
      <div className={`${baseClasses} z-[60]`}>
        <video ref={treeLeftRef} className="tree-left absolute top-0 left-0 h-screen w-auto object-cover object-top will-change-transform" src="/landing/videos/tree_left.webm" autoPlay loop muted playsInline preload="auto" />
      </div>
    </>
  )
}

export default function Home() {
  const [isLoaded, setIsLoaded] = useState(false)
  const [startMaskAnimation, setStartMaskAnimation] = useState(false)
  const [animationsReady, setAnimationsReady] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const svgMaskRef = useRef<SVGAnimateElement>(null)
  const compositeVideoRef = useRef<HTMLVideoElement>(null)
  const treeRightRef = useRef<HTMLVideoElement>(null)
  const treeLeftRef = useRef<HTMLVideoElement>(null)
  const loadedCalledRef = useRef(false)
  const hasResetRef = useRef(false)

  const { mode, isLowPerformance, resetMode } = usePerformanceMode()
  const isMobile = useMobile(768)
  const { signalReady, transitionStage } = useTransitionState()

  useBodyOverflow('hidden')

  const maskWidth = isMobile ? '95%' : '87%'
  const maskX = isMobile ? '2.5%' : '6.5%'

  const handleAssetLoad = useCallback(() => {
    if (loadedCalledRef.current) return
    loadedCalledRef.current = true
    signalReady()
    setTimeout(() => {
      setAnimationsReady(true)
      setIsLoaded(true)
    }, 50)
  }, [signalReady])

  // Reset mode on navigation back to home
  useEffect(() => {
    if (!hasResetRef.current && (transitionStage === 'loading' || transitionStage === 'revealing') && mode !== null) {
      hasResetRef.current = true
      resetMode()
    }
  }, [transitionStage, mode, resetMode])

  // Reset state when mode changes
  useEffect(() => {
    setIsLoaded(false)
    setStartMaskAnimation(false)
    setAnimationsReady(false)
    loadedCalledRef.current = false
  }, [mode])

  // Wait for video ready
  useEffect(() => {
    if (mode === null) return

    if (isLowPerformance) {
      handleAssetLoad()
      return
    }

    const composite = compositeVideoRef.current
    if (!composite) return

    if (composite.readyState >= 3) {
      handleAssetLoad()
      return
    }

    const onReady = () => handleAssetLoad()
    composite.addEventListener('canplay', onReady)
    composite.addEventListener('loadeddata', onReady)

    const timeout = setTimeout(handleAssetLoad, FALLBACK_TIMEOUT)

    return () => {
      composite.removeEventListener('canplay', onReady)
      composite.removeEventListener('loadeddata', onReady)
      clearTimeout(timeout)
    }
  }, [mode, isLowPerformance, handleAssetLoad])

  // Run intro animations
  useEffect(() => {
    if (!isLoaded || !animationsReady || mode === null) return

    const ctx = gsap.context(() => {
      gsap.set('.name-container', { y: '-100vh', scale: 1.8, opacity: 0 })

      const timeline = gsap.timeline()
      timeline.to('.name-container', { y: 0, scale: 0.92, opacity: 1, duration: 0.6, ease: 'power2.in' })
      timeline.to('.name-container', { scale: 1, duration: 0.4, ease: 'elastic.out(1.2, 0.4)' })
      timeline.call(() => setStartMaskAnimation(true), undefined, 0.55)

      gsap.from('.tree-right', { xPercent: 100, duration: 1.5, ease: 'power3.out', delay: 1.5 })
      gsap.from('.tree-left', { xPercent: -100, duration: 1.5, ease: 'power3.out', delay: 1.5 })
      gsap.fromTo('.social-links', { yPercent: 100, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 1, ease: 'power3.out', delay: 1.5 })
    }, rootRef)

    return () => ctx.revert()
  }, [isLoaded, animationsReady, mode])

  // Trigger SVG mask animation
  useEffect(() => {
    if (!startMaskAnimation) return
    setTimeout(() => {
      svgMaskRef.current?.beginElement()
      document.querySelectorAll('#bgMask animate').forEach((anim) => {
        (anim as SVGAnimateElement).beginElement()
      })
    }, 0)
  }, [startMaskAnimation])

  const showContent = isLoaded && animationsReady && mode !== null

  return (
    <>
      <ModeSelector />

      {!showContent && mode !== null && <LoadingScreen />}

      <div className="absolute inset-0 w-full h-full overflow-hidden">
        <Image src="/landing/images/white_paper.png" alt="" fill className="object-cover" priority />
      </div>

      <div ref={rootRef} className={`relative w-full h-screen overflow-hidden ${showContent ? 'opacity-100' : 'opacity-0'}`}>
        <div className={`absolute inset-0 z-[50] pointer-events-none transition-opacity duration-500 ${startMaskAnimation ? 'opacity-0' : 'opacity-100'}`}>
          <Image src="/landing/images/white_paper.png" alt="" fill className="object-cover" priority />
        </div>

        <div className="absolute inset-0 w-full h-full overflow-hidden">
          <Image src="/landing/images/painted_bg.png" alt="" fill className="object-cover" priority />
          {isLowPerformance ? (
            <Image src="/animation_frames/landing/composed_bg/composed_bg0300.png" alt="" fill className="absolute inset-0 object-cover" />
          ) : (
            <video ref={compositeVideoRef} src="/landing/videos/landing_composite_24fps.webm" autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover" preload="auto" />
          )}
        </div>

        <InkMaskSvg svgMaskRef={svgMaskRef} maskX={maskX} maskWidth={maskWidth} />

        <div className="name-container absolute z-[62] top-[38%] sm:top-[45%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center will-change-transform opacity-0">
          <div className="flex flex-wrap sm:flex-nowrap gap-x-4 items-center justify-center -ml-12 sm:ml-0">
            <div className="flex gap-4 items-center justify-center">
              <div className={`text-8xl sm:text-9xl tracking-tighter text-stroke-white ${weddingDay.className}`}>Daniel</div>
              <div className={`text-[11rem] sm:text-[12rem] tracking-tighter text-stroke-white mt-50 sm:mt-15 -mr-5 ${weddingDay.className}`}>W</div>
            </div>
            <div className={`text-8xl sm:text-9xl tracking-tighter text-stroke-white -mt-60 sm:mt-0 ${weddingDay.className}`}>Liu</div>
          </div>
          <div className={`text-2xl sm:text-3xl tracking-wide text-stroke-white-sm -mt-20 sm:-mt-25 text-center font-bold whitespace-nowrap ${weddingDay.className}`}>
            Waterloo CS and Finance Double Major
          </div>
        </div>

        <TreeOverlays isLowPerformance={isLowPerformance} treeRightRef={treeRightRef} treeLeftRef={treeLeftRef} />

        <SocialLinks variant="black" className="social-links" />
      </div>
    </>
  )
}
