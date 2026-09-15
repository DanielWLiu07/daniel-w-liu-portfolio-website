'use client'

import Image from 'next/image'
import { frederickaFont } from '@/lib/fonts/frederica'

export function LoadingContent() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin motion-reduce:animate-none" style={{ width: 256, height: 256, willChange: 'transform' }}>
          <Image
            src="/images/cat_spin.webp"
            alt="Loading"
            width={256}
            height={256}
            className="w-full h-full"
            priority
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
