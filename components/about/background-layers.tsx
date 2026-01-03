'use client'

import { useState } from 'react'
import Image from 'next/image'

export function BackgroundLayers() {
  const [sparkleDone, setSparkleDone] = useState(false)

  return (
    <>
      <div className="hidden md:block fixed inset-0 z-0">
        <Image src="/about/images/bg.png" alt="Background" fill className="object-cover" priority />
      </div>

      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" className="hidden md:block fixed inset-0 z-0">
        <defs>
          <filter id="waterColourFilter">
            <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="8" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G">
              <animate
                attributeName="scale"
                values="200;490"
                dur="2s"
                begin="0s"
                calcMode="linear"
                fill="freeze"
              />
            </feDisplacementMap>
          </filter>
          <mask id="waterColourMask">
            <rect x="0" y="0" width="100%" height="100%" fill="black" />
            <circle cx="50%" cy="60%" r="0%" fill="white" filter="url(#waterColourFilter)">
              <animate
                attributeName="r"
                values="0%;120%"
                dur="2s"
                begin="0s"
                calcMode="linear"
                fill="freeze"
              />
            </circle>
          </mask>
        </defs>
        <foreignObject width="100%" height="100%" mask="url(#waterColourMask)">
          <div className="relative w-full h-full">
            <video src="/about/videos/water_colour.webm" autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover object-bottom" />
          </div>
        </foreignObject>
      </svg>

      <div className="hidden md:block fixed inset-0 z-10">
        {!sparkleDone ? (
          <video src="/about/videos/sparkle_being.webm" autoPlay muted playsInline onEnded={() => setSparkleDone(true)} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <video src="/about/videos/sparkle_loop.webm?v=2" autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover" />
        )}
      </div>

      <div className="hidden md:block fixed inset-0 z-0">
        <video src="/about/videos/right_colour.webm" autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover" />
      </div>

      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" className="hidden md:block fixed inset-0 z-0">
        <defs>
          <filter id="aboutBgFilter">
            <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="8" result="noise" />
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
            <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="8" result="noise" />
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
            <Image src="/about/images/right_graphics.png" alt="Water Colour Graphics" fill className="object-cover object-right-top" priority />
          </div>
        </foreignObject>
      </svg>
    </>
  )
}
