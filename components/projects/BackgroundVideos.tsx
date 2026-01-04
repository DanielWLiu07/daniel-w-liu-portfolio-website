'use client'

import { useRef, useEffect } from 'react'
import Image from 'next/image'
import { usePerformanceMode } from '@/contexts/performance-mode-context'

interface BackgroundVideosProps {
  visible: boolean
}

export default function BackgroundVideos({ visible }: BackgroundVideosProps) {
  const bgVideoRef = useRef<HTMLVideoElement>(null)
  const manVideoRef = useRef<HTMLVideoElement>(null)
  const { isLowPerformance } = usePerformanceMode()

  useEffect(() => {
    if (visible) {
      bgVideoRef.current?.play()
      manVideoRef.current?.play()
    }
  }, [visible])

  return (
    <>
      <div className={`absolute w-full h-full z-0 transition-opacity ${!visible ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <Image src='/projects/images/starry.png' alt='starry background' className='object-cover' fill priority />
        {!isLowPerformance && (
          <video
            ref={bgVideoRef}
            src='/projects/videos/manga_bg_slowed.webm?v=4'
            className='absolute inset-0 w-full h-full object-cover'
            muted
            loop
            playsInline
            preload="auto"
          />
        )}
      </div>

      {!isLowPerformance && (
        <div className={`absolute inset-0 w-full h-full z-20 pointer-events-none transition-opacity ${!visible ? 'opacity-0' : 'opacity-100'}`}>
          <video
            ref={manVideoRef}
            src='/projects/videos/manga_man.webm?v=2'
            className='absolute inset-0 w-full h-full object-cover'
            muted
            loop
            playsInline
            preload="auto"
          />
        </div>
      )}
    </>
  )
}
