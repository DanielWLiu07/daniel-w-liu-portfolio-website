'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { usePerformanceMode } from '@/contexts/performance-mode-context'
import { AlphaVideo } from '@/components/ui/alpha-video'

function MobileSvgMask() {
  return (
    <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" className="absolute inset-0 pointer-events-none">
      <defs>
        <filter id="mobileAboutBgFilter">
          <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="3" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G">
            <animate attributeName="scale" values="200;490" dur="2.5s" begin="0s" calcMode="linear" fill="freeze" />
          </feDisplacementMap>
        </filter>
        <mask id="mobileAboutBgMask">
          <rect x="0" y="0" width="100%" height="100%" fill="white" />
          <circle cx="80%" cy="40%" r="100%" fill="black" filter="url(#mobileAboutBgFilter)">
            <animate attributeName="r" values="100%;0%" dur="2.5s" begin="0s" calcMode="linear" fill="freeze" />
          </circle>
        </mask>
      </defs>
      <foreignObject width="100%" height="100%" mask="url(#mobileAboutBgMask)" style={{ pointerEvents: 'none' }}>
        <div className="relative w-full h-full pointer-events-none">
          <Image src="/about/images/right_graphics.webp" alt="" fill className="object-cover object-right-top" priority />
        </div>
      </foreignObject>
    </svg>
  )
}

function LowPerformanceMobile({ scrollHeight }: { scrollHeight: number }) {
  return (
    <>
      <section className="min-[1038px]:hidden relative h-screen pointer-events-none">
        <Image src="/animation_frames/watercolour_sequences/portrait_vid/render_compositing_080.webp" alt="" fill className="object-cover object-[12%_100%] min-[530px]:object-[10%_100%] z-0" />
        <Image src="/animation_frames/watercolour_sequences/sparkle_loop_vid/render_compositing_250.webp" alt="" fill className="object-cover object-[12%_100%] min-[530px]:object-[10%_100%] z-10" />
      </section>
      <section className="min-[1038px]:hidden absolute inset-x-0 top-[100vh] h-20 z-[8] -translate-y-[40%] pointer-events-none">
        <div className="w-full h-full bg-cover bg-center gradient-mask-vertical bg-[url('/about/images/bg.webp')]" />
      </section>
      <section className="min-[1038px]:hidden relative pointer-events-none" style={{ height: `${scrollHeight}vh` }}>
        <div className="sticky top-0 h-screen">
          <Image src="/animation_frames/watercolour_sequences/colour_vid_phone/render_compositing_080.webp" alt="" fill className="object-cover object-right" />
          <MobileSvgMask />
        </div>
      </section>
    </>
  )
}

function HighPerformanceMobile({ scrollHeight }: { scrollHeight: number }) {
  const [sparkleDone, setSparkleDone] = useState(false)
  const sparkleBeingRef = useRef<HTMLVideoElement>(null)
  const loopVideoRef = useRef<HTMLVideoElement>(null)

  const handleSparkleEnd = useCallback(() => {
    setSparkleDone(true)
    loopVideoRef.current?.play().catch(() => {})
  }, [])

  useEffect(() => {
    // Manually play videos on mount
    sparkleBeingRef.current?.play().catch(() => {})
  }, [])

  return (
    <>
      <section className="min-[1038px]:hidden relative h-screen z-[5] pointer-events-none">
        <video autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover object-[12%_100%] min-[530px]:object-[10%_100%] z-0" preload="auto">
          <source src="/about/videos/water_colour.webm" type="video/webm" />
        </video>
        <AlphaVideo
          ref={sparkleBeingRef}
          src="/about/videos/sparkle_being"
          query="?v=3"
          fallbackImage="/animation_frames/watercolour_sequences/sparkle_being_vid/render_compositing_047.webp"
          muted
          playsInline
          onEnded={handleSparkleEnd}
          className={`absolute inset-0 w-full h-full object-cover object-[12%_100%] min-[530px]:object-[10%_100%] z-10 ${sparkleDone ? 'hidden' : ''}`}
          preload="auto"
        />
        <AlphaVideo
          ref={loopVideoRef}
          src="/about/videos/sparkle_loop"
          query="?v=3"
          fallbackImage="/animation_frames/watercolour_sequences/sparkle_loop_vid/render_compositing_250.webp"
          loop
          muted
          playsInline
          className={`absolute inset-0 w-full h-full object-cover object-[12%_100%] min-[530px]:object-[10%_100%] z-10 ${sparkleDone ? '' : 'hidden'}`}
          preload="auto"
        />
      </section>
      <section className="min-[1038px]:hidden absolute inset-x-0 top-[100vh] h-20 z-[8] -translate-y-[40%] pointer-events-none">
        <div className="w-full h-full bg-cover bg-center gradient-mask-vertical bg-[url('/about/images/bg.webp')]" />
      </section>
      <section className="min-[1038px]:hidden relative pointer-events-none" style={{ height: `${scrollHeight}vh` }}>
        <div className="sticky top-0 h-screen">
          <video autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover object-right" preload="none">
            <source src="/about/videos/right_colour_phone.webm" type="video/webm" />
          </video>
          <MobileSvgMask />
        </div>
      </section>
    </>
  )
}

export function MobileBackground({ scrollHeight = 300 }: { scrollHeight?: number }) {
  const { isLowPerformance } = usePerformanceMode()

  return (
    <>
      <div className="min-[1038px]:hidden fixed inset-0 z-0 pointer-events-none">
        <Image src="/about/images/bg.webp" alt="" fill className="object-cover" priority />
      </div>
      {isLowPerformance ? <LowPerformanceMobile scrollHeight={scrollHeight} /> : <HighPerformanceMobile scrollHeight={scrollHeight} />}
    </>
  )
}
