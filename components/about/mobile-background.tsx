'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { usePerformanceMode } from '@/contexts/performance-mode-context'

function MobileSvgMask() {
  return (
    <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" className="absolute inset-0">
      <defs>
        <filter id="mobileAboutBgFilter">
          <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="2" result="noise" />
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
      <foreignObject width="100%" height="100%" mask="url(#mobileAboutBgMask)">
        <div className="relative w-full h-full">
          <Image src="/about/images/right_graphics.png" alt="" fill className="object-cover object-right-top" priority />
        </div>
      </foreignObject>
    </svg>
  )
}

function LowPerformanceMobile({ scrollHeight }: { scrollHeight: number }) {
  return (
    <>
      <section className="min-[1038px]:hidden relative h-screen">
        <Image src="/animation_frames/watercolour_sequences/portrait_vid/render_compositing_080.png" alt="" fill className="object-cover object-[12%_100%] min-[530px]:object-[10%_100%] z-0" />
        <Image src="/animation_frames/watercolour_sequences/sparkle_loop_vid/render_compositing_250.png" alt="" fill className="object-cover object-[12%_100%] min-[530px]:object-[10%_100%] z-10" />
      </section>
      <section className="min-[1038px]:hidden absolute inset-x-0 top-[100vh] h-20 z-[8] -translate-y-[40%]">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: 'url(/about/images/bg.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 30%, black 70%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 30%, black 70%, transparent 100%)'
          }}
        />
      </section>
      <section className="min-[1038px]:hidden relative" style={{ height: `${scrollHeight}vh` }}>
        <div className="sticky top-0 h-screen">
          <Image src="/animation_frames/watercolour_sequences/colour_vid_phone/render_compositing_080.png" alt="" fill className="object-cover object-right" />
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
      <section className="min-[1038px]:hidden relative h-screen z-[5]">
        <video autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover object-[12%_100%] min-[530px]:object-[10%_100%] z-0" preload="auto">
          <source src="/about/videos/water_colour.mov" type='video/mp4; codecs="hvc1"' />
          <source src="/about/videos/water_colour.webm" type="video/webm" />
        </video>
        <video
          ref={sparkleBeingRef}
          muted
          playsInline
          onEnded={handleSparkleEnd}
          className={`absolute inset-0 w-full h-full object-cover object-[12%_100%] min-[530px]:object-[10%_100%] z-10 ${sparkleDone ? 'hidden' : ''}`}
          preload="auto"
        >
          <source src="/about/videos/sparkle_being.mov" type='video/mp4; codecs="hvc1"' />
          <source src="/about/videos/sparkle_being.webm" type="video/webm" />
        </video>
        <video
          ref={loopVideoRef}
          loop
          muted
          playsInline
          className={`absolute inset-0 w-full h-full object-cover object-[12%_100%] min-[530px]:object-[10%_100%] z-10 ${sparkleDone ? '' : 'hidden'}`}
          preload="auto"
        >
          <source src="/about/videos/sparkle_loop.mov" type='video/mp4; codecs="hvc1"' />
          <source src="/about/videos/sparkle_loop.webm?v=2" type="video/webm" />
        </video>
      </section>
      <section className="min-[1038px]:hidden absolute inset-x-0 top-[100vh] h-20 z-[8] -translate-y-[40%]">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: 'url(/about/images/bg.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 30%, black 70%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 30%, black 70%, transparent 100%)'
          }}
        />
      </section>
      <section className="min-[1038px]:hidden relative" style={{ height: `${scrollHeight}vh` }}>
        <div className="sticky top-0 h-screen">
          <video autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover object-right" preload="none">
            <source src="/about/videos/right_colour_phone.mov" type='video/mp4; codecs="hvc1"' />
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
      <div className="min-[1038px]:hidden fixed inset-0 z-0">
        <Image src="/about/images/bg.png" alt="" fill className="object-cover" priority />
      </div>
      {isLowPerformance ? <LowPerformanceMobile scrollHeight={scrollHeight} /> : <HighPerformanceMobile scrollHeight={scrollHeight} />}
    </>
  )
}
