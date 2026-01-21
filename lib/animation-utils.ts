/**
 * Animation utility functions for smooth easing and floating effects
 */

/**
 * Cubic bezier ease-in-out: slow-fast-slow
 * @param t Progress from 0 to 1
 * @returns Eased progress value
 */
export function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/**
 * Calculate eased movement amount based on distance
 * @param distance Current distance from target
 * @param maxDist Maximum distance for normalization
 * @param minSpeed Minimum movement speed
 * @param maxSpeed Maximum movement speed
 * @returns Movement amount per frame
 */
export function getEasedMovementAmount(
  distance: number,
  maxDist: number = 2.0,
  minSpeed: number = 0.02,
  maxSpeed: number = 0.08
): number {
  const normalizedDist = Math.min(distance / maxDist, 1)
  const t = 1 - normalizedDist // progress from 0 to 1
  const easedT = easeInOutCubic(t)
  return minSpeed + easedT * (maxSpeed - minSpeed)
}

/**
 * Generate varied floating animation values
 * Creates organic movement with multiple wave patterns
 * @param time Current time in seconds
 * @param variant 'left' | 'right' to differentiate cards
 * @returns { x, y } float offsets
 */
export function getFloatOffset(
  time: number,
  variant: 'left' | 'right' = 'left'
): { x: number; y: number } {
  if (variant === 'left') {
    // Left card (3D) - smaller movements in 3D units
    return {
      x: Math.sin(time * 0.9 + 0.7) * 0.012,
      y: Math.sin(time * 1.2) * 0.035 + Math.sin(time * 2.1 + 1.3) * 0.018,
    }
  } else {
    // Right card (CSS) - larger movements in pixels
    return {
      x: Math.cos(time * 1.1 + 0.5) * 6,
      y: Math.sin(time * 1.8) * 14 + Math.sin(time * 0.7 + 2.1) * 8,
    }
  }
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Linear interpolation
 */
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t
}
