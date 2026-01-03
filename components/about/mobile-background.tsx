'use client'

import { useState } from 'react'
import Image from 'next/image'

export function MobileBackground() {
  const [sparkleDone, setSparkleDone] = useState(false)

  return (
    <>
      <section className="md:hidden relative h-screen">
        <video src="/about/videos/water_colour.webm" autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover object-[10%_100%] z-0" />
        {!sparkleDone ? (
          <video src="/about/videos/sparkle_being.webm" autoPlay muted playsInline onEnded={() => setSparkleDone(true)} className="absolute inset-0 w-full h-full object-cover object-[10%_100%] z-10" />
        ) : (
          <video src="/about/videos/sparkle_loop.webm?v=2" autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover object-[10%_100%] z-10" />
        )}
      </section>

      <section className="md:hidden relative h-[300vh]">
        <div className="sticky top-0 h-screen">
          <video src="/about/videos/right_colour_phone.webm" autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover object-right" />
          <Image src="/about/images/right_graphics.png" alt="Water Colour Graphics" fill className="right-graphics object-cover object-right-top" priority />
        </div>
      </section>
    </>
  )
}
