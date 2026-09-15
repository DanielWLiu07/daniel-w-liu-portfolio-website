export const IMPACT_ARRIVE = 0.34
export const IMPACT_COAST = 0.12
export const IMPACT_EXIT = 0.54
export const IMPACT_DEPART = IMPACT_ARRIVE + IMPACT_COAST
export const IMPACT_DURATION = IMPACT_DEPART + IMPACT_EXIT
export const IMPACT_PLACEMENT_AGE = 0.18
// Preserve the layout authored on the old third exposure, including the suits.
const placedTime = (Math.floor(IMPACT_PLACEMENT_AGE * 12) + 0.5) / 6
const placedSpread = 1 - Math.pow(1 - placedTime, 3)
const clamp = (v: number) => Math.min(1, Math.max(0, v))

/** Keep side props readable in two-tone until the return covers even the screen corners.
 * Only then settle the extra fill, with zero velocity at both ends to avoid a lighting pop.
 */
export function impactPropFill(age: number): number {
  if (age < 0) return 0
  const t = clamp((age - IMPACT_DURATION) / 0.24)
  return 1 - t * t * (3 - 2 * t)
}

/** One clock for deceleration, slow coasting, outward flight and the expanding normal scene. */
export function impactBurstMotion(age: number, placing = false) {
  const t = Math.max(0, Math.min(IMPACT_DURATION, age))
  const u = clamp(t / IMPACT_ARRIVE)
  // Retain a little outward speed through the authored layout: 3% travel during the coast.
  // Blend a linear component into the ease so its velocity joins the coast without a stop or kink.
  const coastSpeed = 0.25
  const linearWeight = coastSpeed * IMPACT_ARRIVE
  const arrival = placing ? 1 : (1 - linearWeight) * (1 - Math.pow(1 - u, 3))
    + linearWeight * u + coastSpeed * Math.max(0, t - IMPACT_ARRIVE)
  const departure = placing ? 0 : clamp((age - IMPACT_DEPART) / IMPACT_EXIT)
  return {
    arrival,
    travel: placedSpread * arrival,
    // Add acceleration over the continuing coast; never use opacity to make it leave.
    exit: Math.pow(departure, 3),
    // Give the tiny central opening time to read before the edge gathers speed.
    reveal: Math.pow(departure, 4),
    drift: placing ? 0 : Math.max(0, 1 - arrival),
  }
}

/** Pass through the approved layout, keep coasting, then add a separate outward exit translation. */
export function impactEyeMotion(age: number, from = 0, placing = false): { spread: number } {
  const target = from + (1 - from) * placedSpread
  return { spread: from + (target - from) * impactBurstMotion(age, placing).arrival }
}

/** Translate even a sprite near the centre all the way beyond the viewport. */
export function impactExitPosition(x: number, y: number, progress: number, distance: number, seed = 0) {
  const length = Math.hypot(x, y)
  const dx = length > 1e-6 ? x / length : Math.cos(seed * 2.399963)
  const dy = length > 1e-6 ? y / length : Math.sin(seed * 2.399963)
  return { x: x + dx * distance * progress, y: y + dy * distance * progress }
}

/** Low-frequency motion with a different phase per shape, replacing per-exposure jumps. */
export function impactDrift(age: number, seed: number): { x: number; y: number; turn: number } {
  const t = Math.max(0, age)
  const phase = seed * 2.399963
  return {
    x: (Math.sin(phase + t * 2.8) - Math.sin(phase)) * 0.35,
    y: (Math.sin(phase * 1.7 + t * 2.2) - Math.sin(phase * 1.7)) * 0.35,
    turn: (Math.sin(phase * 0.7 + t * 1.8) - Math.sin(phase * 0.7)) * 0.3,
  }
}
