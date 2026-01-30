'use client'

import { usePerformanceMode } from '@/contexts/performance-mode-context'
import { useTransitionState } from '@/components/ui/page-transition'
import { InkMaskSvg } from '@/components/landing'
import Image from 'next/image'
import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { frederickaFont } from '@/lib/fonts'
import { SocialLinks, HelperText } from './index'

export function ModeSelector() {
  const { mode, setMode } = usePerformanceMode()
  const { navigateWithTransition, transitionStage } = useTransitionState()

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

  // Preload white paper image immediately for SVG mask
  useEffect(() => {
    const img = new window.Image()
    img.src = '/landing/images/white_paper.webp'
  }, [])

  useEffect(() => {
    if (mode === null) {
      isSelectingRef.current = false
      animationsStartedRef.current = false
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

  useEffect(() => {
    if (mode !== null) return
    if (transitionStage !== 'revealing' && transitionStage !== 'hidden') return
    if (animationsStartedRef.current) return

    animationsStartedRef.current = true

    entranceGsapContextRef.current = gsap.context(() => {
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

      const tl = gsap.timeline({ defaults: { ease: 'back.out(1.2)' } })

      tl.to(titleRef.current, {
        y: 0,
        opacity: 1,
        duration: 0.8,
      })
      .to([paperClip1Ref.current, paperClip2Ref.current, paperClip3Ref.current], {
        opacity: 1,
        duration: 0.6,
        stagger: 0.1,
      }, '-=0.6')
      .to(subtitleRef.current, {
        y: 0,
        opacity: 1,
        duration: 0.6,
      }, '-=0.4')
      .to(sticky3Ref.current, {
        x: 0,
        y: 0,
        rotation: -18,
        opacity: 1,
        duration: 0.8,
      }, '-=0.3')
      .to(waterlooRef.current, {
        x: 0,
        y: 0,
        rotation: -10,
        opacity: 1,
        duration: 0.8,
      }, '-=0.75')
      .to(highQualityRef.current, {
        x: 0,
        y: 0,
        rotation: -5,
        opacity: 1,
        duration: 0.8,
      }, '-=0.7')
      .to(lowQualityRef.current, {
        x: 0,
        y: 0,
        rotation: 4,
        opacity: 1,
        duration: 0.8,
      }, '-=0.7')
      .to(helperTextRef.current, {
        y: 0,
        opacity: 0.8,
        duration: 0.6,
      }, '-=0.7')
      .to(sticky4Ref.current, {
        x: -10,
        y: 30,
        rotation: 15,
        opacity: 1,
        duration: 0.8,
      }, '-=0.6')
      .to(paperClipRight1Ref.current, {
        x: 0,
        y: 0,
        rotation: -80,
        opacity: 1,
        duration: 0.8,
      }, '-=0.7')
      .to(paperClipRight2Ref.current, {
        x: 0,
        y: 0,
        rotation: -80,
        opacity: 1,
        duration: 0.8,
      }, '-=0.775')
      .to(socialsRef.current, {
        x: 0,
        opacity: 1,
        duration: 0.8,
      }, '-=0.8')
    })
  }, [mode, transitionStage])

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

    exitTl.to([titleRef.current, subtitleRef.current], {
      y: -30,
      opacity: 0,
      duration: 0.5,
      ease: 'power2.in'
    }, 0)
    .to([paperClip1Ref.current, paperClip2Ref.current, paperClip3Ref.current, paperClipRight1Ref.current, paperClipRight2Ref.current], {
      yPercent: -50,
      opacity: 0,
      duration: 0.5,
      ease: 'power2.in'
    }, 0)
    .to(socialsRef.current, {
      x: -50,
      opacity: 0,
      duration: 0.5,
      ease: 'power2.in'
    }, 0)
    .to(helperTextRef.current, {
      y: 30,
      opacity: 0,
      duration: 0.5,
      ease: 'power2.in'
    }, 0)
    .to([highQualityRef.current, lowQualityRef.current], {
      scale: 0.8,
      opacity: 0,
      duration: 0.5,
      ease: 'power2.in'
    }, 0)
    .to(sticky3Ref.current, {
      x: window.innerWidth < 768 ? 0 : -200,
      y: 0,
      rotation: 0,
      opacity: 0,
      duration: 0.5,
      ease: 'power2.in'
    }, 0)
    .to(sticky4Ref.current, {
      x: window.innerWidth < 768 ? 0 : 200,
      y: 0,
      rotation: 0,
      opacity: 0,
      duration: 0.5,
      ease: 'power2.in'
    }, 0)
    .to(waterlooRef.current, {
      x: 0,
      y: 100,
      rotation: 0,
      opacity: 0,
      duration: 0.5,
      ease: 'power2.in'
    }, 0)

    setTimeout(() => {
      // Always use transition with loading overlay
      navigateWithTransition('/', () => {
        setMode(selectedMode)
      })
    }, EXIT_DURATION + 50)
  }

  if (mode !== null) return null

  return (
    <>
      {/* Preload InkMaskSvg immediately for faster reveal animation */}
      <div className="fixed inset-0 pointer-events-none opacity-0 -z-50" aria-hidden="true">
        <InkMaskSvg maskX="6.5%" maskWidth="87%" startMaskAnimation={false} />
      </div>

      <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 lg:p-8 overflow-visible">
        <div className="absolute inset-0 z-0">
          <Image
          src="/landing/images/white_paper.webp"
          alt="paper background"
          fill
          className="object-cover"
          priority
        />
      </div>

      <div
        ref={paperClip1Ref}
        className="fixed right-[15%] lg:right-[30%] -top-16 lg:-top-8 w-16 h-16 z-[203] pointer-events-none opacity-0 [transform:rotate(15deg)_scale(2.5)] lg:[transform:rotate(15deg)_scale(2.5)]"
      >
        <Image
          src="/quality/images/paper_clip_outline_1.webp"
          alt=""
          width={64}
          height={64}
          className="w-full h-full object-contain"
        />
      </div>

      <div
        ref={paperClip2Ref}
        className="fixed left-[15%] lg:left-[30%] -top-14 lg:-top-6 w-16 h-16 z-[204] pointer-events-none opacity-0 [transform:rotate(-15deg)_scale(2.5)] lg:[transform:rotate(-15deg)_scale(2.5)]"
      >
        <Image
          src="/quality/images/paper_clip_outline_2.webp"
          alt=""
          width={64}
          height={64}
          className="w-full h-full object-contain"
        />
      </div>

      <div
        ref={paperClip3Ref}
        className="fixed left-1/2 -translate-x-1/2 -top-12 lg:-top-2 w-16 h-16 z-[205] pointer-events-none opacity-0 [transform:rotate(180deg)_scale(2.5)_scaleX(-1)] lg:[transform:rotate(180deg)_scale(2.5)_scaleX(-1)]"
      >
        <Image
          src="/quality/images/paper_clip_outline_3.webp"
          alt=""
          width={64}
          height={64}
          className="w-full h-full object-contain"
        />
      </div>

      <div
        ref={sticky3Ref}
        className="fixed left-0 top-0 h-screen opacity-0 overflow-visible pointer-events-none z-[1] -ml-80 md:-ml-0 md:left-[-20vw] lg:left-[-5%] -mt-5 will-change-[opacity]"
      >
        <Image
          src="/quality/images/selfie_outline.webp"
          alt="Daniel W Liu"
          width={500}
          height={1750}
          className="h-full w-auto object-contain -scale-x-110 scale-y-110 rotate-[20deg] brightness-[1.05] saturate-[1.15] contrast-[1.05]"
        />
        <div
          className="absolute top-[20%] left-[50%] w-20 h-20 z-[200] pointer-events-none [transform:translate(-220px,150px)_rotate(0deg)_scale(1.4)] lg:[transform:translate(-220px,150px)_rotate(0deg)_scale(1.8)]"
        >
          <Image
            src="/quality/images/pin_outline_1.webp"
            alt=""
            width={80}
            height={80}
            className="w-full h-full object-contain"
          />
        </div>
        <div
          className="absolute top-[0%] left-[15%] w-20 h-20 z-[200] pointer-events-none [transform:translate(50px,0px)_rotate(45deg)_scale(1.4)] lg:[transform:translate(100px,0px)_rotate(-55deg)_scale(2.0)]"
        >
          <Image
            src="/quality/images/clip_3_outline.webp"
            alt=""
            width={80}
            height={80}
            className="w-full h-full object-contain"
          />
        </div>
      </div>

      <div
        ref={waterlooRef}
        className="fixed left-[0.5%] lg:left-0 bottom-15 lg:bottom-0 h-[18vh] lg:h-[30vh] opacity-0 overflow-visible z-[90] ml-2 mb-2 will-change-transform"
      >
        <a
          href="https://uwaterloo.ca"
          target="_blank"
          rel="noopener noreferrer"
          className="block h-full w-full group cursor-pointer"
          aria-label="University of Waterloo"
        >
          <div className="relative h-full w-full transition-transform duration-300 ease-out group-hover:scale-110 -rotate-[35deg]">
            <Image
              src="/quality/images/waterloo_outline.webp"
              alt="Waterloo"
              width={300}
              height={1200}
              className="h-full w-auto object-contain brightness-105 saturate-[1.15] contrast-105"
            />
            <div
              className="absolute top-[10%] left-[80%] w-20 h-20 z-[200] pointer-events-none [transform:translate(-20px,-30px)_rotate(85deg)_scale(0.8)] lg:[transform:translate(-20px,-30px)_rotate(85deg)_scale(1)]"
            >
              <Image
                src="/quality/images/pin_outline_3.webp"
                alt=""
                width={80}
                height={80}
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </a>
      </div>

      <div
        ref={sticky4Ref}
        className="fixed right-0 top-0 h-screen opacity-0 overflow-visible pointer-events-none z-[1] -mr-80 md:-mr-0 md:right-[-20vw] lg:right-[-5%] -mt-5 will-change-[opacity]"
      >
        <Image
          src="/quality/images/cat_tongue_outline.webp"
          alt="Bongo"
          width={500}
          height={1750}
          className="h-full w-auto object-contain -scale-x-110 scale-y-110 rotate-[-20deg] brightness-[1.05] saturate-[1.15] contrast-[1.05]"
        />
        <div
          className="absolute top-[20%] right-[50%] w-20 h-20 z-[201] pointer-events-none [transform:translate(-50px,-150px)_rotate(-40deg)_scale(1.4)] lg:[transform:translate(-50px,-150px)_rotate(-40deg)_scale(1.8)]"
        >
          <Image
            src="/quality/images/pin_outline_2.webp"
            alt=""
            width={80}
            height={80}
            className="w-full h-full object-contain"
          />
        </div>
        <div
          className="absolute top-[5%] right-[40%] w-20 h-20 z-[201] pointer-events-none [transform:translate(50px,50px)_rotate(60deg)_scale(1.4)] lg:[transform:translate(170px,80px)_rotate(-130deg)_scale(2.0)]"
        >
          <Image
            src="/quality/images/clip_4_outline.webp"
            alt=""
            width={80}
            height={80}
            className="w-full h-full object-contain"
          />
        </div>
      </div>

      <div ref={paperClipRight1Ref} className="fixed -right-4 top-[40vh] lg:top-[50vh] w-16 h-16 z-[203] pointer-events-none opacity-0 [transform:rotate(-80deg)_scale(2)] lg:[transform:rotate(-80deg)_scale(2.0)]">
        <Image
          src="/quality/images/paper_clip_outline_5.webp"
          alt=""
          width={64}
          height={64}
          className="w-full h-full object-contain"
        />
      </div>
      <div ref={paperClipRight2Ref} className="fixed -right-2 top-[50vh] lg:top-[60vh] w-16 h-16 z-[203] pointer-events-none opacity-0 [transform:rotate(-80deg)_scale(2.4)] lg:[transform:rotate(-80deg)_scale(2.5)]">
        <Image
          src="/quality/images/paper_clip_outline_7.webp"
          alt=""
          width={64}
          height={64}
          className="w-full h-full object-contain"
        />
      </div>

      <div className="relative flex flex-col items-center justify-center gap-16 lg:gap-16 w-full max-w-6xl mx-auto z-10 will-change-auto">

        <div ref={titleRef} className="text-center space-y-2 opacity-0 relative -mt-15 lg:mt-0 z-[100]">
          <h2
            className={`text-4xl md:text-6xl lg:text-7xl text-center tracking-wider md:text-stroke-white text-stroke-white-sm drop-shadow-lg relative whitespace-nowrap text-[#2c1810] ${frederickaFont.className}`}
          >
            Choose Your Journey
          </h2>
          <p
            ref={subtitleRef}
            className={`text-lg md:text-xl lg:text-xl text-center tracking-wider text-stroke-white-xs drop-shadow-lg relative opacity-0 text-[#2c1810] ${frederickaFont.className}`}
          >
            Every Page a New World
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start justify-center px-4 md:px-8 overflow-visible">
          <div
            ref={highQualityRef}
            className="relative group cursor-pointer opacity-0 overflow-visible -mt-18 order-2 md:order-1 z-20 md:z-20 will-change-[opacity]"
            onClick={() => handleModeSelect('high')}
          >
            <div
              className="relative w-[280px] h-[280px] md:w-[360px] md:h-[360px] lg:w-[420px] lg:h-[420px] rotate-[1deg] hover:scale-105 hover:rotate-0 transition-all duration-300 ease-out overflow-visible will-change-transform"
            >
              <Image
                src="/quality/images/sticky_quality_outline_1.webp"
                alt="High Quality"
                width={420}
                height={420}
                className="overflow-visible absolute inset-0 w-full h-full object-cover brightness-[1.05] saturate-[1.2] contrast-[1.05]"
                priority
              />
              <div className={`absolute inset-0 flex flex-col items-center justify-center px-6 md:px-10 py-10 md:py-16 text-gray-800 ${frederickaFont.className} leading-relaxed pointer-events-none z-10`}>
                <div className="text-2xl md:text-[2.4rem] lg:text-[2.75rem] font-bold mb-3 md:mb-6 tracking-wider md:text-stroke-white text-stroke-white-sm drop-shadow-lg text-[#2c1810] whitespace-nowrap">
                  High Quality
                </div>
                <div className="text-base md:text-lg lg:text-lg text-center space-y-1 md:space-y-2 tracking-wider text-stroke-white-xs drop-shadow-lg text-[#2c1810]">
                  <div>Smooth Animations</div>
                  <div>Full Effects</div>
                  <div>Best Experience</div>
                </div>
              </div>
              <div
                className="absolute -bottom-4 -left-4 w-20 h-20 z-[206] pointer-events-none [transform:translate(10px,40px)_rotate(35deg)_scale(1.6)] md:[transform:translate(10px,40px)_rotate(35deg)_scale(1.9)] lg:[transform:translate(10px,40px)_rotate(35deg)_scale(2.2)]"
              >
                <Image
                  src="/quality/images/clip_1_outline.webp"
                  alt=""
                  width={80}
                  height={80}
                  className="w-full h-full object-contain"
                />
              </div>
              <div
                className="absolute -top-10 md:-top-4 -right-8 md:-right-4 w-16 h-16 z-[206] pointer-events-none [transform:translate(-30px,60px)_rotate(-140deg)_scale(1.5)] md:[transform:translate(-30px,60px)_rotate(-140deg)_scale(1.75)] lg:[transform:translate(-30px,60px)_rotate(-140deg)_scale(2.0)]"
              >
                <Image
                  src="/quality/images/paper_clip_outline_4.webp"
                  alt=""
                  width={64}
                  height={64}
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
          </div>

          <div
            ref={lowQualityRef}
            className="relative group cursor-pointer opacity-0 overflow-visible -mt-12 order-1 md:order-2 z-10 md:z-10 will-change-[opacity]"
            onClick={() => handleModeSelect('low')}
          >
            <div
              className="relative w-[280px] h-[280px] md:w-[360px] md:h-[360px] lg:w-[420px] lg:h-[420px] -rotate-[1deg] hover:scale-105 hover:rotate-0 transition-all duration-300 ease-out overflow-visible will-change-transform"
            >
              <Image
                src="/quality/images/sticky_quality_outline_2.webp"
                alt="Low Quality"
                width={420}
                height={420}
                className="overflow-visible absolute inset-0 w-full h-full object-cover brightness-[1.05] saturate-[1.2] contrast-[1.05]"
                priority
              />
              <div className={`absolute inset-0 flex flex-col items-center justify-center px-6 md:px-10 py-10 md:py-16 text-gray-800 ${frederickaFont.className} leading-relaxed pointer-events-none z-10`}>
                <div className="text-2xl md:text-[2.4rem] lg:text-[2.75rem] font-bold mb-3 md:mb-6 tracking-wider md:text-stroke-white text-stroke-white-sm drop-shadow-lg text-[#2c1810] whitespace-nowrap">
                  Low Quality
                </div>
                <div className="text-base md:text-lg lg:text-lg text-center space-y-1 md:space-y-2 tracking-wider text-stroke-white-xs drop-shadow-lg text-[#2c1810]">
                  <div>Static Images</div>
                  <div>Reduced Effects</div>
                  <div>Optimized Performance</div>
                </div>
              </div>
              <div
                className="absolute -bottom-4 -left-4 w-20 h-20 z-[202] pointer-events-none [transform:translate(220px,-30px)_rotate(130deg)_scale(1.3)] md:[transform:translate(280px,-35px)_rotate(130deg)_scale(1.6)] lg:[transform:translate(350px,-40px)_rotate(130deg)_scale(2.0)]"
              >
                <Image
                  src="/quality/images/clip_2_outline.webp"
                  alt=""
                  width={80}
                  height={80}
                  className="w-full h-full object-contain"
                />
              </div>
              <div
                className="absolute -top-4 -left-4 w-16 h-16 z-[202] pointer-events-none [transform:translate(30px,30px)_rotate(35deg)_scale(1.8)] md:[transform:translate(45px,40px)_rotate(35deg)_scale(2.1)] lg:[transform:translate(60px,50px)_rotate(35deg)_scale(2.4)]"
              >
                <Image
                  src="/quality/images/paper_clip_outline_6.webp"
                  alt=""
                  width={64}
                  height={64}
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

        <HelperText ref={helperTextRef} />
        <SocialLinks ref={socialsRef} />
      </div>
    </>
  )
}
