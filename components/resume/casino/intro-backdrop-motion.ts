import { camClimb, camLift, getTune } from './tune'
import { IMPACT_ARRIVE } from './impact-eye-motion'

// Clear during the impact arrival, before its outward departure opens the
// normal room. The backdrop never participates in the name scene's lighting.
export const BACKDROP_CLEAR_AT = IMPACT_ARRIVE
export type BackdropMotion = { travel: number; rush: number; opacity: number; dive: number; flick: number }
export type BackdropLayer = { x: number; y: number; rotation: number; sx: number; sy: number }

/** Same authored camera arc, sampled directly so holds, scrubbing and replay agree. */
export function sampleBackdropMotion(out: BackdropMotion, time: number, impactAge: number) {
  const tn = getTune()
  const dropAt = tn.jkFlick + tn.jkRise + tn.jkHold
  const camera = camLift(time, tn.jkFlick, dropAt, tn.jkFallFor, tn.jkFall)
  // A climbing camera sees its environment move DOWN; falling reverses that.
  // Normalize the complete trip so changing the authored height cannot throw
  // these graphic layers miles outside their overscan bounds.
  out.travel = (tn.jkFall - camera.y) / Math.max(1, Math.abs(camClimb()) + Math.abs(tn.jkFall))
  out.rush = camera.rush
  const fallFrom = Math.max(dropAt + tn.jkOver, dropAt + tn.jkSink)
  out.dive = time <= fallFrom ? 0 : Math.min(1, Math.max(0, 1 - camera.y / Math.max(1, camClimb() + tn.jkFall)))
  const launchAge = Math.max(0, time - tn.jkFlick)
  out.flick = Math.exp(-launchAge * 2.8) * Math.sin(launchAge * 8)
  const fade = Math.min(1, Math.max(0, impactAge / BACKDROP_CLEAR_AT))
  out.opacity = 1 - fade * fade * (3 - 2 * fade)
  return out
}

/** Three counter-moving printed layers: distant wash, engraving and wheel rays.
 * Analytic motion stays continuous at any frame rate and on editor seeks.
 */
export function sampleBackdropLayer(out: BackdropLayer, arc: BackdropMotion, time: number, layer: number, motion: number) {
  const distant = layer === 0
  const direction = layer === 1 ? -1 : 1
  const groove = Math.sin(time * 1.65 + layer * 1.7)
  const swing = Math.sin(time * 0.83 + layer * 1.2)
  // A launch recoil, loose pendulum at the apex, then a winding fall. Opposite
  // turns keep the engraving and sunburst from reading as one rotating card.
  out.rotation = motion * (distant
    ? swing * 0.025 + arc.flick * 0.018
    : direction * (swing * 0.17 + groove * 0.055 + arc.travel * 0.28 + arc.dive * 0.72 + arc.flick * 0.18))
  out.x = motion * (distant ? swing * 0.022 : groove * 0.065 + Math.sin(out.rotation) * 0.1 + arc.flick * direction * 0.065)
  out.y = motion * (arc.travel * (distant ? 0.22 : layer === 1 ? 1.1 : 0.85)
    + Math.sin(time * 1.25 + layer * 0.9) * (distant ? 0.012 : 0.04))
  // Cover the viewport even when rotation, travel and breathing combine.
  // Parent scaling accounts for aspect ratio, so this also holds in portrait.
  const c = Math.abs(Math.cos(out.rotation)), s = Math.abs(Math.sin(out.rotation))
  const ex = 1 / 1.22 + Math.abs(out.x), ey = 1 / 1.22 + Math.abs(out.y)
  const cover = Math.max(1, c * ex + s * ey, s * ex + c * ey) + 0.015
  const breath = 1 + motion * (distant ? 0.008 : 0.035) * (1 + groove)
  out.sx = cover * breath
  out.sy = cover * breath * (1 + arc.rush * (distant ? 0.04 : 0.18) * motion)
  return out
}
