import { BufferGeometry, Float32BufferAttribute } from 'three'

export const ROOM_FLOOR_DROP = 6

/** Continuous floor/back wall, with the floor genuinely below the tabletop. */
export function cycloramaGeometry(width: number, floorFront: number, cornerZ: number, radius: number, wallTop: number, segs = 48) {
  const prof: [number, number][] = [[floorFront, 0], [cornerZ + radius, 0]]
  for (let i = 1; i <= segs; i++) {
    const a = (i / segs) * (Math.PI / 2)
    prof.push([cornerZ + radius - Math.sin(a) * radius, radius - Math.cos(a) * radius])
  }
  prof.push([cornerZ, wallTop])
  const pos: number[] = [], nrm: number[] = [], idx: number[] = []
  const hw = width / 2
  for (let i = 0; i < prof.length; i++) {
    const [z, y] = prof[i]
    const [z0, y0] = prof[Math.max(0, i - 1)], [z1, y1] = prof[Math.min(prof.length - 1, i + 1)]
    const tz = z1 - z0, ty = y1 - y0
    const len = Math.hypot(tz, ty) || 1
    const nz = -ty / len, ny = tz / len, sgn = nz + ny >= 0 ? 1 : -1
    pos.push(-hw, y, z, hw, y, z)
    nrm.push(0, ny * sgn, nz * sgn, 0, ny * sgn, nz * sgn)
  }
  for (let i = 0; i < prof.length - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3
    idx.push(a, b, c, b, d, c)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(nrm, 3))
  geometry.setIndex(idx)
  return geometry
}
