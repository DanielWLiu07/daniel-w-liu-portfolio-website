// A restrained cut-paper loop. Per-letter phase keeps neighbours out of sync.
const POSES = [
  [0.018, 0.015, -0.018],
  [-0.012, 0.012, 0.014],
  [0.008, -0.008, -0.009],
  [-0.014, 0.005, 0.012],
  [0.011, -0.006, -0.014],
  [-0.006, 0.014, 0.007],
  [0.014, 0.003, -0.011],
  [-0.009, -0.009, 0.013],
] as const
export function hoverCorrection(age: number, seed: number) {
  const pose = age >= 0 && Number.isFinite(age) ? POSES[(Math.floor(age * 12) + Math.abs(seed) * 3) % POSES.length] : undefined
  const sign = seed % 2 ? -1 : 1
  return pose ? { x: pose[0] * sign, y: pose[1], turn: pose[2] * sign } : { x: 0, y: 0, turn: 0 }
}

export function proximityInfluence(distance: number, radius: number) {
  const t = Math.max(0, Math.min(1, 1 - distance / radius))
  return t * t * (3 - 2 * t)
}
