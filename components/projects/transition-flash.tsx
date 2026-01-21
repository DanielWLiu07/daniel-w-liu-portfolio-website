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
    }, 1000)

    return () => clearTimeout(timer)
  }, [trigger, onComplete])

  if (!show) return null

  return (
    <div className="flash-overlay">
      <div className="flash-text-container">
        {Array.from({ length: LINES }).map((_, i) => {
          const yOffset = (i - (LINES - 1) / 2) / ((LINES - 1) / 2)

          return (
            <div
              key={i}
              className="flash-text-line-wrapper"
            >
              <div className={`flash-text-line ${i % 2 === 0 ? 'even' : 'odd'}`}>
                {Array.from({ length: REPEATS }).map((_, j) => {
                  const xOffset = (j - (REPEATS - 1) / 2) / ((REPEATS - 1) / 2)

                  const rotateY = xOffset * 50
                  const rotateX = yOffset * -50
                  const scale = 1 + Math.sqrt(xOffset * xOffset + yOffset * yOffset) * 0.2
                  const translateZ = -Math.sqrt(xOffset * xOffset + yOffset * yOffset) * 80

                  return (
                    <span
                      key={j}
                      className="flash-text"
                      style={{
                        transform: `perspective(300px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${scale}) translateZ(${translateZ}px)`,
                        display: 'inline-block',
                      }}
                    >
                      START
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
