import { useEffect, useState } from 'react'

/** Loading readiness and the transition cover are separate gates. */
export function canStartCasinoIntro(sceneReady: boolean, transitionStage: string) {
  return sceneReady && (transitionStage === 'revealing' || transitionStage === 'hidden')
}

export const INTRO_RELEASE_EVENT = 'casino:release-intro'

/**
 * Hold the opening beat at frame 0 (scene loaded and compiled, nothing moving).
 * - A render server seat (experiments/pixel-stream) sets `window.__casinoHoldIntro`
 *   and releases it with INTRO_RELEASE_EVENT once its visitor is watching.
 * - A visitor who is being streamed warms a local copy in the background with
 *   `external` held, then releases it at the handoff.
 * Without either, this is always false.
 */
export function useIntroHold(external = false): boolean {
  const [held, setHeld] = useState(() =>
    typeof window !== 'undefined' && Boolean((window as Window & { __casinoHoldIntro?: boolean }).__casinoHoldIntro))
  useEffect(() => {
    if (!held) return
    const release = () => setHeld(false)
    window.addEventListener(INTRO_RELEASE_EVENT, release)
    return () => window.removeEventListener(INTRO_RELEASE_EVENT, release)
  }, [held])
  return held || external
}
