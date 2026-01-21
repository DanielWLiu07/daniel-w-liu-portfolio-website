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
        {Array.from({ length: LINES }).map((_, i) => {
          const centerOffset = (i - (LINES - 1) / 2) / ((LINES - 1) / 2)
          const rotateX = centerOffset * 45
          const scale = 1 + Math.abs(centerOffset) * 0.3
          const translateZ = -Math.abs(centerOffset) * 100

          return (
            <div
              key={i}
              className="flash-text-line-wrapper"
              style={{
                transform: `perspective(500px) rotateX(${rotateX}deg) scale(${scale}) translateZ(${translateZ}px)`,
              }}
            >
              <div className={`flash-text-line ${i % 2 === 0 ? 'even' : 'odd'}`}>
                {Array.from({ length: REPEATS }).map((_, j) => (
                  <span key={j} className="flash-text">START</span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
