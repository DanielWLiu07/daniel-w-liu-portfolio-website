'use client'

interface IntroVideoProps {
  onEnded: () => void
  onFlashStart: () => void
}

export default function IntroVideo({ onEnded, onFlashStart }: IntroVideoProps) {
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
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onError={handleError}
      />
    </div>
  )
}
