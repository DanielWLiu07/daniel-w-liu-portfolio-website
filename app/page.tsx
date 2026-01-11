'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import gsap from 'gsap'
import Image from 'next/image'
import { SocialLinks } from '@/components/ui/social-links'
import { useBodyOverflow } from '@/hooks/use-body-overflow'
import { usePerformanceMode } from '@/contexts/performance-mode-context'
import { ModeSelector } from '@/components/ui/mode-selector'
import { useMobile } from '@/hooks/use-mobile'
import { LoadingScreen } from '@/components/ui/loading-screen'
import { useTransitionState } from '@/components/ui/page-transition'
import { InkMaskSvg, TreeOverlays, NameDisplay } from '@/components/landing'

const FALLBACK_TIMEOUT = 1500

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
  const introAnimationsTriggeredRef = useRef(false)
  const introGsapContextRef = useRef<gsap.Context | null>(null)

  const { mode, isLowPerformance } = usePerformanceMode()
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

  const showImmediately = isLowPerformance && mode !== null

  // Reset state when mode changes
  useEffect(() => {
    setIsLoaded(false)
    setStartMaskAnimation(false)
    setAnimationsReady(false)
    loadedCalledRef.current = false
    introAnimationsTriggeredRef.current = false

    if (introGsapContextRef.current) {
      introGsapContextRef.current.revert()
      introGsapContextRef.current = null
    }
  }, [mode])

  // Reset ready state and signal when entering loading
  useEffect(() => {
    if (transitionStage === 'loading' && mode !== null) {
      loadedCalledRef.current = false
      if (isLowPerformance) {
        signalReady()
      }
    }
  }, [transitionStage, mode, isLowPerformance, signalReady])

  // Signal ready for quality selector with minimum delay
  useEffect(() => {
    if (mode === null) {
      const timeout = setTimeout(signalReady, 250)
      return () => clearTimeout(timeout)
    }
  }, [mode, signalReady])

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

  // Run intro animations (skip for low performance)
  useEffect(() => {
    if (mode === null) return

    if (isLowPerformance) {
      setStartMaskAnimation(true)
      return
    }

    if (!isLoaded || !animationsReady) return
    if (transitionStage !== 'revealing' && transitionStage !== 'hidden') return
    if (introAnimationsTriggeredRef.current) return

    introAnimationsTriggeredRef.current = true

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
  }, [isLoaded, animationsReady, mode, isLowPerformance, transitionStage])

  // Cleanup GSAP context on unmount
  useEffect(() => {
    return () => {
      if (introGsapContextRef.current) {
        introGsapContextRef.current.revert()
        introGsapContextRef.current = null
      }
    }
  }, [])

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

  const showContent = showImmediately || (isLoaded && animationsReady && mode !== null)
  const shouldRenderLandingContent = mode !== null

  return (
    <>
      <ModeSelector />

      {shouldRenderLandingContent && (
        <>
          {!showContent && <LoadingScreen />}

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
            <NameDisplay showImmediately={showImmediately} />
            <TreeOverlays isLowPerformance={isLowPerformance} treeRightRef={treeRightRef} treeLeftRef={treeLeftRef} />
            <SocialLinks variant="black" className="social-links" />
          </div>
        </>
      )}
    </>
  )
}
