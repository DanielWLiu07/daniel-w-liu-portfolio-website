export function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4)
}

export function getEasedMovementAmount(): number {
  // Slower exit animation speed
  return 0.06
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
