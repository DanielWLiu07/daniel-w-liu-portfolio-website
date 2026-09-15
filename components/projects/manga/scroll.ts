'use client'

/**
 * Scroll as a REF, never as state.
 *
 * The scene reads scroll every frame, and a setState per scroll event would
 * re-render the React tree sixty times a second for a value only the render loop
 * wants. The casino page does the same thing: a rAF loop writes the ref, and the
 * DOM only hears about it when the value has moved enough to matter.
 */
import { useEffect, useRef, type MutableRefObject } from 'react'

export interface ScrollState {
  /** 0..1 over the whole page */
  progress: number
  /** signed, per frame, for velocity-driven effects */
  velocity: number
}

/** how far progress must move before the DOM is told, so scrolling is not a render storm */
const DOM_EPSILON = 0.004

export function useScrollRef(onCoarseChange?: (p: number) => void): MutableRefObject<ScrollState> {
  const scroll = useRef<ScrollState>({ progress: 0, velocity: 0 })
  const coarse = useRef(-1)

  useEffect(() => {
    let raf = 0
    let last = 0
    const tick = () => {
      const max = Math.max(1, document.body.scrollHeight - window.innerHeight)
      const p = Math.min(1, Math.max(0, window.scrollY / max))
      const s = scroll.current
      s.velocity = p - last
      s.progress = p
      last = p
      if (onCoarseChange && Math.abs(p - coarse.current) > DOM_EPSILON) {
        coarse.current = p
        onCoarseChange(p)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [onCoarseChange])

  return scroll
}

/** t mapped from [a, b] to 0..1, clamped */
export function slice(t: number, [a, b]: [number, number]): number {
  return Math.min(1, Math.max(0, (t - a) / (b - a)))
}

/** smootherstep: zero velocity at both ends, so joins never step */
export function ease(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x * x * x * (x * (x * 6 - 15) + 10)
}
