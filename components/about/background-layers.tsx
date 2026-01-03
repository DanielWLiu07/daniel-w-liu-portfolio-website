'use client'

import { useState } from 'react'
import Image from 'next/image'

export function BackgroundLayers() {
  const [sparkleDone, setSparkleDone] = useState(false)

  return (
    <>
      <div className="hidden md:block fixed inset-0 z-0">
        <video src="/about/videos/water_colour.webm" autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover object-bottom" />
      </div>

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

      <div className="hidden md:block fixed inset-0 z-0">
        <Image src="/about/images/right_graphics.png" alt="Water Colour Graphics" fill className="right-graphics object-cover object-right-top" priority />
      </div>
    </>
  )
}
