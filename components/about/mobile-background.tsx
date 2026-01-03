'use client'

import { useState } from 'react'
import Image from 'next/image'

export function MobileBackground() {
  const [sparkleDone, setSparkleDone] = useState(false)

  return (
    <>
      <div className="md:hidden fixed inset-0 z-0">
        <Image src="/about/images/bg.png" alt="Background" fill className="object-cover" priority />
      </div>

      <section className="md:hidden relative h-screen">
        <video src="/about/videos/water_colour.webm" autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover object-[10%_100%] z-0" preload="none" />
        {!sparkleDone ? (
          <video src="/about/videos/sparkle_being.webm" autoPlay muted playsInline onEnded={() => setSparkleDone(true)} className="absolute inset-0 w-full h-full object-cover object-[10%_100%] z-10" preload="none" />
        ) : (
          <video src="/about/videos/sparkle_loop.webm?v=2" autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover object-[10%_100%] z-10" preload="none" />
        )}
      </section>

      <section className="md:hidden relative h-[300vh]">
        <div className="sticky top-0 h-screen">
          <video src="/about/videos/right_colour_phone.webm" autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover object-right" preload="none" />
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" className="absolute inset-0">
            <defs>
              <filter id="aboutBgFilter">
                <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="4" result="noise" />
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G">
                  <animate
                    attributeName="scale"
                    values="200;490"
                    dur="2.5s"
                    begin="0s"
                    calcMode="linear"
                    fill="freeze"
                  />
                </feDisplacementMap>
              </filter>
              <mask id="aboutBgMask">
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                <circle cx="80%" cy="40%" r="100%" fill="black" filter="url(#aboutBgFilter)">
                  <animate
                    attributeName="r"
                    values="100%;0%"
                    dur="2.5s"
                    begin="0s"
                    calcMode="linear"
                    fill="freeze"
                  />
                </circle>
              </mask>
              <filter id="socialFilter">
                <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="4" result="noise" />
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G">
                  <animate
                    attributeName="scale"
                    values="200;490"
                    dur="2.5s"
                    begin="0.5s"
                    calcMode="linear"
                    fill="freeze"
                  />
                </feDisplacementMap>
              </filter>
              <mask id="socialMask">
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                <circle cx="80%" cy="40%" r="100%" fill="black" filter="url(#socialFilter)">
                  <animate
                    attributeName="r"
                    values="100%;0%"
                    dur="2.5s"
                    begin="0.5s"
                    calcMode="linear"
                    fill="freeze"
                  />
                </circle>
              </mask>
            </defs>
            <foreignObject width="100%" height="100%" mask="url(#aboutBgMask)">
              <div className="relative w-full h-full">
                <Image src="/about/images/right_graphics.png" alt="Water Colour Graphics" fill className="right-graphics object-cover object-right-top" priority />
              </div>
            </foreignObject>
          </svg>
        </div>
      </section>
    </>
  )
}
