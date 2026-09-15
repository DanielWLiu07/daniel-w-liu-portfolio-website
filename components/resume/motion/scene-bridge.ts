import type { MotionSession, PoseSample } from './types'

export const MOTION_CHANNEL = 'casino-dealer-motion-v1'

/** Paused/restored takes must not keep taking ownership of the scene's idle. */
export function sceneMotionActive(session:MotionSession,now:number,lastScrubAt=-Infinity) {
  if(session.mode==='playback') return !!session.take && (session.playing || now-lastScrubAt<400)
  return (session.mode==='live'||session.mode==='recording') && !!session.frame && now-session.receivedAt<500
}

export function validPose(sample: unknown): sample is PoseSample {
  if (!sample || typeof sample !== 'object') return false
  const s = sample as PoseSample
  if (!Number.isFinite(s.time) || !s.bones || !s.expressions || Object.keys(s.bones).length > 100 || Object.keys(s.expressions).length > 100) return false
  if (s.scales && (Object.keys(s.scales).length > 100 || Object.values(s.scales).some(scale => !Array.isArray(scale) || scale.length !== 3 || scale.some(v => !Number.isFinite(v) || v < .25 || v > 3)))) return false
  return Object.values(s.bones).every(q => Array.isArray(q) && q.length === 4 && q.every(Number.isFinite) && Math.abs(Math.hypot(...q) - 1) < .02)
    && Object.values(s.expressions).every(value => Number.isFinite(value) && value >= 0 && value <= 1)
}
