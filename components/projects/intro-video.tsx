'use client'

import { useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { usePerformanceMode } from '@/contexts/performance-mode-context'
import { useTransitionState } from '@/components/ui/page-transition'

const FALLBACK_TIMEOUT = 3000
const FLASH_TRIGGER_TIME = 0.8

interface IntroVideoProps {
  onEnded: () => void
  onFlashStart: () => void
}

export default function IntroVideo({ onEnded, onFlashStart }: IntroVideoProps) {
  const { isLowPerformance } = usePerformanceMode()
  const { signalReady, transitionStage } = useTransitionState()
  const videoRef = useRef<HTMLVideoElement>(null)
  const readyCalledRef = useRef(false)
  const videoStartedRef = useRef(false)
  const flashTriggeredRef = useRef(false)

  const handleLoaded = useCallback(() => {
    if (readyCalledRef.current) return
    readyCalledRef.current = true
    signalReady()
  }, [signalReady])

  // Reset ready state when entering loading (new navigation to this page)
  useEffect(() => {
    if (transitionStage === 'loading') {
      readyCalledRef.current = false
      videoStartedRef.current = false
      flashTriggeredRef.current = false
    }
  }, [transitionStage])

  // Start video when reveal begins or on direct load (hidden)
  useEffect(() => {
    if (isLowPerformance || (transitionStage !== 'revealing' && transitionStage !== 'hidden') || videoStartedRef.current) return
    videoStartedRef.current = true
    videoRef.current?.play()
  }, [isLowPerformance, transitionStage])

  // Low performance: signal ready and skip
  useEffect(() => {
    if (!isLowPerformance || readyCalledRef.current) return
    readyCalledRef.current = true
    signalReady()
    const timeout = setTimeout(() => {
      onFlashStart()
      onEnded()
    }, 100)
    return () => clearTimeout(timeout)
  }, [isLowPerformance, signalReady, onFlashStart, onEnded])

  // Normal mode: wait for video ready
  useEffect(() => {
    if (isLowPerformance) return

    const video = videoRef.current
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

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    if (flashTriggeredRef.current) return
    const video = e.currentTarget
    if (video.duration - video.currentTime <= FLASH_TRIGGER_TIME) {
      flashTriggeredRef.current = true
      onFlashStart()
    }
  }

  const handleError = () => {
    if (!readyCalledRef.current) {
      readyCalledRef.current = true
      signalReady()
    }
    onEnded()
  }

  if (isLowPerformance) {
    return (
      <div className="absolute inset-0 z-0 pointer-events-none">
        <Image src="/animation_frames/manga/manga_intro/0075.png" alt="" fill className="object-cover" />
      </div>
    )
  }

  return (
    <div className="absolute inset-0 z-0 pointer-events-none">
      <video
        ref={videoRef}
        src="/projects/videos/manga_intro.webm"
        className="absolute inset-0 w-full h-full object-cover"
        muted
        playsInline
        preload="auto"
        onTimeUpdate={handleTimeUpdate}
        onEnded={onEnded}
        onError={handleError}
      />
    </div>
  )
}
