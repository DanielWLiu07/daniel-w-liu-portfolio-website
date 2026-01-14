'use client'

import { useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { usePerformanceMode } from '@/contexts/performance-mode-context'
import { useTransitionState } from '@/components/ui/page-transition'

const FALLBACK_TIMEOUT = 15000

export function ProjectsBackground() {
  const bgVideoRef = useRef<HTMLVideoElement>(null)
  const readyCalledRef = useRef(false)

  const { isLowPerformance } = usePerformanceMode()
  const { signalReady, transitionStage } = useTransitionState()

  const handleLoaded = useCallback(() => {
    if (readyCalledRef.current) return
    readyCalledRef.current = true
    signalReady()
  }, [signalReady])

  // Reset state when entering loading (new navigation to this page)
  useEffect(() => {
    if (transitionStage === 'loading') {
      readyCalledRef.current = false
    }
  }, [transitionStage])

  // Low performance: signal ready immediately
  useEffect(() => {
    if (!isLowPerformance || readyCalledRef.current) return
    readyCalledRef.current = true
    signalReady()
  }, [isLowPerformance, signalReady])

  // Wait for background video ready
  useEffect(() => {
    if (isLowPerformance) return

    const video = bgVideoRef.current
    if (!video) return

    if (video.readyState >= 3) {
      handleLoaded()
      return
    }

    const onReady = () => handleLoaded()
    video.addEventListener('canplay', onReady)
    video.addEventListener('loadeddata', onReady)

    const timeout = setTimeout(handleLoaded, FALLBACK_TIMEOUT)

    return () => {
      video.removeEventListener('canplay', onReady)
      video.removeEventListener('loadeddata', onReady)
      clearTimeout(timeout)
    }
  }, [isLowPerformance, handleLoaded])

  if (isLowPerformance) {
    return (
      <div className="absolute w-full h-full z-0">
        <Image src="/projects/images/starry.png" alt="" className="object-cover" fill priority />
        <Image src="/animation_frames/manga/manga_bg/0400.png" alt="" fill className="absolute inset-0 w-full h-full object-cover" />
      </div>
    )
  }

  return (
    <>
      <div className="absolute w-full h-full z-0">
        <Image src="/projects/images/starry.png" alt="" className="object-cover" fill priority />
        <video
          ref={bgVideoRef}
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          onLoadedData={(e) => {
            e.currentTarget.play().catch(() => {})
          }}
        >
          <source src="/projects/videos/manga_bg_slowed.mov" type='video/mp4; codecs="hvc1"' />
          <source src="/projects/videos/manga_bg_slowed.webm" type="video/webm" />
        </video>
      </div>
    </>
  )
}
