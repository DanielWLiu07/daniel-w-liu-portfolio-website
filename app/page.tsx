'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import gsap from 'gsap'
import Image from 'next/image'
import { SocialLinks } from '@/components/ui/social-links'
import { useBodyOverflow } from '@/hooks/use-body-overflow'
import { usePerformanceMode } from '@/contexts/performance-mode-context'
import { ModeSelector } from '@/components/ui/mode-selector'
import { useMobile } from '@/hooks/use-mobile'
import { useTransitionState } from '@/components/ui/page-transition'
import { InkMaskSvg, TreeOverlays, NameDisplay } from '@/components/landing'

const FALLBACK_TIMEOUT = 2000

export default function Home() {
  const [startMaskAnimation, setStartMaskAnimation] = useState(false)
  const [introAnimationsStarted, setIntroAnimationsStarted] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const compositeVideoRef = useRef<HTMLVideoElement>(null)
  const treeRightRef = useRef<HTMLVideoElement>(null)
  const treeLeftRef = useRef<HTMLVideoElement>(null)
  const bgPanContainerRef = useRef<HTMLDivElement>(null)
  const signalledReadyRef = useRef(false)
  const introGsapContextRef = useRef<gsap.Context | null>(null)

  const { mode, isLowPerformance } = usePerformanceMode()
  const isMobile = useMobile(768)
  const isSmallMobile = useMobile(431)
  const { signalReady, transitionStage } = useTransitionState()

  useBodyOverflow('hidden')

  // Auto-pan background on small mobile screens
  useEffect(() => {
    if (!isSmallMobile || !bgPanContainerRef.current || mode === null) return

    const timeline = gsap.timeline({ repeat: -1 })
    // Start from center (offset by -14% to center the 150% wide container)
    timeline.set(bgPanContainerRef.current, { x: '-14%' })
    timeline.to(bgPanContainerRef.current, {
      x: '-24%',
      duration: 4,
      ease: 'power1.inOut'
    })
    timeline.to(bgPanContainerRef.current, {
      x: '-14%',
      duration: 4,
      ease: 'power1.inOut'
    })
    timeline.to(bgPanContainerRef.current, {
      x: '-4%',
      duration: 4,
      ease: 'power1.inOut'
    })
    timeline.to(bgPanContainerRef.current, {
      x: '-14%',
      duration: 4,
      ease: 'power1.inOut'
    })

    return () => {
      timeline.kill()
    }
  }, [isSmallMobile, mode])

  const maskWidth = isMobile ? '95%' : '87%'
  const maskX = isMobile ? '2.5%' : '6.5%'

  // Signal ready to PageTransition
  const doSignalReady = useCallback(() => {
    if (signalledReadyRef.current) return
    signalledReadyRef.current = true
    signalReady()
  }, [signalReady])

  // Reset all state when mode changes (e.g., when quality is selected)
  useEffect(() => {
    signalledReadyRef.current = false
    setStartMaskAnimation(false)
    setIntroAnimationsStarted(false)

    if (introGsapContextRef.current) {
      introGsapContextRef.current.revert()
      introGsapContextRef.current = null
    }
  }, [mode])

  // Reset ready state when entering loading (new navigation to this page)
  useEffect(() => {
    if (transitionStage === 'loading') {
      signalledReadyRef.current = false
      setIntroAnimationsStarted(false)
    }
  }, [transitionStage])

  // For quality selector (mode === null), signal ready after brief delay
  useEffect(() => {
    if (mode === null) {
      const timeout = setTimeout(doSignalReady, 100)
      return () => clearTimeout(timeout)
    }
  }, [mode, doSignalReady])

  // For landing content (mode !== null), wait for video to load
  useEffect(() => {
    if (mode === null) return

    // Low performance: signal ready immediately
    if (isLowPerformance) {
      doSignalReady()
      return
    }

    const video = compositeVideoRef.current
    if (!video) {
      // Video element not in DOM yet - use fallback
      const timeout = setTimeout(doSignalReady, FALLBACK_TIMEOUT)
      return () => clearTimeout(timeout)
    }

    // Video already loaded
    if (video.readyState >= 3) {
      doSignalReady()
      return
    }

    // Wait for video to be playable
    const handleReady = () => doSignalReady()
    video.addEventListener('canplay', handleReady)
    video.addEventListener('loadeddata', handleReady)

    // Fallback timeout
    const timeout = setTimeout(doSignalReady, FALLBACK_TIMEOUT)

    return () => {
      video.removeEventListener('canplay', handleReady)
      video.removeEventListener('loadeddata', handleReady)
      clearTimeout(timeout)
    }
  }, [mode, isLowPerformance, doSignalReady])

  // Run intro animations when reveal starts or on direct load (hidden)
  useEffect(() => {
    if (mode === null) return
    if (introAnimationsStarted) return
    if (transitionStage !== 'revealing' && transitionStage !== 'hidden') return

    setIntroAnimationsStarted(true)

    // For low performance, just show content immediately
    if (isLowPerformance) {
      setStartMaskAnimation(true)
      return
    }

    // Run GSAP intro animations
    introGsapContextRef.current = gsap.context(() => {
      gsap.set('.name-container', { y: '-100vh', scale: 1.8, opacity: 0 })

      const timeline = gsap.timeline()
      timeline.to('.name-container', { y: 0, scale: 0.92, opacity: 1, duration: 0.6, ease: 'power2.in' })
      timeline.to('.name-container', { scale: 1, duration: 0.4, ease: 'elastic.out(1.2, 0.4)' })
      timeline.call(() => setStartMaskAnimation(true), undefined, 0.55)

      gsap.from('.tree-right', { xPercent: 100, duration: 1.5, ease: 'power3.out', delay: 1.5 })
      gsap.from('.tree-left', { xPercent: -100, duration: 1.5, ease: 'power3.out', delay: 1.5 })
      gsap.fromTo('.social-links', { yPercent: 100, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 1, ease: 'power3.out', delay: 1.5 })
    }, rootRef)
  }, [mode, isLowPerformance, transitionStage, introAnimationsStarted])

  // Cleanup GSAP context on unmount
  useEffect(() => {
    return () => {
      if (introGsapContextRef.current) {
        introGsapContextRef.current.revert()
        introGsapContextRef.current = null
      }
    }
  }, [])

  // SVG mask animation now handled by requestAnimationFrame in InkMaskSvg component

  const showImmediately = isLowPerformance && mode !== null
  const shouldRenderLandingContent = mode !== null

  return (
    <>
      <ModeSelector />

      {shouldRenderLandingContent && (
        <>
          {/* Background layer */}
          <div className="absolute inset-0 w-full h-full overflow-hidden">
            <Image src="/landing/images/white_paper.png" alt="" fill className="object-cover" priority />
          </div>

          {/* Main content - PageTransition overlay hides this until reveal */}
          <div ref={rootRef} className="relative w-full h-screen overflow-hidden">
            {/* White overlay that fades when mask animation starts */}
            <div className={`absolute inset-0 z-[50] pointer-events-none transition-opacity duration-500 ${startMaskAnimation ? 'opacity-0' : 'opacity-100'}`}>
              <Image src="/landing/images/white_paper.png" alt="" fill className="object-cover" priority />
            </div>

            {/* Background with video/image */}
            <div className="absolute inset-0 w-full h-full overflow-visible">
              <div
                ref={bgPanContainerRef}
                className="relative h-full"
                style={{ width: isSmallMobile ? '150%' : '100%' }}
              >
                <Image src="/landing/images/painted_bg.png" alt="" fill className="object-cover" priority />
                {isLowPerformance ? (
                  <Image src="/animation_frames/landing/composed_bg/composed_bg0300.png" alt="" fill className="absolute inset-0 object-cover" />
                ) : (
                  <video ref={compositeVideoRef} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover" preload="auto">
                    <source src="/landing/videos/landing_composite_24fps.mov" type='video/mp4; codecs="hvc1"' />
                    <source src="/landing/videos/landing_composite_24fps.webm" type="video/webm" />
                  </video>
                )}
              </div>
            </div>

            <InkMaskSvg maskX={maskX} maskWidth={maskWidth} startMaskAnimation={startMaskAnimation} />
            <NameDisplay showImmediately={showImmediately} />
            <TreeOverlays isLowPerformance={isLowPerformance} treeRightRef={treeRightRef} treeLeftRef={treeLeftRef} />
            <SocialLinks variant="black" className="social-links" />
          </div>
        </>
      )}
    </>
  )
}
