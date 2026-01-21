'use client'

import { useEffect, useState } from 'react'

interface TransitionFlashProps {
  trigger: boolean
  onComplete?: () => void
}

export default function TransitionFlash({ trigger, onComplete }: TransitionFlashProps) {
  const [phase, setPhase] = useState<'hidden' | 'fading-in' | 'full' | 'fading-out'>('hidden')

  useEffect(() => {
    if (!trigger) {
      setPhase('hidden')
      return
    }

    setPhase('fading-in')

    const fullTimer = setTimeout(() => {
      setPhase('full')
    }, 600)

    const fadeOutTimer = setTimeout(() => {
      setPhase('fading-out')
    }, 900)

    const completeTimer = setTimeout(() => {
      setPhase('hidden')
      onComplete?.()
    }, 1500)

    return () => {
      clearTimeout(fullTimer)
      clearTimeout(fadeOutTimer)
      clearTimeout(completeTimer)
    }
  }, [trigger, onComplete])

  if (phase === 'hidden') return null

  const opacity = phase === 'fading-in' ? 1 : phase === 'full' ? 1 : 0

  return (
    <div
      className="fixed inset-0 w-screen h-screen z-[9999] bg-white pointer-events-none"
      style={{
        opacity,
        transition: phase === 'fading-in' ? 'opacity 600ms ease-in' : phase === 'fading-out' ? 'opacity 600ms ease-out' : 'none',
      }}
    />
  )
}
