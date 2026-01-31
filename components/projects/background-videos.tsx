'use client'

import { useRef, useEffect } from 'react'
import Image from 'next/image'
import { usePerformanceMode } from '@/contexts/performance-mode-context'
import { AlphaVideo } from '@/components/ui/alpha-video'

interface BackgroundVideosProps {
  visible: boolean
  isExpanded?: boolean
}

const MOBILE_CONTAINER_CLASSES = 'max-[600px]:w-[1600px] max-[600px]:h-[700px] max-[600px]:left-1/2 max-[600px]:-translate-x-1/2 max-[600px]:-translate-y-[5%]'

export default function BackgroundVideos({ visible, isExpanded = false }: BackgroundVideosProps) {
  const bgVideoRef = useRef<HTMLVideoElement>(null)
  const manVideoRef = useRef<HTMLVideoElement>(null)
  const { isLowPerformance } = usePerformanceMode()
  const prevExpandedRef = useRef(isExpanded)

  const isCollapsing = !isExpanded && prevExpandedRef.current
  const transitionDuration = isCollapsing ? 'duration-[800ms]' : 'duration-[3000ms]'

  useEffect(() => {
    prevExpandedRef.current = isExpanded
  }, [isExpanded])

  useEffect(() => {
    if (!visible) return
    bgVideoRef.current?.play()
    manVideoRef.current?.play()
  }, [visible])

  return (
    <>
      <div className={`fixed inset-0 w-full h-screen z-0 ${visible ? '' : 'invisible'}`}>
        <Image src="/projects/images/starry.webp" alt="" className="object-cover" fill priority />
        {isLowPerformance ? (
          <Image src="/animation_frames/manga/manga_bg/0400.webp" alt="" fill className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <AlphaVideo
            ref={bgVideoRef}
            src="/projects/videos/manga_bg_slowed"
            query="?v=3"
            fallbackImage="/animation_frames/manga/manga_bg/0400.webp"
            className="absolute inset-0 w-full h-full object-cover"
            muted
            loop
            playsInline
            preload="auto"
          />
        )}
      </div>

      <div
        className={`fixed inset-0 w-full h-screen ${MOBILE_CONTAINER_CLASSES} ${isLowPerformance ? 'max-[600px]:mt-20' : 'max-[600px]:mt-5'} ${isExpanded ? 'z-[36]' : 'z-[56]'} pointer-events-none ${visible ? '' : 'invisible'} transition-transform ease-[cubic-bezier(0.25,0.1,0.15,1)] ${transitionDuration} ${isExpanded ? '-translate-y-full' : 'translate-y-0'}`}
      >
        {isLowPerformance ? (
          <Image src="/animation_frames/manga/manga_man/0200.webp" alt="" fill className="absolute inset-0 w-full h-full object-cover max-[600px]:object-contain" />
        ) : (
          <AlphaVideo
            ref={manVideoRef}
            src="/projects/videos/manga_man"
            query="?v=3"
            fallbackImage="/animation_frames/manga/manga_man/0200.webp"
            className="absolute inset-0 w-full h-full object-cover max-[600px]:object-contain"
            muted
            loop
            playsInline
            preload="auto"
          />
        )}
      </div>
    </>
  )
}
