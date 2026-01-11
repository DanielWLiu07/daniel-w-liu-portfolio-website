'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import { frederickaFont } from '@/lib/fonts'
import { SPIN_DURATION } from './constants'

export function LoadingContent() {
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    let animationId: number

    const updateRotation = () => {
      if (imgRef.current) {
        const rotation = (Date.now() % SPIN_DURATION) / SPIN_DURATION * 360
        imgRef.current.style.transform = `rotate(${rotation}deg)`
      }
      animationId = requestAnimationFrame(updateRotation)
    }

    animationId = requestAnimationFrame(updateRotation)
    return () => cancelAnimationFrame(animationId)
  }, [])

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Image
          ref={imgRef}
          src="/images/cat_spin.png"
          alt="Loading"
          width={256}
          height={256}
        />
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
