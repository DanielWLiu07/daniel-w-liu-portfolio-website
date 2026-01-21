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
          const yOffset = (i - (LINES - 1) / 2) / ((LINES - 1) / 2)
          const rotateX = yOffset * 40

          return (
            <div
              key={i}
              className="flash-text-line-wrapper"
              style={{
                transform: `perspective(600px) rotateX(${rotateX}deg)`,
              }}
            >
              <div className={`flash-text-line ${i % 2 === 0 ? 'even' : 'odd'}`}>
                {Array.from({ length: REPEATS }).map((_, j) => {
                  const xOffset = (j - (REPEATS - 1) / 2) / ((REPEATS - 1) / 2)
                  const rotateY = xOffset * -30
                  const scale = 1 + (Math.abs(xOffset) + Math.abs(yOffset)) * 0.15
                  const translateZ = -(Math.abs(xOffset) + Math.abs(yOffset)) * 50

                  return (
                    <span
                      key={j}
                      className="flash-text"
                      style={{
                        transform: `perspective(400px) rotateY(${rotateY}deg) scale(${scale}) translateZ(${translateZ}px)`,
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
