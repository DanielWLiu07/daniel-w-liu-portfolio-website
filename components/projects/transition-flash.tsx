'use client'

import { useEffect, useState } from 'react'

interface TransitionFlashProps {
  show: boolean
  fading: boolean
}

export default function TransitionFlash({ show, fading }: TransitionFlashProps) {
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    if (show && !fading) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setEntered(true)
        })
      })
    } else if (!show) {
      setEntered(false)
    }
  }, [show, fading])

  if (!show && !fading) return null

  const opacity = fading ? 0 : entered ? 1 : 0

  return (
    <div
      className="fixed inset-0 w-screen h-screen z-[9999] bg-white pointer-events-none"
      style={{
        opacity,
        transition: 'opacity 800ms ease-in-out',
      }}
    />
  )
}
