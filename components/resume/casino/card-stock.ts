/** Shared solid card stock, usable by the scene and offline character rig. */
import * as THREE from 'three'
import { ASPECT } from './card-art'

/**
 * Real stock, as a fraction of the card's long side: a card is 0.3 mm thick on
 * an 88 mm long card. Picking a thickness by eye put a 52 deck at twice this and
 * it read as a bar of soap.
 */
export const STOCK = 0.177 / 52

/** rounded-rect card outline, centred */
export function cardShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape()
  const x = -w / 2, y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

/** planar UVs over the shape's bounds, so a face texture maps 1:1 */
export function planarUV(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  geo.computeBoundingBox()
  const bb = geo.boundingBox!
  const size = bb.getSize(new THREE.Vector3())
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - bb.min.x) / (size.x || 1)
    uv[i * 2 + 1] = (pos.getY(i) - bb.min.y) / (size.y || 1)
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return geo
}

/** concatenate non indexed parts into one geometry, one material group each */
function joinGroups(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry()
  const counts = parts.map((p) => (p.getAttribute('position') as THREE.BufferAttribute).count)
  const total = counts.reduce((a, b) => a + b, 0)
  const pos = new Float32Array(total * 3)
  const nrm = new Float32Array(total * 3)
  const uv = new Float32Array(total * 2)
  let v = 0
  parts.forEach((p, i) => {
    const P = p.getAttribute('position') as THREE.BufferAttribute
    const N = p.getAttribute('normal') as THREE.BufferAttribute
    const U = p.getAttribute('uv') as THREE.BufferAttribute
    pos.set(P.array as Float32Array, v * 3)
    nrm.set(N.array as Float32Array, v * 3)
    uv.set(U.array as Float32Array, v * 2)
    out.addGroup(v, counts[i], i)
    v += counts[i]
  })
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  out.computeBoundingBox()
  out.computeBoundingSphere()
  return out
}

/**
 * The rim: a band of quads around the outline, written by hand rather than taken
 * from ExtrudeGeometry.
 *
 * ExtrudeGeometry emits two groups, caps and walls, and puts the FRONT and BACK
 * caps in the same one, so a card built that way cannot print a face on one side
 * and the deck's back on the other. Building the band means the geometry has the
 * three groups a card actually has, and the rim gets useful UVs: u runs along the
 * perimeter so the stock's tooth follows the edge, v runs across the thickness.
 */
function rimGeometry(shape: THREE.Shape, t: number, segments: number, repeat: number): THREE.BufferGeometry {
  const pts = shape.getPoints(segments)
  // the outline closes back onto its start; carrying the duplicate would emit a
  // degenerate quad
  if (pts.length > 1 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-6) pts.pop()
  const n = pts.length
  let perim = 0
  const at: number[] = [0]
  for (let i = 0; i < n; i++) {
    perim += pts[i].distanceTo(pts[(i + 1) % n])
    at.push(perim)
  }
  const pos: number[] = [], nrm: number[] = [], uv: number[] = []
  for (let i = 0; i < n; i++) {
    const p0 = pts[i], p1 = pts[(i + 1) % n]
    const dx = p1.x - p0.x, dy = p1.y - p0.y
    const len = Math.hypot(dx, dy) || 1
    // the outline runs counter clockwise, so (dy, -dx) points out of the card
    const nx = dy / len, ny = -dx / len
    const u0 = (at[i] / perim) * repeat, u1 = (at[i + 1] / perim) * repeat
    const A = [p0.x, p0.y, t], B = [p1.x, p1.y, t], Cc = [p1.x, p1.y, -t], D = [p0.x, p0.y, -t]
    const tri = (a: number[], b: number[], c: number[], ua: number[], ub: number[], uc: number[]) => {
      pos.push(...a, ...b, ...c)
      for (let k = 0; k < 3; k++) nrm.push(nx, ny, 0)
      uv.push(...ua, ...ub, ...uc)
    }
    tri(A, D, Cc, [u0, 1], [u0, 0], [u1, 0])
    tri(A, Cc, B, [u0, 1], [u1, 0], [u1, 1])
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm), 3))
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2))
  return g
}

/**
 * One card of stock. Groups: 0 front, 1 back, 2 rim.
 *
 * `length` is the card's long side in world units; the width follows from the
 * poker proportion so a card can never be built out of shape.
 */
export function cardGeometry(length: number, thickness = length * STOCK, segments = 12): THREE.BufferGeometry {
  const w = length * ASPECT
  const shape = cardShape(w, length, Math.min(w, length) * 0.07)
  const t = thickness / 2

  const front = planarUV(new THREE.ShapeGeometry(shape, segments)).toNonIndexed()
  front.translate(0, 0, t)
  front.computeVertexNormals()

  // UVs BEFORE the half turn on purpose: computed after, u would climb with
  // world +x, which is the viewer's left when they are behind the card, and the
  // back would print mirrored
  const back = planarUV(new THREE.ShapeGeometry(shape, segments)).toNonIndexed()
  back.rotateY(Math.PI)
  back.translate(0, 0, -t)
  back.computeVertexNormals()

  // the tooth repeats about once per card length around the edge
  const rim = rimGeometry(shape, t, segments, Math.max(2, Math.round((2 * (w + length)) / length)))

  return joinGroups([front, back, rim])
}

