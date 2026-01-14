'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { usePerformanceMode } from '@/contexts/performance-mode-context'
import { useTransitionState } from '@/components/ui/page-transition'

const FALLBACK_TIMEOUT = 1500

interface BackgroundVideoProps {
  onReady?: () => void
}

export function BackgroundVideo({ onReady }: BackgroundVideoProps) {
  const [showLoop, setShowLoop] = useState(false)
  const introRef = useRef<HTMLVideoElement>(null)
  const loopRef = useRef<HTMLVideoElement>(null)
  const readyCalledRef = useRef(false)
  const videoStartedRef = useRef(false)

  const { isLowPerformance } = usePerformanceMode()
  const { signalReady, transitionStage } = useTransitionState()

  const handleLoaded = useCallback(() => {
    if (readyCalledRef.current) return
    readyCalledRef.current = true
    signalReady()
    onReady?.()
  }, [signalReady, onReady])

  // Reset ready state when entering loading (new navigation to this page)
  useEffect(() => {
    if (transitionStage === 'loading') {
      readyCalledRef.current = false
      videoStartedRef.current = false
    }
  }, [transitionStage])

  // Start video on reveal or on direct load (hidden)
  useEffect(() => {
    if (isLowPerformance || (transitionStage !== 'revealing' && transitionStage !== 'hidden') || videoStartedRef.current) return
    videoStartedRef.current = true
    introRef.current?.play()
  }, [isLowPerformance, transitionStage])

  // Low performance: signal ready immediately
  useEffect(() => {
    if (!isLowPerformance || readyCalledRef.current) return
    readyCalledRef.current = true
    signalReady()
    onReady?.()
  }, [isLowPerformance, signalReady, onReady])

  // Wait for video ready
  useEffect(() => {
    if (isLowPerformance) return

    const intro = introRef.current
    if (!intro) return

    if (intro.readyState >= 3) {
      handleLoaded()
      return
    }

    const onReady = () => handleLoaded()
    intro.addEventListener('canplay', onReady)
    intro.addEventListener('loadeddata', onReady)

    const timeout = setTimeout(handleLoaded, FALLBACK_TIMEOUT)

    return () => {
      intro.removeEventListener('canplay', onReady)
      intro.removeEventListener('loadeddata', onReady)
      clearTimeout(timeout)
    }
  }, [isLowPerformance, handleLoaded])

  const handleIntroEnded = () => {
    setShowLoop(true)
    loopRef.current?.play()
  }

  if (isLowPerformance) {
    return (
      <Image
        src="/animation_frames/experience/bg_anime/your_name_scene_.png0300.png"
        alt=""
        fill
        className="object-cover"
        priority
      />
    )
  }

  return (
    <>
      <video
        ref={introRef}
        muted
        playsInline
        onEnded={handleIntroEnded}
        className={`absolute inset-0 w-full h-full object-cover ${showLoop ? 'hidden' : ''}`}
        preload="auto"
      >
        <source src="/experience/videos/anime_intro.mov" type='video/mp4; codecs="hvc1"' />
        <source src="/experience/videos/anime_intro.webm?v=3" type="video/webm" />
      </video>
      <video
        ref={loopRef}
        loop
        muted
        playsInline
        className={`absolute inset-0 w-full h-full object-cover ${showLoop ? '' : 'hidden'}`}
        preload="auto"
      >
        <source src="/experience/videos/anime_style_bg.mov" type='video/mp4; codecs="hvc1"' />
        <source src="/experience/videos/anime_style_bg.webm?v=5" type="video/webm" />
      </video>
    </>
  )
}
