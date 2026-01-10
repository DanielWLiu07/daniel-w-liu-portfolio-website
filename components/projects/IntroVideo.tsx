'use client'

import { useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { usePerformanceMode } from '@/contexts/performance-mode-context'

interface IntroVideoProps {
  onEnded: () => void
  onFlashStart: () => void
  onLoaded?: () => void
}

export default function IntroVideo({ onEnded, onFlashStart, onLoaded }: IntroVideoProps) {
  const { isLowPerformance } = usePerformanceMode()
  const videoRef = useRef<HTMLVideoElement>(null)
  const loadedCalledRef = useRef(false)

  const handleLoaded = useCallback(() => {
    if (loadedCalledRef.current) return
    loadedCalledRef.current = true
    onLoaded?.()
  }, [onLoaded])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (video.readyState >= 3) {
      setTimeout(handleLoaded, 0)
    }

    const timeout = setTimeout(handleLoaded, 1000)

    return () => {
      clearTimeout(timeout)
    }
  }, [handleLoaded])

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget
    const timeRemaining = video.duration - video.currentTime
    if (timeRemaining <= 0.5) {
      onFlashStart()
    }
  }

  const handleEnded = () => {
    onEnded()
  }

  const handleError = () => {
    onEnded()
  }

  useEffect(() => {
    if (isLowPerformance) {
      handleLoaded()
      setTimeout(() => {
        onFlashStart()
        onEnded()
      }, 100)
    }
  }, [isLowPerformance, handleLoaded, onFlashStart, onEnded])

  return (
    <div className="absolute inset-0 w-full h-full z-0 pointer-events-none">
      {isLowPerformance ? (
        <Image
          src='/animation_frames/manga/manga_intro/0075.png'
          alt='manga intro'
          className='absolute inset-0 w-full h-full object-cover pointer-events-none'
          fill
        />
      ) : (
        <video
          ref={videoRef}
          src='/projects/videos/manga_intro.webm'
          className='absolute inset-0 w-full h-full object-cover pointer-events-none'
          muted
          autoPlay
          playsInline
          preload="auto"
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onError={handleError}
          onCanPlay={handleLoaded}
          onLoadedData={handleLoaded}
        />
      )}
    </div>
  )
}
