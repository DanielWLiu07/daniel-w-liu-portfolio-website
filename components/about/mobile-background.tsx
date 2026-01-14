'use client'

import { useState } from 'react'
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

function LowPerformanceMobile() {
  return (
    <>
      <section className="md:hidden relative h-screen">
        <Image src="/animation_frames/watercolour_sequences/portrait_vid/render_compositing_080.png" alt="" fill className="object-cover object-[10%_100%] z-0" />
        <Image src="/animation_frames/watercolour_sequences/sparkle_loop_vid/render_compositing_250.png" alt="" fill className="object-cover object-[10%_100%] z-10" />
      </section>
      <section className="md:hidden relative h-[300vh]">
        <div className="sticky top-0 h-screen">
          <Image src="/animation_frames/watercolour_sequences/colour_vid_phone/render_compositing_080.png" alt="" fill className="object-cover object-right" />
          <MobileSvgMask />
        </div>
      </section>
    </>
  )
}

function HighPerformanceMobile() {
  const [sparkleDone, setSparkleDone] = useState(false)

  return (
    <>
      <section className="md:hidden relative h-screen">
        <video autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover object-[10%_100%] z-0" preload="none">
          <source src="/about/videos/water_colour.mov" type='video/mp4; codecs="hvc1"' />
          <source src="/about/videos/water_colour.webm" type="video/webm" />
        </video>
        {!sparkleDone ? (
          <video autoPlay muted playsInline onEnded={() => setSparkleDone(true)} className="absolute inset-0 w-full h-full object-cover object-[10%_100%] z-10" preload="none">
            <source src="/about/videos/sparkle_being.mov" type='video/mp4; codecs="hvc1"' />
            <source src="/about/videos/sparkle_being.webm" type="video/webm" />
          </video>
        ) : (
          <video autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover object-[10%_100%] z-10" preload="none">
            <source src="/about/videos/sparkle_loop.mov" type='video/mp4; codecs="hvc1"' />
            <source src="/about/videos/sparkle_loop.webm?v=2" type="video/webm" />
          </video>
        )}
      </section>
      <section className="md:hidden relative h-[300vh]">
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

export function MobileBackground() {
  const { isLowPerformance } = usePerformanceMode()

  return (
    <>
      <div className="md:hidden fixed inset-0 z-0">
        <Image src="/about/images/bg.png" alt="" fill className="object-cover" priority />
      </div>
      {isLowPerformance ? <LowPerformanceMobile /> : <HighPerformanceMobile />}
    </>
  )
}
