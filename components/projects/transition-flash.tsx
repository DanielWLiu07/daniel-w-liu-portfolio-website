'use client'

import { useEffect, useRef, useState } from 'react'

interface TransitionFlashProps {
  show: boolean
}

export default function TransitionFlash({ show }: TransitionFlashProps) {
  const [phase, setPhase] = useState<'hidden' | 'entering' | 'visible' | 'fading'>('hidden')
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (frameRef.current) cancelAnimationFrame(frameRef.current)

    if (show && phase === 'hidden') {
      setPhase('entering')
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = requestAnimationFrame(() => {
          setPhase('visible')
        })
      })
    } else if (!show && (phase === 'visible' || phase === 'entering')) {
      setPhase('fading')
      timeoutRef.current = setTimeout(() => {
        setPhase('hidden')
      }, 800)
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [show, phase])

  if (phase === 'hidden') return null

  const opacity = phase === 'entering' ? 0 : phase === 'fading' ? 0 : 1
  const transition = phase === 'fading'
    ? 'opacity 800ms cubic-bezier(0.4, 0, 0.2, 1)'
    : phase === 'visible'
      ? 'opacity 500ms ease-in'
      : 'none'

  return (
    <div
      className="fixed inset-0 w-screen h-screen z-[9999] bg-white pointer-events-none"
      style={{
        opacity,
        transition,
        willChange: 'opacity',
        transform: 'translateZ(0)',
      }}
    />
  )
}
