type Bounds = { min: { x: number; z: number }; max: { x: number; z: number } }

/** Author the home from the CLOSED, SETTLED folder, never its entrance motion. */
export function fitChipInGap(out: { x: number; z: number; size: number }, x: number, z: number, size: number, rear: number, folder: Bounds) {
  out.x = x
  out.size = size
  const gap = folder.min.z - rear
  if (Number.isFinite(gap) && gap > 0.16 && x >= folder.min.x && x <= folder.max.x) {
    // Retain 0.08 world units of felt on each side even at full hover size. Scaling the
    // landing coin is preferable to changing its target after it has landed.
    out.size = Math.min(size, (gap - 0.16) / (2 * 0.55 * 1.18))
    out.z = (rear + folder.min.z) / 2
  } else out.z = Math.max(z, rear + 0.55 * size * 1.18 + 0.08)
  return out
}
