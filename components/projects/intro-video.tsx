'use client'

import { useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { usePerformanceMode } from '@/contexts/performance-mode-context'
import { useTransitionState } from '@/components/ui/page-transition'

const FALLBACK_TIMEOUT = 3000
const FLASH_TRIGGER_TIME = 0.45
const MOBILE_CONTAINER_CLASSES = 'max-[600px]:w-[1600px] max-[600px]:h-[700px] max-[600px]:left-1/2 max-[600px]:-translate-x-1/2 max-[600px]:-translate-y-[5%]'

interface IntroVideoProps {
  onEnded: () => void
  onFlashStart: () => void
}

export default function IntroVideo({ onEnded, onFlashStart }: IntroVideoProps) {
  const { isLowPerformance } = usePerformanceMode()
  const { signalReady, transitionStage } = useTransitionState()
  const bgVideoRef = useRef<HTMLVideoElement>(null)
  const manVideoRef = useRef<HTMLVideoElement>(null)
  const readyCalledRef = useRef(false)
  const videoStartedRef = useRef(false)
  const flashTriggeredRef = useRef(false)

  const handleLoaded = useCallback(() => {
    if (readyCalledRef.current) return
    readyCalledRef.current = true
    signalReady()
  }, [signalReady])

  useEffect(() => {
    if (transitionStage === 'loading') {
      readyCalledRef.current = false
      videoStartedRef.current = false
      flashTriggeredRef.current = false
    }
  }, [transitionStage])

  useEffect(() => {
    if (isLowPerformance || (transitionStage !== 'revealing' && transitionStage !== 'hidden') || videoStartedRef.current) return
    videoStartedRef.current = true
    bgVideoRef.current?.play()
    manVideoRef.current?.play()
  }, [isLowPerformance, transitionStage])

  useEffect(() => {
    if (!isLowPerformance || readyCalledRef.current) return
    readyCalledRef.current = true
    signalReady()
    const timeout = setTimeout(onEnded, 100)
    return () => clearTimeout(timeout)
  }, [isLowPerformance, signalReady, onEnded])

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
      <>
        <div className="absolute inset-0 z-0 pointer-events-none">
          <Image src="/animation_frames/manga/manga_intro/0075.png" alt="" fill className="object-cover" />
        </div>
        <div className={`absolute inset-0 w-full h-full ${MOBILE_CONTAINER_CLASSES} max-[600px]:mt-20 z-10 pointer-events-none`}>
          <Image src="/animation_frames/manga/manga_man_intro/0075.png" alt="" fill className="object-cover max-[600px]:object-contain" />
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
          <source src="/projects/videos/manga_intro_bg.mov" type='video/mp4; codecs="hvc1"' />
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
          <source src="/projects/videos/manga_man_intro.mov" type='video/mp4; codecs="hvc1"' />
          <source src="/projects/videos/manga_man_intro.webm" type="video/webm" />
        </video>
      </div>
    </>
  )
}
