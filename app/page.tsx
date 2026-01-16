'use client'

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
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
  const sunGradientRef = useRef<HTMLDivElement>(null)
  const signalledReadyRef = useRef(false)
  const introGsapContextRef = useRef<gsap.Context | null>(null)

  const { mode, isLowPerformance } = usePerformanceMode()
  const isMobile = useMobile(768)
  const isSmallMobile = useMobile(550)
  const { signalReady, transitionStage } = useTransitionState()

  useBodyOverflow('hidden')

  // Auto-pan background on small mobile screens
  const panTimelineRef = useRef<gsap.core.Timeline | null>(null)

  // Callback ref to start panning when element mounts
  const setupPanAnimation = useCallback((element: HTMLDivElement | null) => {
    // Also store in regular ref for other uses
    bgPanContainerRef.current = element

    // Kill existing timeline
    if (panTimelineRef.current) {
      panTimelineRef.current.kill()
      panTimelineRef.current = null
    }

    if (!element) return

    // Reset transform when not animating (larger screens)
    if (!isSmallMobile || mode === null) {
      // Remove any inline transform styles GSAP may have added
      element.style.transform = ''
      return
    }

    const timeline = gsap.timeline({ repeat: -1 })
    panTimelineRef.current = timeline

    // Start from left position (show right side of image)
    timeline.set(element, { x: '-33%' })
    // Pan to right (show left side of image)
    timeline.to(element, { x: '0%', duration: 8, ease: 'power1.inOut' })
    // Pan back to left
    timeline.to(element, { x: '-33%', duration: 8, ease: 'power1.inOut' })
  }, [isSmallMobile, mode])

  // Re-run animation setup when isSmallMobile or mode changes (after initial mount)
  useEffect(() => {
    if (bgPanContainerRef.current) {
      setupPanAnimation(bgPanContainerRef.current)
    }
  }, [isSmallMobile, mode, setupPanAnimation])

  // Cleanup timeline on unmount
  useEffect(() => {
    return () => {
      if (panTimelineRef.current) {
        panTimelineRef.current.kill()
        panTimelineRef.current = null
      }
    }
  }, [])

  // Sync sun gradient position directly to video time
  useEffect(() => {
    const video = compositeVideoRef.current
    const gradient = sunGradientRef.current
    if (!video || !gradient || isLowPerformance) return

    const videoDuration = 12.54 // Video duration in seconds
    const cycleDuration = videoDuration / 2 // Gradient completes 2 cycles per video
    let animationId: number

    const updateGradient = () => {
      const time = video.currentTime
      // Calculate position in current cycle (0 to 1)
      const cycleProgress = (time % cycleDuration) / cycleDuration
      // Sine wave for smooth oscillation: 0->1->0 over one cycle
      const sineValue = Math.sin(cycleProgress * Math.PI)
      // Map to gradient position (-15% to 5%)
      const gradientY = 2.5 + (sineValue * 20)
      // Set background directly for reliable updates
      gradient.style.background = `radial-gradient(circle at 50% ${gradientY}%, rgba(255,100,0,0.4) 15%, rgba(255,200,50,0.32) 28%, rgba(255,255,100,0.2) 38%, transparent 50%)`
      animationId = requestAnimationFrame(updateGradient)
    }

    animationId = requestAnimationFrame(updateGradient)
    return () => cancelAnimationFrame(animationId)
  }, [mode, isLowPerformance])

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

  // Set initial hidden states IMMEDIATELY when landing content mounts (before paint)
  // This ensures elements are hidden before the reveal animation can expose them
  const initialStatesSetRef = useRef(false)
  useLayoutEffect(() => {
    if (mode === null || isLowPerformance || !rootRef.current) return
    // Only set initial states once per mount, or when re-entering from quality selector
    if (initialStatesSetRef.current && introAnimationsStarted) return

    initialStatesSetRef.current = true
    gsap.set('.name-container', { y: '-100vh', scale: 1.8, opacity: 0 })
    gsap.set('.tree-right', { xPercent: 100 })
    gsap.set('.tree-left', { xPercent: -100 })
    gsap.set('.social-links', { yPercent: 100, opacity: 0 })
  }, [mode, isLowPerformance, introAnimationsStarted])

  // Reset initial states flag when mode changes (returning to quality selector and back)
  useEffect(() => {
    if (mode === null) {
      initialStatesSetRef.current = false
    }
  }, [mode])

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

      gsap.to('.tree-right', { xPercent: 0, duration: 1.5, ease: 'power3.out', delay: 1.5 })
      gsap.to('.tree-left', { xPercent: 0, duration: 1.5, ease: 'power3.out', delay: 1.5 })
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
          {/* Main content - PageTransition overlay hides this until reveal */}
          <div ref={rootRef} className="relative w-full h-screen overflow-hidden">
            {/* White overlay that fades when mask animation starts */}
            <div className={`absolute inset-0 z-[50] pointer-events-none transition-opacity duration-500 ${startMaskAnimation ? 'opacity-0' : 'opacity-100'}`}>
              <Image src="/landing/images/white_paper.png" alt="" fill className="object-cover" priority />
            </div>

            {/* Background with video/image */}
            <div className="absolute inset-0 w-full h-full overflow-visible min-h-screen">
              <div
                ref={setupPanAnimation}
                className="relative h-full min-h-screen will-change-transform overflow-visible"
                style={{
                  width: isSmallMobile ? '150%' : '100%',
                }}
              >
                <div className="absolute inset-0 w-full h-full min-h-screen">
                  <Image src="/landing/images/painted_bg.png" alt="" fill className="object-cover z-0" priority />
                </div>
                {/* Sun ray gradient overlay - synced to video */}
                <div
                  ref={sunGradientRef}
                  className="absolute inset-0 pointer-events-none z-[1] animate-float-gradient"
                />
                {/* Blue gradient overlays on left and right */}
                <div className="absolute inset-0 pointer-events-none z-[1] landing-gradient-left" />
                <div className="absolute inset-0 pointer-events-none z-[1] landing-gradient-right" />
                <div className="absolute inset-0 w-full h-full min-h-screen z-[2]">
                  {isLowPerformance ? (
                    <Image src="/animation_frames/landing/composed_bg/composed_bg0300.png" alt="" fill sizes="100vw" className="object-cover" priority />
                  ) : (
                    <video ref={compositeVideoRef} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover" preload="auto">
                      <source src="/landing/videos/landing_composite_24fps.mov" type='video/mp4; codecs="hvc1"' />
                      <source src="/landing/videos/landing_composite_24fps.webm" type="video/webm" />
                    </video>
                  )}
                </div>
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
