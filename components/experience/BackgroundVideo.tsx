'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { usePerformanceMode } from '@/contexts/performance-mode-context'

export function BackgroundVideo() {
  const [showLoop, setShowLoop] = useState(false)
  const introRef = useRef<HTMLVideoElement>(null)
  const loopRef = useRef<HTMLVideoElement>(null)
  const { isLowPerformance } = usePerformanceMode()

  const handleIntroEnded = () => {
    setShowLoop(true)
    loopRef.current?.play()
  }

  if (isLowPerformance) {
    return (
      <Image
        src="/animation_frames/experience/bg_anime/your_name_scene_.png0300.png"
        alt="anime background"
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
        src="/experience/videos/anime_intro.webm?v=3"
        autoPlay
        muted
        playsInline
        onEnded={handleIntroEnded}
        className={`absolute inset-0 w-full h-full object-cover ${showLoop ? 'hidden' : ''}`}
        preload="auto"
      />
      <video
        ref={loopRef}
        src="/experience/videos/anime_style_bg.webm?v=5"
        loop
        muted
        playsInline
        className={`absolute inset-0 w-full h-full object-cover ${showLoop ? '' : 'hidden'}`}
        preload="auto"
      />
    </>
  )
}
