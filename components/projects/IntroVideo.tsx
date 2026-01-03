'use client'

import { useMobile } from '@/hooks/use-mobile'

interface IntroVideoProps {
  onEnded: () => void
  onFlashStart: () => void
  onLoaded: () => void
}

export default function IntroVideo({ onEnded, onFlashStart, onLoaded }: IntroVideoProps) {
  const isMobile = useMobile()
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

  return (
    <div className="absolute inset-0 w-full h-full z-0 pointer-events-none">
      <video
        src='/projects/videos/manga_intro.webm'
        className='absolute inset-0 w-full h-full object-cover pointer-events-none'
        muted
        autoPlay
        playsInline
        preload={isMobile ? "none" : "auto"}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onError={handleError}
        onCanPlay={onLoaded}
      />
    </div>
  )
}
