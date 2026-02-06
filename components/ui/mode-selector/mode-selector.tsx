'use client'

import { usePerformanceMode } from '@/contexts/performance-mode-context'
import { useTransitionState } from '@/components/ui/page-transition'
import { InkMaskSvg } from '@/components/landing'
import { InkMaskSvg as LoadingRevealSvg } from '@/components/ui/page-transition/ink-mask-svg'
import { REVEAL_DURATION } from '@/components/ui/page-transition/constants'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { frederickaFont } from '@/lib/fonts'
import {
  SocialLinks,
  HelperText,
  QualityOptionCard,
  PaperClipTop1,
  PaperClipTop2,
  PaperClipTop3,
  PaperClipRight1,
  PaperClipRight2,
  SelfiePhoto,
  CatPhoto,
  WaterlooBadge,
} from './index'

export function ModeSelector() {
  const { mode, setMode } = usePerformanceMode()
  const { navigateWithTransition } = useTransitionState()

  const titleRef = useRef<HTMLDivElement>(null)
  const subtitleRef = useRef<HTMLParagraphElement>(null)
  const highQualityRef = useRef<HTMLDivElement>(null)
  const lowQualityRef = useRef<HTMLDivElement>(null)
  const helperTextRef = useRef<HTMLParagraphElement>(null)
  const sticky3Ref = useRef<HTMLDivElement>(null)
  const sticky4Ref = useRef<HTMLDivElement>(null)
  const waterlooRef = useRef<HTMLDivElement>(null)
  const socialsRef = useRef<HTMLDivElement>(null)
  const paperClip1Ref = useRef<HTMLDivElement>(null)
  const paperClip2Ref = useRef<HTMLDivElement>(null)
  const paperClip3Ref = useRef<HTMLDivElement>(null)
  const paperClipRight1Ref = useRef<HTMLDivElement>(null)
  const paperClipRight2Ref = useRef<HTMLDivElement>(null)
  const isSelectingRef = useRef(false)
  const exitTimelineRef = useRef<gsap.core.Timeline | null>(null)
  const animationsStartedRef = useRef(false)
  const entranceGsapContextRef = useRef<gsap.Context | null>(null)
  const loadingRevealSvgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [imagesLoaded, setImagesLoaded] = useState(false)
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(true)

  // Preload white paper image immediately for SVG mask
  useEffect(() => {
    const img = new window.Image()
    img.src = '/landing/images/white_paper.webp'
  }, [])

  // Reset state when returning to quality selector
  useEffect(() => {
    if (mode === null) {
      isSelectingRef.current = false
      animationsStartedRef.current = false
      setImagesLoaded(false)
      setShowLoadingOverlay(true)
      if (exitTimelineRef.current) {
        exitTimelineRef.current.kill()
        exitTimelineRef.current = null
      }
      if (entranceGsapContextRef.current) {
        entranceGsapContextRef.current.revert()
        entranceGsapContextRef.current = null
      }
    }
  }, [mode])

  // Image loading detection
  useEffect(() => {
    if (mode !== null || imagesLoaded) return

    let cancelled = false
    const fallbackTimer = setTimeout(() => {
      if (!cancelled) setImagesLoaded(true)
    }, 8000)

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return
        const container = containerRef.current
        if (!container) {
          setImagesLoaded(true)
          return
        }

        const imgs = container.querySelectorAll('img')
        if (imgs.length === 0) {
          setImagesLoaded(true)
          return
        }

        let remaining = 0
        const onSettle = () => {
          remaining--
          if (remaining <= 0 && !cancelled) {
            clearTimeout(fallbackTimer)
            setImagesLoaded(true)
          }
        }

        imgs.forEach((img) => {
          if (img.complete) return
          remaining++
          img.addEventListener('load', onSettle, { once: true })
          img.addEventListener('error', onSettle, { once: true })
        })

        if (remaining === 0 && !cancelled) {
          clearTimeout(fallbackTimer)
          setImagesLoaded(true)
        }
      })
    })

    return () => {
      cancelled = true
      clearTimeout(fallbackTimer)
    }
  }, [mode, imagesLoaded])

  // Remove loading overlay after reveal animation completes
  useEffect(() => {
    if (!imagesLoaded) return
    const timer = setTimeout(() => setShowLoadingOverlay(false), REVEAL_DURATION)
    return () => clearTimeout(timer)
  }, [imagesLoaded])

  // Entrance animations
  useEffect(() => {
    if (mode !== null) return
    if (!imagesLoaded) return
    if (animationsStartedRef.current) return

    animationsStartedRef.current = true

    gsap.set(titleRef.current, { y: -30, opacity: 0 })
    gsap.set(subtitleRef.current, { y: -20, opacity: 0 })
    gsap.set([paperClip1Ref.current, paperClip2Ref.current, paperClip3Ref.current], { opacity: 0 })
    gsap.set(paperClipRight1Ref.current, { x: 100, y: -50, rotation: 20, opacity: 0 })
    gsap.set(paperClipRight2Ref.current, { x: 80, y: 30, rotation: 15, opacity: 0 })
    gsap.set(highQualityRef.current, { x: -50, y: 50, rotation: -25, opacity: 0 })
    gsap.set(lowQualityRef.current, { x: 50, y: 50, rotation: 25, opacity: 0 })
    gsap.set(sticky3Ref.current, { x: -150, y: 100, rotation: -45, opacity: 0 })
    gsap.set(sticky4Ref.current, { x: 150, y: 100, rotation: 45, opacity: 0 })
    gsap.set(waterlooRef.current, { x: -300, y: 300, rotation: -70, opacity: 0 })
    gsap.set(helperTextRef.current, { y: 20, opacity: 0 })
    gsap.set(socialsRef.current, { x: -50, opacity: 0 })

    const delayTimer = setTimeout(() => {
      entranceGsapContextRef.current = gsap.context(() => {
        const tl = gsap.timeline({ defaults: { ease: 'back.out(1.2)' } })

        tl.to(titleRef.current, { y: 0, opacity: 1, duration: 0.8 })
          .to([paperClip1Ref.current, paperClip2Ref.current, paperClip3Ref.current], { opacity: 1, duration: 0.6, stagger: 0.1 }, '-=0.6')
          .to(subtitleRef.current, { y: 0, opacity: 1, duration: 0.6 }, '-=0.4')
          .to(sticky3Ref.current, { x: 0, y: 0, rotation: -18, opacity: 1, duration: 0.8 }, '-=0.3')
          .to(waterlooRef.current, { x: 0, y: 0, rotation: -10, opacity: 1, duration: 0.8 }, '-=0.75')
          .to(highQualityRef.current, { x: 0, y: 0, rotation: -5, opacity: 1, duration: 0.8 }, '-=0.7')
          .to(lowQualityRef.current, { x: 0, y: 0, rotation: 4, opacity: 1, duration: 0.8 }, '-=0.7')
          .to(helperTextRef.current, { y: 0, opacity: 0.8, duration: 0.6 }, '-=0.7')
          .to(sticky4Ref.current, { x: -10, y: 30, rotation: 15, opacity: 1, duration: 0.8 }, '-=0.6')
          .to(paperClipRight1Ref.current, { x: 0, y: 0, rotation: -80, opacity: 1, duration: 0.8 }, '-=0.7')
          .to(paperClipRight2Ref.current, { x: 0, y: 0, rotation: -80, opacity: 1, duration: 0.8 }, '-=0.775')
          .to(socialsRef.current, { x: 0, opacity: 1, duration: 0.8 }, '-=0.8')
      })
    }, 300)

    return () => {
      clearTimeout(delayTimer)
      animationsStartedRef.current = false
    }
  }, [mode, imagesLoaded])

  const handleModeSelect = (selectedMode: 'high' | 'low') => {
    if (isSelectingRef.current) return
    isSelectingRef.current = true

    if (exitTimelineRef.current) {
      exitTimelineRef.current.kill()
    }

    const EXIT_DURATION = 500

    if (entranceGsapContextRef.current) {
      entranceGsapContextRef.current.kill()
      entranceGsapContextRef.current = null
    }

    const exitTl = gsap.timeline({ defaults: { overwrite: true } })
    exitTimelineRef.current = exitTl

    exitTl
      .to([titleRef.current, subtitleRef.current], { y: -30, opacity: 0, duration: 0.5, ease: 'power2.in' }, 0)
      .to([paperClip1Ref.current, paperClip2Ref.current, paperClip3Ref.current, paperClipRight1Ref.current, paperClipRight2Ref.current], { yPercent: -50, opacity: 0, duration: 0.5, ease: 'power2.in' }, 0)
      .to(socialsRef.current, { x: -50, opacity: 0, duration: 0.5, ease: 'power2.in' }, 0)
      .to(helperTextRef.current, { y: 30, opacity: 0, duration: 0.5, ease: 'power2.in' }, 0)
      .to([highQualityRef.current, lowQualityRef.current], { scale: 0.8, opacity: 0, duration: 0.5, ease: 'power2.in' }, 0)
      .to(sticky3Ref.current, { x: window.innerWidth < 768 ? 0 : -200, y: 0, rotation: 0, opacity: 0, duration: 0.5, ease: 'power2.in' }, 0)
      .to(sticky4Ref.current, { x: window.innerWidth < 768 ? 0 : 200, y: 0, rotation: 0, opacity: 0, duration: 0.5, ease: 'power2.in' }, 0)
      .to(waterlooRef.current, { x: 0, y: 100, rotation: 0, opacity: 0, duration: 0.5, ease: 'power2.in' }, 0)

    setTimeout(() => {
      if (containerRef.current) {
        containerRef.current.style.zIndex = '0'
      }
      navigateWithTransition('/', () => {
        setMode(selectedMode)
      })
    }, EXIT_DURATION + 50)
  }

  if (mode !== null) return null

  return (
    <>
      {showLoadingOverlay && (
        <div className={`fixed inset-0 z-[20001] ${imagesLoaded ? 'pointer-events-none' : ''}`}>
          <LoadingRevealSvg svgRef={loadingRevealSvgRef} maskType="reveal" triggerAnimation={imagesLoaded} />
        </div>
      )}

      <div className="fixed inset-0 pointer-events-none opacity-0 -z-50" aria-hidden="true">
        <InkMaskSvg maskX="6.5%" maskWidth="87%" startMaskAnimation={false} />
      </div>

      <div ref={containerRef} className="fixed inset-0 z-[20000] flex items-center justify-center p-4 lg:p-8 overflow-visible">
        <div className="absolute inset-0 z-0">
          <Image src="/landing/images/white_paper.webp" alt="paper background" fill className="object-cover" priority />
        </div>

        <PaperClipTop1 ref={paperClip1Ref} />
        <PaperClipTop2 ref={paperClip2Ref} />
        <PaperClipTop3 ref={paperClip3Ref} />
        <SelfiePhoto ref={sticky3Ref} />
        <WaterlooBadge ref={waterlooRef} />
        <CatPhoto ref={sticky4Ref} />
        <PaperClipRight1 ref={paperClipRight1Ref} />
        <PaperClipRight2 ref={paperClipRight2Ref} />

        <div className="relative flex flex-col items-center justify-center gap-16 lg:gap-16 w-full max-w-6xl mx-auto z-[300] will-change-auto">
          <div ref={titleRef} className="text-center space-y-2 opacity-0 relative -mt-15 lg:mt-0 z-[300]">
            <h2 className={`text-4xl md:text-6xl lg:text-7xl text-center tracking-wider md:text-stroke-white text-stroke-white-sm drop-shadow-lg relative whitespace-nowrap text-[#2c1810] ${frederickaFont.className}`}>
              Choose Your Journey
            </h2>
            <p ref={subtitleRef} className={`text-lg md:text-xl lg:text-xl text-center tracking-wider text-stroke-white-xs drop-shadow-lg relative opacity-0 text-[#2c1810] ${frederickaFont.className}`}>
              Every Page a New World
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start justify-center px-4 md:px-8 overflow-visible">
            <QualityOptionCard ref={highQualityRef} variant="high" onClick={() => handleModeSelect('high')} />
            <QualityOptionCard ref={lowQualityRef} variant="low" onClick={() => handleModeSelect('low')} />
          </div>
        </div>

        <HelperText ref={helperTextRef} />
        <SocialLinks ref={socialsRef} />
      </div>
    </>
  )
}
