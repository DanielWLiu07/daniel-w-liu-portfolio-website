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
    }, 600)

    return () => clearTimeout(timer)
  }, [trigger, onComplete])

  if (!show) return null

  return (
    <div className="flash-overlay">
      <div className="flash-sphere-container">
        {Array.from({ length: LINES }).map((_, i) => {
          const yNorm = (i - (LINES - 1) / 2) / ((LINES - 1) / 2)

          return Array.from({ length: REPEATS }).map((_, j) => {
            const xNorm = (j - (REPEATS - 1) / 2) / ((REPEATS - 1) / 2)

            const rotateY = xNorm * -60
            const rotateX = yNorm * 60
            const distance = Math.sqrt(xNorm * xNorm + yNorm * yNorm)
            const scale = 1 + distance * 0.4
            const translateZ = -distance * 150

            const top = 50 + yNorm * 45
            const left = 50 + xNorm * 45

            return (
              <span
                key={`${i}-${j}`}
                className="flash-text-item"
                style={{
                  position: 'absolute',
                  top: `${top}%`,
                  left: `${left}%`,
                  transform: `translate(-50%, -50%) perspective(400px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${scale}) translateZ(${translateZ}px)`,
                }}
              >
                START
              </span>
            )
          })
        })}
      </div>
    </div>
  )
}
