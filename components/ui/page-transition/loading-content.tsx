'use client'

import Image from 'next/image'
import { useEffect, useRef } from 'react'
import { frederickaFont } from '@/lib/fonts/frederica'

const SPIN_DURATION = 1000

export function LoadingContent() {
  const spinRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let rafId: number
    const animate = () => {
      if (spinRef.current) {
        const angle = (Date.now() % SPIN_DURATION) / SPIN_DURATION * 360
        spinRef.current.style.transform = `rotate(${angle}deg)`
      }
      rafId = requestAnimationFrame(animate)
    }
    rafId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafId)
  }, [])

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div ref={spinRef} style={{ width: 256, height: 256 }}>
          <Image
            src="/images/cat_spin.webp"
            alt="Loading"
            width={256}
            height={256}
            className="w-full h-full"
          />
        </div>
        <p className={`text-5xl md:text-7xl text-center tracking-wider text-stroke-white text-[#2c1810] ${frederickaFont.className}`}>
          Loading
          <span className="loading-dot-1">.</span>
          <span className="loading-dot-2">.</span>
          <span className="loading-dot-3">.</span>
        </p>
      </div>
    </div>
  )
}
