'use client'

import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PANEL_EDIT_EVENT } from './panel-events'

/**
 * Detached editors can remain active while Chrome suspends the viewport's RAF
 * callbacks, even with that window visible. Give an edit one fallback redraw.
 * A normal frame cancels it, so an active viewport pays no extra render cost.
 */
export default function PanelRenderBridge({ enabled = true }: { enabled?: boolean }) {
  const get = useThree(state => state.get)
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null)

  useFrame(() => {
    if (pending.current !== null) clearTimeout(pending.current)
    pending.current = null
  }, -100)

  useEffect(() => {
    if (!enabled) return
    const edited = () => {
      // Coalesce a stream of slider events, without postponing the redraw
      // until the drag finishes. This is a throttle, not a trailing debounce.
      if (pending.current !== null) return
      pending.current = setTimeout(() => {
        pending.current = null
        const state = get()
        if (document.hidden || !state.internal.active || state.frameloop === 'never' || state.gl.xr?.isPresenting) return
        state.advance(performance.now(), false)
      }, 32)
    }
    window.addEventListener(PANEL_EDIT_EVENT, edited)
    return () => {
      window.removeEventListener(PANEL_EDIT_EVENT, edited)
      if (pending.current !== null) clearTimeout(pending.current)
      pending.current = null
    }
  }, [enabled, get])

  return null
}
