'use client'

import localFont from 'next/font/local'
import { usePerformanceMode } from '@/contexts/performance-mode-context'
import Image from 'next/image'
import { useState, useEffect, useRef } from 'react'
import gsap from 'gsap'

const SOCIAL_LINKS = [
  { href: "https://github.com/DanielWLiu07", label: "GitHub", image: "/about/images/github.png" },
  { href: "https://www.linkedin.com/in/danielliu2007/", label: "LinkedIn", image: "/about/images/linkedln.png" },
  { href: "https://docs.google.com/forms/d/e/1FAIpQLSdsaj2nXuReGTo1Fu9PaW7jsxUZPpPAiCMuf0gBvmZBYFe1nw/viewform?usp=dialog", label: "Email", image: "/about/images/gmail.png" },
]

const fredrick = localFont({
  src: '../../public/fonts/FrederickatheGreat-Regular.ttf',
})

const DECORATIONS = {
  pin1: { x: 0, y: 0, rotation: 0, scale: 1.8 },
  pin2: { x: 0, y: 0, rotation: -40, scale: 1.8 },
  pin3: { x: 375, y: 151, rotation: 45, scale: 1.6 },
  paperClip1: { x: 140, y: -400, rotation: 15, scale: 2.5 },
  paperClip2: { x: -140, y: -370, rotation: -15, scale: 2.5 },
  paperClip3: { x: 0, y: -340, rotation: 180, scale: 2.5 },
  clip1: { x: 20, y: 60, rotation: 35, scale: 2.2 },
} as const

