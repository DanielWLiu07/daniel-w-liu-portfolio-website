export function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4)
}

export function getEasedMovementAmount(
  distance: number,
  maxDist: number = 2.0,
  minSpeed: number = 0.005,
  maxSpeed: number = 0.018
): number {
  // Normalize distance: 0 = at target, 1 = far from target
  const normalizedDist = Math.min(distance / maxDist, 1)
  // Ease-out: fast when far, slow when close (smooth landing)
  const easedT = easeOutQuart(normalizedDist)
  return minSpeed + easedT * (maxSpeed - minSpeed)
}

export function getFloatOffset(
  time: number,
  variant: 'left' | 'right' = 'left'
): { x: number; y: number } {
  if (variant === 'left') {
    // Left cards (3D) - smaller bobbing, moderate speed
    return {
      x: Math.cos(time * 0.8 + 0.5) * 0.01,
      y: Math.sin(time * 1.0) * 0.018 + Math.sin(time * 0.5 + 2.1) * 0.01,
    }
  } else {
    // Right card (CSS) - larger movements in pixels
    return {
      x: Math.cos(time * 1.1 + 0.5) * 6,
      y: Math.sin(time * 1.8) * 14 + Math.sin(time * 0.7 + 2.1) * 8,
    }
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t
}
