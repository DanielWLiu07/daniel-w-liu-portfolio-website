'use client'

import localFont from 'next/font/local'
import { usePerformanceMode } from '@/contexts/performance-mode-context'
import Image from 'next/image'
import { useState, useEffect, useRef } from 'react'
import gsap from 'gsap'

const fredrick = localFont({
  src: '../../public/fonts/FrederickatheGreat-Regular.ttf',
})

export function ModeSelector() {
  const { mode, setMode } = usePerformanceMode()
  const [isExiting, setIsExiting] = useState(false)
  const [selected, setSelected] = useState<'high' | 'low' | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const titleRef = useRef<HTMLDivElement>(null)
  const subtitleRef = useRef<HTMLParagraphElement>(null)
  const highQualityRef = useRef<HTMLDivElement>(null)
  const lowQualityRef = useRef<HTMLDivElement>(null)
  const helperTextRef = useRef<HTMLParagraphElement>(null)
  const sticky3Ref = useRef<HTMLDivElement>(null)
  const sticky4Ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (mode !== null) return

    const ctx = gsap.context(() => {
      gsap.set(titleRef.current, { y: -30, opacity: 0 })
      gsap.set(subtitleRef.current, { y: -20, opacity: 0 })
      gsap.set(highQualityRef.current, { x: -50, y: 50, rotation: -25, opacity: 0 })
      gsap.set(lowQualityRef.current, { x: 50, y: 50, rotation: 25, opacity: 0 })
      gsap.set(sticky3Ref.current, { x: -150, y: 100, rotation: -45, opacity: 0 })
      gsap.set(sticky4Ref.current, { x: 150, y: 100, rotation: 45, opacity: 0 })
      gsap.set(helperTextRef.current, { y: 20, opacity: 0 })

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
        x: 0,
        y: 0,
        rotation: 18,
        opacity: 1,
        duration: 0.8,
      }, '-=0.7')
      .to(helperTextRef.current, {
        y: 0,
        opacity: 0.8,
        duration: 0.6,
      }, '-=0.4')
    })

    return () => ctx.revert()
  }, [mode])

  useEffect(() => {
    if (mode !== null) return

    const draggableElements = document.querySelectorAll('.draggable-graphic')

    const makeDraggable = (element: Element) => {
      const el = element as HTMLElement
      let startX = 0, startY = 0, initialX = 0, initialY = 0

      const onMouseDown = (e: MouseEvent) => {
        e.preventDefault()
        setIsDragging(true)
        startX = e.clientX
        startY = e.clientY
        const transform = window.getComputedStyle(el).transform
        if (transform !== 'none') {
          const matrix = new DOMMatrix(transform)
          initialX = matrix.m41
          initialY = matrix.m42
        } else {
          initialX = 0
          initialY = 0
        }
        document.addEventListener('mousemove', onMouseMove)
        document.addEventListener('mouseup', onMouseUp)
      }

      const onMouseMove = (e: MouseEvent) => {
        const deltaX = e.clientX - startX
        const deltaY = e.clientY - startY
        gsap.set(el, { x: initialX + deltaX, y: initialY + deltaY })
      }

      const onMouseUp = () => {
        setIsDragging(false)
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      el.addEventListener('mousedown', onMouseDown)
      return () => {
        el.removeEventListener('mousedown', onMouseDown)
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }
    }

    const cleanupFunctions = Array.from(draggableElements).map(makeDraggable)

    return () => {
      cleanupFunctions.forEach(cleanup => cleanup())
    }
  }, [mode])

  const handleModeSelect = (selectedMode: 'high' | 'low') => {
    if (isDragging) return
    setSelected(selectedMode)
    setIsExiting(true)

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
        ref={sticky3Ref}
        className="fixed left-0 top-0 h-screen opacity-0 overflow-visible pointer-events-none z-[1] -ml-80 md:-ml-20 -mt-5"
        style={{ willChange: 'opacity' }}
      >
        <Image
          src="/quality/images/selfie_outline.png"
          alt="Daniel W Liu"
          width={500}
          height={1750}
          className="h-full w-auto object-contain -scale-x-110 scale-y-110 rotate-[20deg]"
          style={{
            filter: `brightness(1.05) saturate(1.15) contrast(1.05)`
          }}
        />
      </div>

      <div
        ref={sticky4Ref}
        className="fixed right-0 top-0 h-screen opacity-0 overflow-visible pointer-events-none z-[1] -mr-80 md:-mr-20 mt-10"
        style={{ willChange: 'opacity' }}
      >
        <Image
          src="/quality/images/cat_tongue_outline.png"
          alt="Bongo"
          width={500}
          height={1750}
          className="h-full w-auto object-contain -scale-x-125 scale-y-125 -rotate-[30deg]"
          style={{
            filter: `brightness(1.05) saturate(1.15) contrast(1.05)`
          }}
        />
      </div>

      <div className="relative flex flex-col items-center justify-center gap-8 md:gap-16 w-full max-w-6xl mx-auto z-10" style={{ willChange: 'auto' }}>

        <div ref={titleRef} className="text-center space-y-2 opacity-0 relative mt-4 md:mt-0">
          <h2
            className={`text-5xl md:text-7xl text-center tracking-wider text-stroke-white drop-shadow-lg relative z-10 whitespace-nowrap ${fredrick.className}`}
            style={{ color: '#2c1810' }}
          >
            Choose Your Journey
          </h2>
          <p
            ref={subtitleRef}
            className={`text-lg md:text-xl text-center tracking-wider text-stroke-white-sm drop-shadow-lg relative z-10 opacity-0 ${fredrick.className}`}
            style={{ color: '#2c1810' }}
          >
            Every Page a New World
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start justify-center px-4 md:px-8 overflow-visible">
          <div
            ref={highQualityRef}
            className="relative group cursor-pointer opacity-0 overflow-visible -mt-5 order-2 md:order-1"
            style={{ willChange: 'opacity' }}
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
                className="overflow-visible absolute inset-0 w-full h-full object-cover"
                style={{
                  filter: `brightness(1.05) saturate(1.2) contrast(1.05)`
                }}
                priority
              />
              <div className={`absolute inset-0 flex flex-col items-center justify-center px-6 md:px-10 py-10 md:py-16 text-gray-800 ${fredrick.className} leading-relaxed pointer-events-none z-10`}>
                <div className="text-2xl md:text-[2.75rem] font-bold mb-3 md:mb-6 tracking-wide text-stroke-white" style={{ color: '#1a1410' }}>
                  High Quality
                </div>
                <div className="text-sm md:text-lg text-center font-semibold space-y-1 md:space-y-2 text-stroke-white-sm">
                  <div>✨ Smooth Animations</div>
                  <div>🎨 Full Effects</div>
                  <div>⭐ Best Experience</div>
                </div>
              </div>
            </div>
          </div>

          <div
            ref={lowQualityRef}
            className="relative group cursor-pointer opacity-0 overflow-visible -mt-5 order-1 md:order-2"
            style={{ willChange: 'opacity' }}
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
                className="overflow-visible absolute inset-0 w-full h-full object-cover"
                style={{
                  filter: `brightness(1.05) saturate(1.2) contrast(1.05)`
                }}
                priority
              />
              <div className={`absolute inset-0 flex flex-col items-center justify-center px-6 md:px-10 py-10 md:py-16 text-gray-800 ${fredrick.className} leading-relaxed pointer-events-none z-10`}>
                <div className="text-2xl md:text-[2.75rem] font-bold mb-3 md:mb-6 tracking-wide text-stroke-white" style={{ color: '#1a1410' }}>
                  Low Quality
                </div>
                <div className="text-sm md:text-lg text-center font-semibold space-y-1 md:space-y-2 text-stroke-white-sm">
                  <div>🖼️ Static Images</div>
                  <div>⚡ Reduced Effects</div>
                  <div>🚀 Optimized Performance</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p ref={helperTextRef} className={`text-xs md:text-base text-center max-w-2xl px-2 md:px-4 font-bold text-stroke-white-sm ${fredrick.className} opacity-0`} style={{ color: '#2c1810' }}>
          Don&apos;t worry, you can always change this later by returning to the landing page
        </p>
      </div>
    </div>
  )
}
