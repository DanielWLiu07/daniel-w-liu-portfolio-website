'use client'

import { useEffect, useRef, useState } from 'react'

interface TransitionFlashProps {
  trigger: boolean
  onComplete?: () => void
}

const FADE_IN_DURATION = 600
const FULL_DURATION = 300
const FADE_OUT_DURATION = 600

export default function TransitionFlash({ trigger, onComplete }: TransitionFlashProps) {
  const [mounted, setMounted] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!trigger) {
      setMounted(false)
      return
    }

    setMounted(true)
  }, [trigger])

  useEffect(() => {
    if (!mounted || !trigger) return

    const el = ref.current
    if (!el) return

    // Start at opacity 0
    el.style.transition = 'none'
    el.style.opacity = '0'

    // Force reflow to ensure opacity 0 is applied
    el.offsetHeight

    // Now enable transition and fade in
    el.style.transition = `opacity ${FADE_IN_DURATION}ms ease-in-out`
    el.style.opacity = '1'

    // After fade-in + full duration, fade out
    const fadeOutTimer = setTimeout(() => {
      el.style.transition = `opacity ${FADE_OUT_DURATION}ms ease-in-out`
      el.style.opacity = '0'
    }, FADE_IN_DURATION + FULL_DURATION)

    // After everything, unmount
    const completeTimer = setTimeout(() => {
      setMounted(false)
      onComplete?.()
    }, FADE_IN_DURATION + FULL_DURATION + FADE_OUT_DURATION)

    return () => {
      clearTimeout(fadeOutTimer)
      clearTimeout(completeTimer)
    }
  }, [mounted, trigger, onComplete])

  if (!mounted) return null

  return (
    <div
      ref={ref}
      className="fixed inset-0 w-screen h-screen z-[9999] bg-white pointer-events-none"
      style={{ opacity: 0 }}
    />
  )
}
