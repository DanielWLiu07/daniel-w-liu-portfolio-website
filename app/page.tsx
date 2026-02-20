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
import { AlphaVideo } from '@/components/ui/alpha-video'

const FALLBACK_TIMEOUT = 10000
const VIDEO_DURATION = 12.54

export default function Home() {
  const [startMaskAnimation, setStartMaskAnimation] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const compositeVideoRef = useRef<HTMLVideoElement>(null)
  const treeRightRef = useRef<HTMLVideoElement>(null)
  const treeLeftRef = useRef<HTMLVideoElement>(null)
  const bgPanContainerRef = useRef<HTMLDivElement>(null)
  const sunGradientRef = useRef<HTMLDivElement>(null)
  const signalledReadyRef = useRef(false)
  const introGsapContextRef = useRef<gsap.Context | null>(null)
  const panTimelineRef = useRef<gsap.core.Timeline | null>(null)
  const initialStatesSetRef = useRef(false)
  const introAnimationsStartedRef = useRef(false)

  const { mode, isLowPerformance } = usePerformanceMode()
  const isMobile = useMobile(768)
  const isSmallMobile = useMobile(550)
  const { signalReady, transitionStage, onIntroStart } = useTransitionState()

  useBodyOverflow('hidden')

  const setupPanAnimation = useCallback((element: HTMLDivElement | null) => {
    bgPanContainerRef.current = element

    if (panTimelineRef.current) {
      panTimelineRef.current.kill()
      panTimelineRef.current = null
    }

    if (!element) return

    if (!isSmallMobile || mode === null) {
      element.style.transform = ''
      return
    }

    const timeline = gsap.timeline({ repeat: -1 })
    panTimelineRef.current = timeline
    timeline.set(element, { x: '-33%' })
    timeline.to(element, { x: '0%', duration: 8, ease: 'power1.inOut' })
    timeline.to(element, { x: '-33%', duration: 8, ease: 'power1.inOut' })
  }, [isSmallMobile, mode])

  useEffect(() => {
    if (bgPanContainerRef.current) {
      setupPanAnimation(bgPanContainerRef.current)
    }
  }, [isSmallMobile, mode, setupPanAnimation])

  useEffect(() => {
    return () => {
      if (panTimelineRef.current) {
        panTimelineRef.current.kill()
        panTimelineRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const video = compositeVideoRef.current
    const gradient = sunGradientRef.current
    if (!video || !gradient || isLowPerformance) return

    const cycleDuration = VIDEO_DURATION / 2
    let animationId: number

    const updateGradient = () => {
      const cycleProgress = (video.currentTime % cycleDuration) / cycleDuration
      const sineValue = Math.sin(cycleProgress * Math.PI)
      const gradientY = 2.5 + (sineValue * 20)
      gradient.style.background = `radial-gradient(circle at 50% ${gradientY}%, rgba(255,100,0,0.2) 15%, rgba(255,200,50,0.16) 28%, rgba(255,255,100,0.1) 38%, transparent 50%)`
      animationId = requestAnimationFrame(updateGradient)
    }

    animationId = requestAnimationFrame(updateGradient)
    return () => cancelAnimationFrame(animationId)
  }, [mode, isLowPerformance])

  const maskWidth = isMobile ? '95%' : '87%'
  const maskX = isMobile ? '2.5%' : '6.5%'

  const doSignalReady = useCallback(() => {
    if (signalledReadyRef.current) return
    signalledReadyRef.current = true
    signalReady()
  }, [signalReady])

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    signalledReadyRef.current = false
    introAnimationsStartedRef.current = false
    setStartMaskAnimation(false)
    if (introGsapContextRef.current) {
      introGsapContextRef.current.revert()
      introGsapContextRef.current = null
    }
  }, [mode])
  /* eslint-enable react-hooks/set-state-in-effect */

  useLayoutEffect(() => {
    if (transitionStage === 'loading') {
      signalledReadyRef.current = false
      introAnimationsStartedRef.current = false
    }
  }, [transitionStage])

  useLayoutEffect(() => {
    if (mode === null || isLowPerformance || !rootRef.current) return
    if (initialStatesSetRef.current && introAnimationsStartedRef.current) return

    initialStatesSetRef.current = true
    gsap.set('.name-container', { y: '-100vh', scale: 1.8, opacity: 0 })
    gsap.set('.tree-right', { xPercent: 100 })
    gsap.set('.tree-left', { xPercent: -100 })
    gsap.set('.social-links', { yPercent: 100, opacity: 0 })
  }, [mode, isLowPerformance])

  useEffect(() => {
    if (mode === null) {
      initialStatesSetRef.current = false
    }
  }, [mode])

  useEffect(() => {
    if (mode === null) {
      const timeout = setTimeout(doSignalReady, 100)
      return () => clearTimeout(timeout)
    }
  }, [mode, doSignalReady])

  useEffect(() => {
    if (mode === null) return

    if (isLowPerformance) {
      doSignalReady()
      return
    }

    const video = compositeVideoRef.current
    if (!video) {
      const timeout = setTimeout(doSignalReady, FALLBACK_TIMEOUT)
      return () => clearTimeout(timeout)
    }

    // Check if video is already progressing (currentTime > 0 means frames are rendering)
    if (!video.paused && video.currentTime > 0) {
      doSignalReady()
      return
    }

    // Wait for 'timeupdate' — fires when currentTime advances, meaning frames are
    // actually being decoded and rendered (stronger signal than 'playing' which fires
    // on the very first frame before any visible progress)
    const handleTimeUpdate = () => {
      if (video.currentTime > 0) {
        doSignalReady()
      }
    }
    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('error', () => doSignalReady())
    const timeout = setTimeout(doSignalReady, FALLBACK_TIMEOUT)

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      clearTimeout(timeout)
    }
  }, [mode, isLowPerformance, doSignalReady, transitionStage])

  const startIntroAnimations = useCallback(() => {
    if (introAnimationsStartedRef.current) return
    introAnimationsStartedRef.current = true

    if (isLowPerformance) {
      setStartMaskAnimation(true)
      return
    }

    introGsapContextRef.current = gsap.context(() => {
      gsap.set('.name-container', { y: '-100vh', scale: 1.8, opacity: 0 })

      const timeline = gsap.timeline()
      timeline.to('.name-container', { y: 0, scale: 0.92, opacity: 1, duration: 0.6, ease: 'power2.in' })
      timeline.to('.name-container', { scale: 1, duration: 0.4, ease: 'elastic.out(1.2, 0.4)' })
      timeline.call(() => setStartMaskAnimation(true), undefined, 0.6)

      gsap.to('.tree-right', { xPercent: 0, duration: 1.5, ease: 'power3.out', delay: 1.5 })
      gsap.to('.tree-left', { xPercent: 0, duration: 1.5, ease: 'power3.out', delay: 1.5 })
      gsap.fromTo('.social-links', { yPercent: 100, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 1, ease: 'power3.out', delay: 1.5 })
    }, rootRef)
  }, [isLowPerformance])

  // Register intro animation callback with page transition
  useEffect(() => {
    if (mode === null) return
    onIntroStart(startIntroAnimations)
  }, [mode, onIntroStart, startIntroAnimations])

  useEffect(() => {
    return () => {
      if (introGsapContextRef.current) {
        introGsapContextRef.current.revert()
        introGsapContextRef.current = null
      }
    }
  }, [])

  const showImmediately = isLowPerformance && mode !== null
  const shouldRenderLandingContent = mode !== null

  return (
    <>
      <ModeSelector />

      {/* Preload InkMaskSvg hidden while quality selector is showing */}
      {!shouldRenderLandingContent && (
        <div className="fixed inset-0 pointer-events-none opacity-0" aria-hidden="true">
          <InkMaskSvg maskX={maskX} maskWidth={maskWidth} startMaskAnimation={false} />
        </div>
      )}

      {shouldRenderLandingContent && (
        <>
          <div ref={rootRef} className="relative w-full h-screen overflow-hidden">
            <div className={`absolute inset-0 z-[50] pointer-events-none transition-opacity duration-500 ${startMaskAnimation ? 'opacity-0' : 'opacity-100'}`}>
              <Image src="/landing/images/white_paper.webp" alt="" fill className="object-cover" priority />
            </div>

            <div className="absolute inset-0 w-full h-full overflow-visible min-h-screen">
              <div
                ref={setupPanAnimation}
                className="relative h-full min-h-screen will-change-transform overflow-visible"
                style={{
                  width: isSmallMobile ? '150%' : '100%',
                }}
              >
                <div className="absolute inset-0 w-full h-full min-h-screen">
                  <Image src="/landing/images/painted_bg.webp" alt="" fill className="object-cover z-0" priority />
                </div>
                <div
                  ref={sunGradientRef}
                  className="absolute inset-0 pointer-events-none z-[1] animate-float-gradient"
                />
                <div className="absolute inset-0 pointer-events-none z-[1] landing-gradient-left" />
                <div className="absolute inset-0 pointer-events-none z-[1] landing-gradient-right" />
                <div className="absolute inset-0 w-full h-full min-h-screen z-[2]">
                  {isLowPerformance ? (
                    <Image src="/animation_frames/landing/composed_bg/composed_bg0300.webp" alt="" fill sizes="100vw" className="object-cover" priority />
                  ) : (
                    <AlphaVideo
                      ref={compositeVideoRef}
                      src="/landing/videos/landing_composite_24fps"
                      query="?v=3"
                      fallbackImage="/animation_frames/landing/composed_bg/composed_bg0300.webp"
                      className="absolute inset-0 w-full h-full object-cover"
                      autoPlay
                      loop
                      muted
                      playsInline
                      preload="auto"
                    />
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