export function ModeSelector() {
  const { mode, setMode } = usePerformanceMode()
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setIsMobile(window.innerWidth < 768)
  }, [])

  const titleRef = useRef<HTMLDivElement>(null)
  const subtitleRef = useRef<HTMLParagraphElement>(null)
  const highQualityRef = useRef<HTMLDivElement>(null)
  const lowQualityRef = useRef<HTMLDivElement>(null)
  const helperTextRef = useRef<HTMLParagraphElement>(null)
  const sticky3Ref = useRef<HTMLDivElement>(null)
  const sticky4Ref = useRef<HTMLDivElement>(null)
  const waterlooRef = useRef<HTMLDivElement>(null)
  const socialsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (mode !== null) return

    const ctx = gsap.context(() => {
      gsap.set(titleRef.current, { y: -30, opacity: 0 })
      gsap.set(subtitleRef.current, { y: -20, opacity: 0 })
      gsap.set(highQualityRef.current, { x: -50, y: 50, rotation: -25, opacity: 0 })
      gsap.set(lowQualityRef.current, { x: 50, y: 50, rotation: 25, opacity: 0 })
      gsap.set(sticky3Ref.current, { x: -150, y: 100, rotation: -45, opacity: 0 })
      gsap.set(sticky4Ref.current, { x: 150, y: 100, rotation: 45, opacity: 0 })
      gsap.set(waterlooRef.current, { x: -300, y: 300, rotation: -70, opacity: 0 })
      gsap.set(helperTextRef.current, { y: 20, opacity: 0 })
      gsap.set(socialsRef.current, { x: 100, y: 50, rotation: 25, opacity: 0 })

      const tl = gsap.timeline({ defaults: { ease: 'back.out(1.2)' } })

      tl.to(titleRef.current, {
        y: 0,
        opacity: 1,
        duration: 0.8,
      })
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
      .to(sticky4Ref.current, {
        x: -10,
        y: 30,
        rotation: 15,
        opacity: 1,
        duration: 0.8,
      }, '-=0.7')
      .to(helperTextRef.current, {
        y: 0,
        opacity: 0.8,
        duration: 0.6,
      }, '-=0.4')
      .to(socialsRef.current, {
        x: 0,
        y: 0,
        rotation: 0,
        opacity: 1,
        duration: 0.8,
        ease: 'back.out(1.2)'
      }, '-=0.6')
    })

    return () => ctx.revert()
  }, [mode])


  const handleModeSelect = (selectedMode: 'high' | 'low') => {
    const exitTl = gsap.timeline({
      onComplete: () => {
        setTimeout(() => setMode(selectedMode), 300)
      }
    })

    if (selectedMode === 'high') {
      exitTl.to(highQualityRef.current, {
        x: 0,
        rotation: 0,
        scale: 1.15,
        duration: 0.6,
        ease: 'power2.out'
      })
      .to(lowQualityRef.current, {
        x: window.innerWidth < 768 ? 0 : 400,
        rotation: 90,
        opacity: 0,
        duration: 0.6,
        ease: 'power2.in'
      }, '-=0.6')
      .to(sticky4Ref.current, {
        x: window.innerWidth < 768 ? 0 : 500,
        rotation: 120,
        opacity: 0,
        duration: 0.7,
        ease: 'power2.in'
      }, '-=0.6')
      .to(sticky3Ref.current, {
        x: window.innerWidth < 768 ? 0 : -500,
        rotation: -120,
        opacity: 0,
        duration: 0.7,
        ease: 'power2.in'
      }, '-=0.7')
      .to(waterlooRef.current, {
        x: -300,
        y: 300,
        rotation: -90,
        opacity: 0,
        duration: 0.7,
        ease: 'power2.in'
      }, '-=0.7')
      .to(highQualityRef.current, {
        scale: 1.8,
        opacity: 0,
        duration: 0.5,
        ease: 'power2.in'
      })
    } else {
      exitTl.to(lowQualityRef.current, {
        x: 0,
        rotation: 0,
        scale: 1.15,
        duration: 0.6,
        ease: 'power2.out'
      })
      .to(highQualityRef.current, {
        x: window.innerWidth < 768 ? 0 : -400,
        rotation: -90,
        opacity: 0,
        duration: 0.6,
        ease: 'power2.in'
      }, '-=0.6')
      .to(sticky3Ref.current, {
        x: window.innerWidth < 768 ? 0 : -500,
        rotation: -120,
        opacity: 0,
        duration: 0.7,
        ease: 'power2.in'
      }, '-=0.6')
      .to(waterlooRef.current, {
        x: -300,
        y: 300,
        rotation: -90,
        opacity: 0,
        duration: 0.7,
        ease: 'power2.in'
      }, '-=0.7')
      .to(sticky4Ref.current, {
        x: window.innerWidth < 768 ? 0 : 500,
        rotation: 120,
        opacity: 0,
        duration: 0.7,
        ease: 'power2.in'
      }, '-=0.7')
      .to(lowQualityRef.current, {
        scale: 1.8,
        opacity: 0,
        duration: 0.5,
        ease: 'power2.in'
      })
    }

    exitTl.to([titleRef.current, subtitleRef.current], {
      y: -30,
      opacity: 0,
      duration: 0.4,
      ease: 'power2.in'
    }, '-=0.5')
    .to(socialsRef.current, {
      x: 100,
      y: 50,
      rotation: 25,
      opacity: 0,
      duration: 0.5,
      ease: 'power2.in'
    }, '-=0.5')
    .to(helperTextRef.current, {
      y: 30,
      opacity: 0,
      duration: 0.4,
      ease: 'power2.in'
    }, '-=0.4')
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
        className="fixed left-1/2 top-1/2 w-16 h-16 z-[203] pointer-events-none"
        style={{
          transform: `translate(-50%, -50%) translate(${DECORATIONS.paperClip1.x + (!isMobile ? 60 : 0)}px, ${DECORATIONS.paperClip1.y + (isMobile ? -20 : 0)}px) rotate(${DECORATIONS.paperClip1.rotation}deg) scale(${DECORATIONS.paperClip1.scale})`
        }}
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
        className="fixed left-1/2 top-1/2 w-16 h-16 z-[204] pointer-events-none"
        style={{
          transform: `translate(-50%, -50%) translate(${DECORATIONS.paperClip2.x + (!isMobile ? -60 : 0)}px, ${DECORATIONS.paperClip2.y + (isMobile ? -50 : 0)}px) rotate(${DECORATIONS.paperClip2.rotation}deg) scale(${DECORATIONS.paperClip2.scale})`
        }}
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
        className="fixed left-1/2 top-1/2 w-16 h-16 z-[205] pointer-events-none"
        style={{
          transform: `translate(-50%, -50%) translate(${DECORATIONS.paperClip3.x}px, ${DECORATIONS.paperClip3.y + (isMobile ? -50 : 0)}px) rotate(${DECORATIONS.paperClip3.rotation}deg) scale(${DECORATIONS.paperClip3.scale}) scaleX(-1)`
        }}
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
          className="absolute top-[20%] left-[50%] w-20 h-20 z-[200] pointer-events-none"
          style={{
            transform: `translate(${DECORATIONS.pin1.x}px, ${DECORATIONS.pin1.y}px) rotate(${DECORATIONS.pin1.rotation}deg) scale(${DECORATIONS.pin1.scale})`
          }}
        >
          <Image
            src="/quality/images/pin_outline_1.png"
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
          <div className="h-full w-full transition-transform duration-300 ease-out group-hover:scale-110 -rotate-[35deg]">
            <Image
              src="/quality/images/waterloo_outline.png"
              alt="Waterloo"
              width={300}
              height={1200}
              className="h-full w-auto object-contain brightness-105 saturate-[1.15] contrast-105"
            />
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
          className="absolute top-[20%] right-[50%] w-20 h-20 z-[201] pointer-events-none"
          style={{
            transform: `translate(${DECORATIONS.pin2.x}px, ${DECORATIONS.pin2.y}px) rotate(${DECORATIONS.pin2.rotation}deg) scale(${DECORATIONS.pin2.scale})`
          }}
        >
          <Image
            src="/quality/images/pin_outline_2.png"
            alt=""
            width={80}
            height={80}
            className="w-full h-full object-contain"
          />
        </div>
      </div>

      <div className="relative flex flex-col items-center justify-center gap-8 md:gap-16 w-full max-w-6xl mx-auto z-10 will-change-auto">

        <div ref={titleRef} className="text-center space-y-2 opacity-0 relative mt-4 md:mt-0">
          <h2
            className={`text-4xl md:text-7xl text-center tracking-wider md:text-stroke-white text-stroke-white-sm drop-shadow-lg relative z-10 whitespace-nowrap text-[#2c1810] ${fredrick.className}`}
          >
            Choose Your Journey
          </h2>
          <p
            ref={subtitleRef}
            className={`text-lg md:text-xl text-center tracking-wider text-stroke-white-xs drop-shadow-lg relative z-10 opacity-0 text-[#2c1810] ${fredrick.className}`}
          >
            Every Page a New World
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start justify-center px-4 md:px-8 overflow-visible">
          <div
            ref={highQualityRef}
            className="relative group cursor-pointer opacity-0 overflow-visible -mt-5 order-2 md:order-1 will-change-[opacity]"
            onClick={() => handleModeSelect('high')}
          >
            <div
              className="relative w-[280px] h-[280px] md:w-[420px] md:h-[420px] -rotate-[5deg] hover:scale-105 hover:rotate-0 transition-all duration-300 ease-out overflow-visible will-change-transform"
            >
              <Image
                src="/quality/images/sticky_quality_outline_1.png"
                alt="High Quality"
                width={420}
                height={420}
                className="overflow-visible absolute inset-0 w-full h-full object-cover brightness-[1.05] saturate-[1.2] contrast-[1.05]"
                priority
              />
              <div className={`absolute inset-0 flex flex-col items-center justify-center px-6 md:px-10 py-10 md:py-16 text-gray-800 ${fredrick.className} leading-relaxed pointer-events-none z-10`}>
                <div className="text-2xl md:text-[2.75rem] font-bold mb-3 md:mb-6 tracking-wide text-stroke-white text-[#1a1410]">
                  High Quality
                </div>
                <div className="text-sm md:text-lg text-center font-semibold space-y-1 md:space-y-2 text-stroke-white-sm">
                  <div>Smooth Animations</div>
                  <div>Full Effects</div>
                  <div>Best Experience</div>
                </div>
              </div>
              <div
                className="absolute -bottom-4 -left-4 w-20 h-20 z-[206] pointer-events-none"
                style={{
                  transform: `translate(${DECORATIONS.clip1.x}px, ${DECORATIONS.clip1.y}px) rotate(${DECORATIONS.clip1.rotation}deg) scale(${DECORATIONS.clip1.scale})`
                }}
              >
                <Image
                  src="/quality/images/clip_1_outline.png"
                  alt=""
                  width={80}
                  height={80}
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
          </div>

          <div
            ref={lowQualityRef}
            className="relative group cursor-pointer opacity-0 overflow-visible -mt-5 order-1 md:order-2 will-change-[opacity]"
            onClick={() => handleModeSelect('low')}
          >
            <div
              className="relative w-[280px] h-[280px] md:w-[420px] md:h-[420px] rotate-[4deg] hover:scale-105 hover:rotate-0 transition-all duration-300 ease-out overflow-visible will-change-transform"
            >
              <Image
                src="/quality/images/sticky_quality_outline_2.png"
                alt="Low Quality"
                width={420}
                height={420}
                className="overflow-visible absolute inset-0 w-full h-full object-cover brightness-[1.05] saturate-[1.2] contrast-[1.05]"
                priority
              />
              <div className={`absolute inset-0 flex flex-col items-center justify-center px-6 md:px-10 py-10 md:py-16 text-gray-800 ${fredrick.className} leading-relaxed pointer-events-none z-10`}>
                <div className="text-2xl md:text-[2.75rem] font-bold mb-3 md:mb-6 tracking-wide text-stroke-white text-[#1a1410]">
                  Low Quality
                </div>
                <div className="text-sm md:text-lg text-center font-semibold space-y-1 md:space-y-2 text-stroke-white-sm">
                  <div>Static Images</div>
                  <div>Reduced Effects</div>
                  <div>Optimized Performance</div>
                </div>
              </div>
              <div
                className="absolute -bottom-4 -right-4 w-20 h-20 z-[202] pointer-events-none"
                style={{
                  transform: `translate(${DECORATIONS.pin3.x}px, ${DECORATIONS.pin3.y}px) rotate(${DECORATIONS.pin3.rotation}deg) scale(${DECORATIONS.pin3.scale})`
                }}
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
          </div>
        </div>
      </div>

      <div
        ref={helperTextRef}
        className="fixed bottom-8 left-0 right-0 z-[100] flex items-center justify-center px-4 opacity-0"
      >
        <p
          className={`text-xs md:text-base text-center max-w-[90%] md:max-w-2xl font-bold text-stroke-white-sm text-[#2c1810] ${fredrick.className}`}
        >
          Don&apos;t worry, you can always change this later by returning to the landing page
        </p>
      </div>

      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" className="fixed inset-0 z-[80] pointer-events-none">
        <foreignObject width="100%" height="100%">
          <div ref={socialsRef} className="fixed bottom-20 md:bottom-4 right-4 flex flex-col md:flex-row gap-4 pointer-events-auto opacity-0 origin-center">
            {SOCIAL_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="relative w-14 h-14 transition-all hover:scale-110 duration-200 bg-white/80 rounded-lg p-2 border-2 border-gray-800"
                aria-label={link.label}
              >
                <Image
                  src={link.image}
                  alt={link.label}
                  fill
                  className="object-contain p-1"
                />
              </a>
            ))}
          </div>
        </foreignObject>
      </svg>

    </div>
  )
}
