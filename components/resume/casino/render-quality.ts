/** Bound internal pixels before the first frame, especially on large/high-DPR screens. */
export function pixelBudgetScale(base: number, width: number, height: number, dpr: number): number {
  const floor = Math.min(base, 0.5)
  const pixels = Math.max(1, width * height * dpr * dpr)
  return Math.min(base, Math.max(floor, Math.sqrt(2_100_000 / pixels)))
}

/** Sustained misses lower quality; isolated compilation stalls do not. No oscillation. */
export class AdaptiveRenderQuality {
  private samples: number[] = []
  private elapsed = 0
  private cooldown = 0

  reset() { this.samples.length = 0; this.elapsed = 0 }

  sample(dt: number, scale: number, base: number): number {
    // A resumed tab/debugger is not a rendering measurement. Repeated 100ms
    // frames, however, are real overload and must not be silently discarded.
    if (!Number.isFinite(dt) || dt <= 0 || dt > 1) { this.reset(); return scale }
    if (this.cooldown > 0) { this.cooldown -= dt; return scale }
    this.samples.push(dt)
    this.elapsed += dt
    if (this.elapsed < 1.2 || this.samples.length < 24) return scale
    const sorted = this.samples.sort((a, b) => a - b)
    const p75 = sorted[Math.floor(sorted.length * 0.75)]
    this.reset()
    if (p75 <= 0.022) return scale
    this.cooldown = 1.5
    const step = p75 > 0.035 ? 0.1 : 0.05
    return Math.max(Math.min(base, 0.5), Math.round((scale - step) * 100) / 100)
  }
}
