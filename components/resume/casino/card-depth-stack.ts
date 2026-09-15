import * as THREE from 'three'

/** Keep independently tilted cards above earlier cards wherever their faces overlap.
 * Project their stock bounds into the fan's XY plane, clip the convex quads,
 * then separate the face planes at the overlap vertices. Rounded stock lies
 * inside these bounds. All scratch storage is reused between frames.
 */
export class CardDepthStack {
  private faces = Array.from({ length: 5 }, () => ({
    polygon: new Float64Array(8), a: 0, b: 0, c: 0, active: false,
  }))
  private clipA = new Float64Array(24)
  private clipB = new Float64Array(24)
  private normal = new THREE.Vector3()
  private corner = new THREE.Vector3()

  resolve(cards: readonly (THREE.Mesh | null)[]) {
    for (let i = 0; i < this.faces.length; i++) {
      const card = cards[i], face = this.faces[i]
      face.active = !!card?.visible
      if (!card || !face.active) continue
      this.normal.set(0, 0, 1).applyQuaternion(card.quaternion)
      // The choreography keeps every face forward; edge-on faces have no
      // well-defined height plane and are outside this constraint's domain.
      if (this.normal.z <= 0.15) { face.active = false; continue }
      face.a = -this.normal.x / this.normal.z
      face.b = -this.normal.y / this.normal.z
      face.c = card.position.z - face.a * card.position.x - face.b * card.position.y
      for (let k = 0; k < 4; k++) {
        this.corner.set(k === 0 || k === 3 ? -1 / 3 : 1 / 3, k < 2 ? -0.5 : 0.5, 0)
          .applyQuaternion(card.quaternion).add(card.position)
        face.polygon[k * 2] = this.corner.x; face.polygon[k * 2 + 1] = this.corner.y
      }
      for (let j = 0; j < i; j++) {
        const below = this.faces[j]
        if (!below.active) continue
        let input = this.clipA, output = this.clipB, count = 4
        input.set(face.polygon)
        for (let edge = 0; edge < 4 && count > 0; edge++) {
          const next = (edge + 1) % 4
          const ax = below.polygon[edge * 2], ay = below.polygon[edge * 2 + 1]
          const dx = below.polygon[next * 2] - ax, dy = below.polygon[next * 2 + 1] - ay
          let n = 0
          for (let k = 0; k < count; k++) {
            const last = (k + count - 1) % count
            const px = input[last * 2], py = input[last * 2 + 1]
            const qx = input[k * 2], qy = input[k * 2 + 1]
            const p = dx * (py - ay) - dy * (px - ax)
            const q = dx * (qy - ay) - dy * (qx - ax)
            if ((p >= 0) !== (q >= 0)) {
              const t = p / (p - q)
              output[n * 2] = px + (qx - px) * t; output[n * 2 + 1] = py + (qy - py) * t; n++
            }
            if (q >= 0) { output[n * 2] = qx; output[n * 2 + 1] = qy; n++ }
          }
          count = n
          const swap = input; input = output; output = swap
        }
        let lift = 0
        for (let k = 0; k < count; k++) {
          lift = Math.max(lift, (below.a - face.a) * input[k * 2] + (below.b - face.b) * input[k * 2 + 1] + below.c - face.c + 0.012)
        }
        card.position.setZ(card.position.z + lift)
        face.c += lift
      }
    }
  }
}
