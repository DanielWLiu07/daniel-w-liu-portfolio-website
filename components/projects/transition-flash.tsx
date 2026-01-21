'use client'

import { useEffect, useRef } from 'react'

interface TransitionFlashProps {
  show: boolean
}

export default function TransitionFlash({ show }: TransitionFlashProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (show) {
      el.style.transition = 'opacity 400ms ease-out'
      el.style.display = 'block'
      el.offsetHeight
      el.style.opacity = '1'
    } else {
      el.style.transition = 'opacity 600ms ease-in-out'
      el.style.opacity = '0'
      const handler = () => {
        if (el.style.opacity === '0') {
          el.style.display = 'none'
        }
      }
      el.addEventListener('transitionend', handler, { once: true })
      return () => el.removeEventListener('transitionend', handler)
    }
  }, [show])

  return (
    <div
      ref={ref}
      className="fixed inset-0 w-screen h-screen z-[9999] bg-white pointer-events-none"
      style={{
        display: 'none',
        opacity: 0,
        transition: 'opacity 400ms ease-in-out',
        willChange: 'opacity',
      }}
    />
  )
}
