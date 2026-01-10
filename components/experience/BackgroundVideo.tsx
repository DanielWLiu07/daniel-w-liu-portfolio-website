'use client'

import { useRef, useState } from 'react'

export function BackgroundVideo() {
  const [showLoop, setShowLoop] = useState(false)
  const introRef = useRef<HTMLVideoElement>(null)
  const loopRef = useRef<HTMLVideoElement>(null)

  const handleIntroEnded = () => {
    setShowLoop(true)
    loopRef.current?.play()
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
        className={`absolute w-[70%] h-auto left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 object-contain sm:inset-0 sm:w-full sm:h-full sm:translate-x-0 sm:translate-y-0 sm:left-0 sm:top-0 sm:object-cover ${showLoop ? 'hidden' : ''}`}
        preload="auto"
      />
      <video
        ref={loopRef}
        src="/experience/videos/anime_style_bg.webm?v=5"
        loop
        muted
        playsInline
        className={`absolute w-[70%] h-auto left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 object-contain sm:inset-0 sm:w-full sm:h-full sm:translate-x-0 sm:translate-y-0 sm:left-0 sm:top-0 sm:object-cover ${showLoop ? '' : 'hidden'}`}
        preload="auto"
      />
    </>
  )
}
