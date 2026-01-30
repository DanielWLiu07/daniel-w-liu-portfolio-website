'use client'

import { useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { usePerformanceMode } from '@/contexts/performance-mode-context'
import { useTransitionState } from '@/components/ui/page-transition'

const FALLBACK_TIMEOUT = 3000
const FLASH_TRIGGER_TIME = 0.45
const INTRO_MAX_DURATION = 8000 // Max time to wait for intro before skipping
const MOBILE_CONTAINER_CLASSES = 'max-[600px]:w-[1600px] max-[600px]:h-[700px] max-[600px]:left-1/2 max-[600px]:-translate-x-1/2 max-[600px]:-translate-y-[5%]'

interface IntroVideoProps {
  onEnded: () => void
  onFlashStart: () => void
  onReady?: () => void
  canPlay?: boolean
}

export default function IntroVideo({ onEnded, onFlashStart, onReady, canPlay = true }: IntroVideoProps) {
  const { isLowPerformance } = usePerformanceMode()
  const { transitionStage } = useTransitionState()
  const canPlayRef = useRef(canPlay)
  const bgVideoRef = useRef<HTMLVideoElement>(null)
  const manVideoRef = useRef<HTMLVideoElement>(null)
  const readyCalledRef = useRef(false)
  const flashTriggeredRef = useRef(false)
  const videoReadyRef = useRef(false)
  const transitionReadyRef = useRef(false)
  const playStartedRef = useRef(false)

  // Keep canPlayRef in sync with prop
  useEffect(() => {
    canPlayRef.current = canPlay
  }, [canPlay])

  // Function to attempt playing videos when all conditions are met
  const maybePlay = useCallback(() => {
    if (playStartedRef.current) return
    if (!videoReadyRef.current || !transitionReadyRef.current) return
    if (!canPlayRef.current) return // Don't play until explicitly allowed

    playStartedRef.current = true
    bgVideoRef.current?.play().catch(() => {})
    manVideoRef.current?.play().catch(() => {})
  }, [])

  const handleLoaded = useCallback(() => {
    if (readyCalledRef.current) return
    readyCalledRef.current = true
    onReady?.()
  }, [onReady])

  // Reset ALL state when loading (for navigation)
  useEffect(() => {
    if (transitionStage === 'loading') {
      readyCalledRef.current = false
      flashTriggeredRef.current = false
      videoReadyRef.current = false
      transitionReadyRef.current = false
      playStartedRef.current = false
    }
  }, [transitionStage])

  // Track when transition is ready to play
  useEffect(() => {
    if (isLowPerformance) return

    if (transitionStage === 'revealing' || transitionStage === 'hidden') {
      transitionReadyRef.current = true
      maybePlay()
    }
  }, [isLowPerformance, transitionStage, maybePlay])

  // When canPlay becomes true, attempt to play
  useEffect(() => {
    if (isLowPerformance) return
    if (canPlay) {
      maybePlay()
    }
  }, [isLowPerformance, canPlay, maybePlay])

  // Low performance mode: notify ready immediately and end
  useEffect(() => {
    if (!isLowPerformance || readyCalledRef.current) return
    readyCalledRef.current = true
    onReady?.()
    const timeout = setTimeout(onEnded, 100)
    return () => clearTimeout(timeout)
  }, [isLowPerformance, onReady, onEnded])

  // Track when video is ready and signal page ready
  useEffect(() => {
    if (isLowPerformance) return

    const video = bgVideoRef.current
    if (!video) return

    const onCanPlay = () => {
      handleLoaded()
      videoReadyRef.current = true
      maybePlay()
    }

    if (video.readyState >= 3) {
      onCanPlay()
      return
    }

    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('loadeddata', onCanPlay)

    const timeout = setTimeout(() => {
      handleLoaded()
      videoReadyRef.current = true
      maybePlay()
    }, FALLBACK_TIMEOUT)

    return () => {
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('loadeddata', onCanPlay)
      clearTimeout(timeout)
    }
  }, [isLowPerformance, handleLoaded, maybePlay])

  // Fallback: if intro takes too long (video doesn't play/end), skip it
  // Re-runs when transitionStage changes to ensure fresh timeout on navigation
  useEffect(() => {
    if (isLowPerformance) return
    if (transitionStage === 'loading') return // Don't start timeout during loading phase

    const timeout = setTimeout(() => {
      onEnded()
    }, INTRO_MAX_DURATION)

    return () => clearTimeout(timeout)
  }, [isLowPerformance, transitionStage, onEnded])

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    if (flashTriggeredRef.current) return
    const video = e.currentTarget
    if (video.duration - video.currentTime <= FLASH_TRIGGER_TIME) {
      flashTriggeredRef.current = true
      onFlashStart()
    }
  }

  const handleError = () => {
    // Only signal ready, but don't end intro on error
    // The video might recover, or we'll fallback to timeout
    if (!readyCalledRef.current) {
      readyCalledRef.current = true
      onReady?.()
    }
    // Don't call onEnded() here - let the video try to play
    // If it truly fails, the fallback timeout will handle it
  }

  if (isLowPerformance) {
    return (
      <>
        <div className="absolute inset-0 z-0 pointer-events-none">
          <Image src="/animation_frames/manga/manga_intro/0075.webp" alt="" fill className="object-cover" />
        </div>
        <div className={`absolute inset-0 w-full h-full ${MOBILE_CONTAINER_CLASSES} max-[600px]:mt-20 z-10 pointer-events-none`}>
          <Image src="/animation_frames/manga/manga_man_intro/0075.webp" alt="" fill className="object-cover max-[600px]:object-contain" />
        </div>
      </>
    )
  }

  return (
    <>
      <div className="absolute inset-0 z-0 pointer-events-none">
        <video
          ref={bgVideoRef}
          className="absolute inset-0 w-full h-full object-cover"
          muted
          playsInline
          preload="auto"
          onTimeUpdate={handleTimeUpdate}
          onEnded={onEnded}
          onError={handleError}
        >
          <source src="/projects/videos/manga_intro_bg.webm" type="video/webm" />
        </video>
      </div>

      <div className={`absolute inset-0 w-full h-full ${MOBILE_CONTAINER_CLASSES} max-[600px]:mt-5 z-10 pointer-events-none`}>
        <video
          ref={manVideoRef}
          className="absolute inset-0 w-full h-full object-cover max-[600px]:object-contain"
          muted
          playsInline
          preload="auto"
        >
          <source src="/projects/videos/manga_man_intro.webm" type="video/webm" />
        </video>
      </div>
    </>
  )
}
