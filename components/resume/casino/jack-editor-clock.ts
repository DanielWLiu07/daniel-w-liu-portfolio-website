/** Editor-only clock. Scrubbing never reloads the canvas or alters the public intro. */
let state = { time: 3.3, playing: false, loop: false, duration: 8, started: 0 }
const listeners = new Set<() => void>()
export const jackClockSnapshot = () => state
export const subscribeJackClock = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const isJackEditor = () => typeof window !== 'undefined' && window.location.pathname.replace(/\/$/, '') === '/resume/jack'
export function jackEditorTime(now = performance.now()) {
  const time = state.time + (state.playing ? (now - state.started) / 1000 : 0)
  return state.loop && state.playing ? time % state.duration : Math.min(time, state.duration)
}
export function setJackClock(patch: Partial<Pick<typeof state, 'time' | 'playing' | 'loop' | 'duration'>>, now = performance.now()) {
  const time = patch.time ?? jackEditorTime(now)
  state = { ...state, ...patch, time: Math.max(0, Math.min(time, patch.duration ?? state.duration)), started: now }
  for (const listener of listeners) listener()
}
