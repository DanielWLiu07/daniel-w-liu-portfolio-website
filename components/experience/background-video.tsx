'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { usePerformanceMode } from '@/contexts/performance-mode-context'
import { useTransitionState } from '@/components/ui/page-transition'
import { AlphaVideo } from '@/components/ui/alpha-video'

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
  const [objectPosition, setObjectPosition] = useState('50% 50%')
  const animationFrameRef = useRef<number | null>(null)

  const { isLowPerformance } = usePerformanceMode()
  const { signalReady, transitionStage } = useTransitionState()

  const handleLoaded = useCallback(() => {
    if (readyCalledRef.current) return
    readyCalledRef.current = true
    signalReady()
    onReady?.()
  }, [signalReady, onReady])

  useEffect(() => {
    if (transitionStage === 'loading') {
      readyCalledRef.current = false
      videoStartedRef.current = false
    }
  }, [transitionStage])

  useEffect(() => {
    if (isLowPerformance || (transitionStage !== 'revealing' && transitionStage !== 'hidden') || videoStartedRef.current) return
    videoStartedRef.current = true
    introRef.current?.play()
  }, [isLowPerformance, transitionStage])

  // Low performance mode: signal ready immediately
  // Include transitionStage in deps so this re-runs after navigation resets readyCalledRef
  useEffect(() => {
    if (!isLowPerformance || readyCalledRef.current) return
    readyCalledRef.current = true
    signalReady()
    onReady?.()
  }, [isLowPerformance, transitionStage, signalReady, onReady])

  useEffect(() => {
    if (isLowPerformance) return

    const intro = introRef.current

    // Always set up fallback timeout, even if video ref isn't ready yet
    const timeout = setTimeout(handleLoaded, FALLBACK_TIMEOUT)

    if (!intro) {
      return () => clearTimeout(timeout)
    }

    // Pre-play the video to warm up the decoder, then pause.
    // This ensures frames are decoded so play() on reveal is instant.
    // Use { once: true } so the listener auto-removes and doesn't
    // interfere when the reveal effect calls play() later.
    const handlePlaying = () => {
      intro.pause()
      intro.currentTime = 0
      handleLoaded()
    }

    // Already has decoded frames
    if (!intro.paused && intro.currentTime > 0) {
      intro.pause()
      intro.currentTime = 0
      handleLoaded()
      clearTimeout(timeout)
      return
    }

    intro.addEventListener('playing', handlePlaying, { once: true })

    // Trigger play to warm up decoder (will be paused immediately on 'playing')
    if (intro.readyState >= 3) {
      intro.play().catch(() => {})
    } else {
      intro.addEventListener('canplay', () => intro.play().catch(() => {}), { once: true })
    }

    return () => {
      intro.removeEventListener('playing', handlePlaying)
      clearTimeout(timeout)
    }
  }, [isLowPerformance, handleLoaded])

  const handleIntroEnded = () => {
    setShowLoop(true)
    loopRef.current?.play()
  }

  useEffect(() => {
    const width = window.innerWidth

    if (width < 1024) {
      const baseDuration = 60000
      const additionalDuration = ((1024 - width) / 1024) * 30000
      const duration = baseDuration + additionalDuration

      let startTime: number | null = null
      const maxPos = 100
      const centerPos = 50

      const animate = (timestamp: number) => {
        if (!startTime) startTime = timestamp
        const elapsed = timestamp - startTime
        const progress = (elapsed % duration) / duration
        const position = centerPos + (maxPos - centerPos) * Math.sin(progress * Math.PI * 2)
        setObjectPosition(`${position}% 50%`)
        animationFrameRef.current = requestAnimationFrame(animate)
      }

      animationFrameRef.current = requestAnimationFrame(animate)
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  if (isLowPerformance) {
    return (
      <Image
        src="/animation_frames/experience/bg_anime/your_name_scene_.png0300.webp"
        alt=""
        fill
        className="object-cover"
        style={{ objectPosition }}
        priority
      />
    )
  }

  return (
    <>
      <AlphaVideo
        ref={introRef}
        src="/experience/videos/anime_intro"
        query="?v=9"
        fallbackImage="/animation_frames/experience/bg_anime/your_name_scene_.png0300.webp"
        muted
        playsInline
        onEnded={handleIntroEnded}
        className={`absolute inset-0 w-full h-full object-cover ${showLoop ? 'hidden' : ''}`}
        style={{ objectPosition }}
        preload="auto"
      />
      <AlphaVideo
        ref={loopRef}
        src="/experience/videos/anime_style_bg"
        query="?v=9"
        fallbackImage="/animation_frames/experience/bg_anime/your_name_scene_.png0300.webp"
        loop
        muted
        playsInline
        className={`absolute inset-0 w-full h-full object-cover ${showLoop ? '' : 'hidden'}`}
        style={{ objectPosition }}
        preload="auto"
      />
    </>
  )
}
