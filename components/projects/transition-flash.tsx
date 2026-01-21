'use client'

import { useEffect, useRef, useState } from 'react'

interface TransitionFlashProps {
  show: boolean
}

export default function TransitionFlash({ show }: TransitionFlashProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isFading, setIsFading] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (show) {
      setIsVisible(true)
      setIsFading(false)
    } else if (isVisible) {
      setIsFading(true)
      timeoutRef.current = setTimeout(() => {
        setIsVisible(false)
        setIsFading(false)
      }, 800)
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [show, isVisible])

  if (!isVisible) return null

  return (
    <div
      className="fixed inset-0 w-screen h-screen z-[9999] bg-white pointer-events-none"
      style={{
        opacity: isFading ? 0 : 1,
        transition: isFading ? 'opacity 800ms cubic-bezier(0.4, 0, 0.2, 1)' : 'opacity 500ms ease-in',
        willChange: 'opacity',
        transform: 'translateZ(0)',
      }}
    />
  )
}
