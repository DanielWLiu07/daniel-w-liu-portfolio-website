'use client'

import { useEffect, useState } from 'react'
import './transition-flash.css'

interface TransitionFlashProps {
  trigger: boolean
  onComplete?: () => void
}

const LINES = 20
const REPEATS = 15

export default function TransitionFlash({ trigger, onComplete }: TransitionFlashProps) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!trigger) {
      setShow(false)
      return
    }

    setShow(true)

    const timer = setTimeout(() => {
      setShow(false)
      onComplete?.()
    }, 2500)

    return () => clearTimeout(timer)
  }, [trigger, onComplete])

  if (!show) return null

  return (
    <div className="flash-overlay">
      <div className="flash-text-container">
        {Array.from({ length: LINES }).map((_, i) => (
          <div
            key={i}
            className="flash-text-line"
          >
            {Array.from({ length: REPEATS }).map((_, j) => (
              <span key={j} className="flash-text">START</span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
