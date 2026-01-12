'use client'

import { usePerformanceMode } from '@/contexts/performance-mode-context'
import { useTransitionState } from '@/components/ui/page-transition'
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

  useEffect(() => {
    if (mode !== null) return

    const ctx = gsap.context(() => {
      gsap.set(titleRef.current, { y: -30, opacity: 0 })
      gsap.set(subtitleRef.current, { y: -20, opacity: 0 })
      gsap.set([paperClip1Ref.current, paperClip2Ref.current, paperClip3Ref.current], { opacity: 0 })
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
      .to(socialsRef.current, {
        x: 0,
        opacity: 1,
        duration: 0.8,
      }, '-=0.8')
    })

    return () => ctx.revert()
  }, [mode])

  const handleModeSelect = (selectedMode: 'high' | 'low') => {
    const exitTl = gsap.timeline({
      onComplete: () => {
        // Start transition, set mode just before reveal so landing content
        // doesn't render until the reveal animation is about to show it
        navigateWithTransition('/', () => {
          setMode(selectedMode)
        })
      }
    })

    // All elements exit at once
    exitTl.to([titleRef.current, subtitleRef.current], {
      y: -30,
      opacity: 0,
      duration: 0.5,
      ease: 'power2.in'
    }, 0)
    .to([paperClip1Ref.current, paperClip2Ref.current, paperClip3Ref.current], {
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
      opacity: 0,
      duration: 0.5,
      ease: 'power2.in'
    }, 0)
    .to(sticky4Ref.current, {
      x: window.innerWidth < 768 ? 0 : 200,
      opacity: 0,
      duration: 0.5,
      ease: 'power2.in'
    }, 0)
    .to(waterlooRef.current, {
      y: 100,
      opacity: 0,
      duration: 0.5,
      ease: 'power2.in'
    }, 0)
  }

  if (mode !== null) return null

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 md:p-8 overflow-visible">
      <div className="absolute inset-0 z-0">
        <Image
          src="/landing/images/white_paper.png"
          alt="paper background"
          fill
          className="object-cover"
          priority
        />
      </div>

      <div
        ref={paperClip1Ref}
        className="fixed left-1/2 top-1/2 w-16 h-16 z-[203] pointer-events-none opacity-0 [transform:translate(-50%,-50%)_translateX(120px)_translateY(-440px)_rotate(15deg)_scale(2.5)] md:[transform:translate(-50%,-50%)_translateX(200px)_translateY(-415px)_rotate(15deg)_scale(2.5)]"
      >
        <Image
          src="/quality/images/paper_clip_outline_1.png"
          alt=""
          width={64}
          height={64}
          className="w-full h-full object-contain"
        />
      </div>

      <div
        ref={paperClip2Ref}
        className="fixed left-1/2 top-1/2 w-16 h-16 z-[204] pointer-events-none opacity-0 [transform:translate(-50%,-50%)_translateX(-120px)_translateY(-430px)_rotate(-15deg)_scale(2.5)] md:[transform:translate(-50%,-50%)_translateX(-190px)_translateY(-390px)_rotate(-15deg)_scale(2.5)]"
      >
        <Image
          src="/quality/images/paper_clip_outline_2.png"
          alt=""
          width={64}
          height={64}
          className="w-full h-full object-contain"
        />
      </div>

      <div
        ref={paperClip3Ref}
        className="fixed left-1/2 top-1/2 w-16 h-16 z-[205] pointer-events-none opacity-0 [transform:translate(-50%,-50%)_translateY(-420px)_rotate(180deg)_scale(2.5)_scaleX(-1)] md:[transform:translate(-50%,-50%)_translateX(0px)_translateY(-360px)_rotate(180deg)_scale(2.5)_scaleX(-1)]"
      >
        <Image
          src="/quality/images/paper_clip_outline_3.png"
          alt=""
          width={64}
          height={64}
          className="w-full h-full object-contain"
        />
      </div>

      <div
        ref={sticky3Ref}
        className="fixed left-0 top-0 h-screen opacity-0 overflow-visible pointer-events-none z-[1] -ml-80 md:-ml-20 -mt-5 will-change-[opacity]"
      >
        <Image
          src="/quality/images/selfie_outline.png"
          alt="Daniel W Liu"
          width={500}
          height={1750}
          className="h-full w-auto object-contain -scale-x-110 scale-y-110 rotate-[20deg] brightness-[1.05] saturate-[1.15] contrast-[1.05]"
        />
        <div
          className="absolute top-[20%] left-[50%] w-20 h-20 z-[200] pointer-events-none [transform:translate(-220px,150px)_rotate(0deg)_scale(1.4)] md:[transform:translate(-220px,150px)_rotate(0deg)_scale(1.8)]"
        >
          <Image
            src="/quality/images/pin_outline_1.png"
            alt=""
            width={80}
            height={80}
            className="w-full h-full object-contain"
          />
        </div>
        <div
          className="absolute top-[0%] left-[15%] w-20 h-20 z-[200] pointer-events-none [transform:translate(50px,0px)_rotate(45deg)_scale(1.4)] md:[transform:translate(100px,0px)_rotate(-55deg)_scale(2.0)]"
        >
          <Image
            src="/quality/images/clip_3_outline.png"
            alt=""
            width={80}
            height={80}
            className="w-full h-full object-contain"
          />
        </div>
      </div>

      <div
        ref={waterlooRef}
        className="fixed left-[0.5%] md:left-0 bottom-15 md:bottom-0 h-[18vh] md:h-[30vh] opacity-0 overflow-visible z-[90] ml-2 mb-2 will-change-transform"
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
              src="/quality/images/waterloo_outline.png"
              alt="Waterloo"
              width={300}
              height={1200}
              className="h-full w-auto object-contain brightness-105 saturate-[1.15] contrast-105"
            />
            <div
              className="absolute top-[10%] left-[80%] w-20 h-20 z-[200] pointer-events-none [transform:translate(-20px,-30px)_rotate(85deg)_scale(0.8)] md:[transform:translate(-20px,-30px)_rotate(85deg)_scale(1)]"
            >
              <Image
                src="/quality/images/pin_outline_3.png"
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
        className="fixed right-0 top-0 h-screen opacity-0 overflow-visible pointer-events-none z-[1] -mr-80 md:-mr-20 -mt-5 will-change-[opacity]"
      >
        <Image
          src="/quality/images/cat_tongue_outline.png"
          alt="Bongo"
          width={500}
          height={1750}
          className="h-full w-auto object-contain -scale-x-110 scale-y-110 rotate-[-20deg] brightness-[1.05] saturate-[1.15] contrast-[1.05]"
        />
        <div
          className="absolute top-[20%] right-[50%] w-20 h-20 z-[201] pointer-events-none [transform:translate(-50px,-150px)_rotate(-40deg)_scale(1.4)] md:[transform:translate(-50px,-150px)_rotate(-40deg)_scale(1.8)]"
        >
          <Image
            src="/quality/images/pin_outline_2.png"
            alt=""
            width={80}
            height={80}
            className="w-full h-full object-contain"
          />
        </div>
        <div
          className="absolute top-[35%] right-[80%] w-16 h-16 z-[201] pointer-events-none [transform:translate(250px,60px)_rotate(-80deg)_scale(2)] md:[transform:translate(500px,130px)_rotate(-80deg)_scale(2.0)]"
        >
          <Image
            src="/quality/images/paper_clip_outline_5.png"
            alt=""
            width={64}
            height={64}
            className="w-full h-full object-contain"
          />
        </div>
        <div
          className="absolute top-[35%] right-[80%] w-16 h-16 z-[201] pointer-events-none [transform:translate(270px,140px)_rotate(-80deg)_scale(2.4)] md:[transform:translate(550px,220px)_rotate(-80deg)_scale(2.5)]"
        >
          <Image
            src="/quality/images/paper_clip_outline_7.png"
            alt=""
            width={64}
            height={64}
            className="w-full h-full object-contain"
          />
        </div>
        <div
          className="absolute top-[5%] right-[40%] w-20 h-20 z-[201] pointer-events-none [transform:translate(50px,50px)_rotate(60deg)_scale(1.4)] md:[transform:translate(170px,80px)_rotate(-130deg)_scale(2.0)]"
        >
          <Image
            src="/quality/images/clip_4_outline.png"
            alt=""
            width={80}
            height={80}
            className="w-full h-full object-contain"
          />
        </div>
      </div>

      <div className="relative flex flex-col items-center justify-center gap-16 md:gap-16 w-full max-w-6xl mx-auto z-10 will-change-auto">

        <div ref={titleRef} className="text-center space-y-2 opacity-0 relative -mt-15 md:mt-0">
          <h2
            className={`text-4xl md:text-7xl text-center tracking-wider md:text-stroke-white text-stroke-white-sm drop-shadow-lg relative z-10 whitespace-nowrap text-[#2c1810] ${frederickaFont.className}`}
          >
            Choose Your Journey
          </h2>
          <p
            ref={subtitleRef}
            className={`text-lg md:text-xl text-center tracking-wider text-stroke-white-xs drop-shadow-lg relative z-10 opacity-0 text-[#2c1810] ${frederickaFont.className}`}
          >
            Every Page a New World
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start justify-center px-4 md:px-8 overflow-visible">
          <div
            ref={highQualityRef}
            className="relative group cursor-pointer opacity-0 overflow-visible -mt-18 order-2 md:order-1 will-change-[opacity]"
            onClick={() => handleModeSelect('high')}
          >
            <div
              className="relative w-[280px] h-[280px] md:w-[420px] md:h-[420px] rotate-[1deg] hover:scale-105 hover:rotate-0 transition-all duration-300 ease-out overflow-visible will-change-transform"
            >
              <Image
                src="/quality/images/sticky_quality_outline_1.png"
                alt="High Quality"
                width={420}
                height={420}
                className="overflow-visible absolute inset-0 w-full h-full object-cover brightness-[1.05] saturate-[1.2] contrast-[1.05]"
                priority
              />
              <div className={`absolute inset-0 flex flex-col items-center justify-center px-6 md:px-10 py-10 md:py-16 text-gray-800 ${frederickaFont.className} leading-relaxed pointer-events-none z-10`}>
                <div className="text-2xl md:text-[2.75rem] font-bold mb-3 md:mb-6 tracking-wider md:text-stroke-white text-stroke-white-sm drop-shadow-lg text-[#2c1810]">
                  High Quality
                </div>
                <div className="text-sm md:text-lg text-center space-y-1 md:space-y-2 tracking-wider text-stroke-white-xs drop-shadow-lg text-[#2c1810]">
                  <div>Smooth Animations</div>
                  <div>Full Effects</div>
                  <div>Best Experience</div>
                </div>
              </div>
              <div
                className="absolute -bottom-4 -left-4 w-20 h-20 z-[206] pointer-events-none [transform:translate(10px,40px)_rotate(35deg)_scale(1.6)] md:[transform:translate(10px,40px)_rotate(35deg)_scale(2.2)]"
              >
                <Image
                  src="/quality/images/clip_1_outline.png"
                  alt=""
                  width={80}
                  height={80}
                  className="w-full h-full object-contain"
                />
              </div>
              <div
                className="absolute -top-10 md:-top-4 -right-8 md:-right-4 w-16 h-16 z-[206] pointer-events-none [transform:translate(-30px,60px)_rotate(-140deg)_scale(1.5)] md:[transform:translate(-30px,60px)_rotate(-140deg)_scale(2.0)]"
              >
                <Image
                  src="/quality/images/paper_clip_outline_4.png"
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
            className="relative group cursor-pointer opacity-0 overflow-visible -mt-12 order-1 md:order-2 will-change-[opacity]"
            onClick={() => handleModeSelect('low')}
          >
            <div
              className="relative w-[280px] h-[280px] md:w-[420px] md:h-[420px] -rotate-[1deg] hover:scale-105 hover:rotate-0 transition-all duration-300 ease-out overflow-visible will-change-transform"
            >
              <Image
                src="/quality/images/sticky_quality_outline_2.png"
                alt="Low Quality"
                width={420}
                height={420}
                className="overflow-visible absolute inset-0 w-full h-full object-cover brightness-[1.05] saturate-[1.2] contrast-[1.05]"
                priority
              />
              <div className={`absolute inset-0 flex flex-col items-center justify-center px-6 md:px-10 py-10 md:py-16 text-gray-800 ${frederickaFont.className} leading-relaxed pointer-events-none z-10`}>
                <div className="text-2xl md:text-[2.75rem] font-bold mb-3 md:mb-6 tracking-wider md:text-stroke-white text-stroke-white-sm drop-shadow-lg text-[#2c1810]">
                  Low Quality
                </div>
                <div className="text-sm md:text-lg text-center space-y-1 md:space-y-2 tracking-wider text-stroke-white-xs drop-shadow-lg text-[#2c1810]">
                  <div>Static Images</div>
                  <div>Reduced Effects</div>
                  <div>Optimized Performance</div>
                </div>
              </div>
              <div
                className="absolute -bottom-4 -left-4 w-20 h-20 z-[202] pointer-events-none [transform:translate(220px,-30px)_rotate(130deg)_scale(1.3)] md:[transform:translate(350px,-40px)_rotate(130deg)_scale(2.0)]"
              >
                <Image
                  src="/quality/images/clip_2_outline.png"
                  alt=""
                  width={80}
                  height={80}
                  className="w-full h-full object-contain"
                />
              </div>
              <div
                className="absolute -top-4 -left-4 w-16 h-16 z-[202] pointer-events-none [transform:translate(30px,30px)_rotate(35deg)_scale(1.8)] md:[transform:translate(60px,50px)_rotate(35deg)_scale(2.4)]"
              >
                <Image
                  src="/quality/images/paper_clip_outline_6.png"
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
  )
}
