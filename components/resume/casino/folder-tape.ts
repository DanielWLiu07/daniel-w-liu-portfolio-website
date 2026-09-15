import * as THREE from 'three'
import { paperHeight } from './paper'

interface TapePaper {
  w: number
  h: number
  thick: number
  rise: number
  foldAt: -1 | 1
  skew: number
  sharp: boolean
}

/** Two small pieces crossing the top edge, clear of the central name/header. */
export function tapePlacements(w: number) {
  return [
    { x: -w * 0.3, length: w * 0.16, width: w * 0.045, turn: -0.085 },
    { x: w * 0.3, length: w * 0.155, width: w * 0.043, turn: 0.11 },
  ]
}

/**
 * Tape follows the paper, crosses its thickness, then lies on the folder.
 * Rows at both ends of the small bend prevent triangles cutting through the
 * paper edge. These are thin surfaces, without an extruded rim or bevel.
 * Meshes are siblings of the page so the sharp overlay never redraws its stock.
 */
export function createFolderTape(page: THREE.Mesh, paper: TapePaper, materials: THREE.Material[]) {
  const bridge = paper.w * 0.022
  const pieces = tapePlacements(paper.w).map((p, index) => {
    const positions: number[] = []
    const uvs: number[] = []
    const indices: number[] = []
    const c = Math.cos(p.turn)
    const s = Math.sin(p.turn)
    const rows = 28
    const cols = 6
    const start = -p.length * 0.65
    const end = p.length * 0.35
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        const across = (i / cols - 0.5) * p.width
        const edge = -s * across / c
        const flat = edge + bridge / c
        const along = j <= 12
          ? THREE.MathUtils.lerp(start, edge, j / 12)
          : j <= 24
            ? THREE.MathUtils.lerp(edge, flat, (j - 12) / 12)
            : THREE.MathUtils.lerp(flat, end, (j - 24) / 4)
        positions.push(p.x + c * across - s * along, paper.h / 2 + s * across + c * along, 0)
        uvs.push(i / cols, (along - start) / (end - start))
        if (j < rows && i < cols) {
          const a = j * (cols + 1) + i
          // The printed face of the Blender folder faces local -Z.
          indices.push(a, a + cols + 1, a + 1, a + 1, a + cols + 1, a + cols + 2)
        }
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(indices)
    const mesh = new THREE.Mesh(geometry, materials[index])
    mesh.name = `folder_tape_${index}`
    // Draw WITH the sharp print, after its opaque page, so the print cannot
    // erase tape already painted into the background. Blending preserves ink.
    mesh.userData.compOverlay = paper.sharp
    mesh.renderOrder = 3
    return mesh
  })

  const update = (curl: number, leafZ: number) => {
    // Match the stock's swelling and the separate print's actual clearance.
    const stockTop = paper.thick * 0.5 * (1 + 1.8 * curl)
    const clearance = (paper.sharp ? Math.max(paper.thick * 0.25, 0.0008) : 0) + paper.w * 0.00035
    for (const mesh of pieces) {
      mesh.position.copy(page.position)
      mesh.quaternion.copy(page.quaternion)
      const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i)
        const y = pos.getY(i)
        const u = paper.foldAt < 0 ? (x + paper.w / 2) / paper.w : (paper.w / 2 - x) / paper.w
        const v = Math.min(1, y / (paper.h / 2))
        const top = -stockTop - paper.rise * curl * paperHeight(u, v, paper.skew)
        const outside = THREE.MathUtils.clamp((y - paper.h / 2) / bridge, 0, 1)
        const down = outside * outside * (3 - 2 * outside)
        pos.setZ(i, THREE.MathUtils.lerp(top, leafZ, down) - clearance)
      }
      pos.needsUpdate = true
      mesh.geometry.computeVertexNormals()
      mesh.geometry.computeBoundingBox()
      mesh.geometry.computeBoundingSphere()
    }
  }
  return { meshes: pieces, update }
}
