'use client'

import { useRef, useEffect } from 'react'
import Image from 'next/image'
import { usePerformanceMode } from '@/contexts/performance-mode-context'

interface BackgroundVideosProps {
  visible: boolean
  isExpanded?: boolean
}

const MOBILE_CONTAINER_CLASSES = 'max-[600px]:w-[1600px] max-[600px]:h-[700px] max-[600px]:left-1/2 max-[600px]:-translate-x-1/2 max-[600px]:-translate-y-[5%]'

export default function BackgroundVideos({ visible, isExpanded = false }: BackgroundVideosProps) {
  const bgVideoRef = useRef<HTMLVideoElement>(null)
  const manVideoRef = useRef<HTMLVideoElement>(null)
  const { isLowPerformance } = usePerformanceMode()

  useEffect(() => {
    if (!visible) return
    bgVideoRef.current?.play()
    manVideoRef.current?.play()
  }, [visible])

  const visibilityClass = visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
  const mangaManZIndex = isExpanded ? 'z-[36]' : 'z-[39]'

  return (
    <>
      <div className={`absolute w-full h-full z-0 transition-opacity ${visibilityClass}`}>
        <Image src="/projects/images/starry.png" alt="" className="object-cover" fill priority />
        {isLowPerformance ? (
          <Image src="/animation_frames/manga/manga_bg/0400.png" alt="" fill className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <video
            ref={bgVideoRef}
            className="absolute inset-0 w-full h-full object-cover"
            muted
            loop
            playsInline
            preload="auto"
          >
            <source src="/projects/videos/manga_bg_slowed.mov" type='video/mp4; codecs="hvc1"' />
            <source src="/projects/videos/manga_bg_slowed.webm" type="video/webm" />
          </video>
        )}
      </div>

      <div
        className={`absolute inset-0 w-full h-full ${MOBILE_CONTAINER_CLASSES} ${isLowPerformance ? 'max-[600px]:mt-20' : 'max-[600px]:mt-5'} ${mangaManZIndex} pointer-events-none`}
        style={{
          transform: isExpanded ? 'translateY(-100%)' : 'translateY(0)',
          transition: 'transform 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {isLowPerformance ? (
          <Image src="/animation_frames/manga/manga_man/0200.png" alt="" fill className="absolute inset-0 w-full h-full object-cover max-[600px]:object-contain" />
        ) : (
          <video
            ref={manVideoRef}
            className="absolute inset-0 w-full h-full object-cover max-[600px]:object-contain"
            muted
            loop
            playsInline
            preload="auto"
          >
            <source src="/projects/videos/manga_man.mov" type='video/mp4; codecs="hvc1"' />
            <source src="/projects/videos/manga_man.webm" type="video/webm" />
          </video>
        )}
      </div>
    </>
  )
}
