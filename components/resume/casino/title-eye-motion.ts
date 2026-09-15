import { openAt } from './eye'

const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t) }
const REST = { open: 1, x: 0, y: 0, roll: 0, tilt: 0, yaw: 0, scale: 1, gazeX: 0, gazeY: 0 }

/** Small offsets around the authored pose; each eye has its own rhythm. */
export function titleEyeMotion(time: number, index: number, frozen = false) {
  if (frozen) return REST
  const t = Math.max(0, time - (index % 4) * 0.14), phase = index * 1.73
  const cycle = t / (2.4 + (index % 4) * 0.31) + index * 0.41
  const glance = Math.floor(cycle), blend = smooth(((cycle % 1) - 0.86) / 0.14)
  const gaze = (n: number, vertical: boolean) => vertical ? Math.sin(n * 1.91 + phase) * 0.065 : Math.sin(n * 2.37 + phase) * 0.14
  return {
    open: openAt(t, { wake: 0.6, delay: 0, blink: 0.23, every: 3.1 + (index % 5) * 0.39, phase: (index * 0.381966) % 1 }),
    x: Math.sin(t * 0.68 + phase) * 0.012 + Math.sin(t * 1.13 + phase * 0.7) * 0.004,
    y: Math.sin(t * 0.85 + phase) * 0.018 + Math.cos(t * 0.39 + phase) * 0.006,
    roll: Math.sin(t * 0.72 + phase) * 0.055,
    tilt: Math.sin(t * 0.57 + phase) * 0.035,
    yaw: Math.sin(t * 0.63 + phase + 0.4) * 0.065,
    scale: (0.9 + 0.1 * smooth(t / 0.6)) * (1 + Math.sin(t * 1.07 + phase) * 0.018),
    gazeX: gaze(glance, false) * (1 - blend) + gaze(glance + 1, false) * blend,
    gazeY: gaze(glance, true) * (1 - blend) + gaze(glance + 1, true) * blend,
  }
}
