import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createFolderTape } from '../components/resume/casino/folder-tape'
import { paperSheet, tapeTexture } from '../components/resume/casino/paper'

// Compare tape against actual bent stock/print triangles, including the
// compressed intermediate poses that the former fixed strips ignored.
const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
const ray = new THREE.Raycaster()
let samples = 0
for (const w of [0.65, 1, 1.4]) {
  for (const foldAt of [-1, 1] as const) {
    for (const sharp of [false, true]) {
      const h = w * 1.294
      const thick = w * 0.004
      const rise = w * 0.028
      const paper = paperSheet({ w, h, t: thick }, material,
        { across: 'x', foldAt, up: -1, rise, skew: 0.05, faceInset: sharp ? 0.05 : 0 })
      const tape = createFolderTape(paper.mesh, { w, h, thick, rise, foldAt, skew: 0.05, sharp }, [material, material])
      for (const curl of [0, 0.05, 0.3, 0.7, 1, 0.3, 0]) {
        paper.curl(curl)
        const leafZ = thick * 1.95 * (0.28 + 0.72 * curl)
        tape.update(curl, leafZ)
        for (const mesh of tape.meshes) {
          assert.equal(mesh.userData.compOverlay, sharp)
          const positions = mesh.geometry.getAttribute('position')
          let onPage = 0
          let onFolder = 0
          for (let i = 0; i < positions.count; i++) {
            const p = new THREE.Vector3().fromBufferAttribute(positions, i)
            assert.ok(p.toArray().every(Number.isFinite), 'finite tape surface')
            assert.ok(Math.abs(p.x) < w / 2, 'strips clear the side edges')
            assert.ok(p.y < h / 2 + w * 0.06, 'ends remain inside the folder margin')
            assert.ok(Math.abs(p.x) > w * 0.23, 'central name/header stays unobstructed')
            if (p.y < h / 2 - 1e-6) {
              ray.set(new THREE.Vector3(p.x, p.y, -1), new THREE.Vector3(0, 0, 1))
              const hits = ray.intersectObjects(sharp ? [paper.mesh, paper.face] : [paper.mesh])
              assert.ok(hits.length, 'paper supports the inboard tape')
              const gap = hits[0].point.z - p.z
              assert.ok(gap > 0 && gap < w * 0.002, `tape follows the paper without clipping or floating: ${gap}`)
              onPage++
            } else if (p.y > h / 2 + w * 0.025) {
              assert.ok(Math.abs(p.z - leafZ) < w * 0.002, 'outboard end adheres to the folder')
              onFolder++
            }
            samples++
          }
          assert.ok(onPage > onFolder && onFolder > 0, 'each strip bridges paper AND folder')
        }
      }
      // Position/orientation follow the paper after its stack height changes.
      paper.mesh.position.set(0.3, -0.2, -0.015)
      paper.mesh.rotation.y = 0.08
      tape.update(1, 0.015)
      for (const mesh of tape.meshes) {
        assert.ok(mesh.position.equals(paper.mesh.position))
        assert.ok(mesh.quaternion.equals(paper.mesh.quaternion))
        mesh.geometry.dispose()
      }
      paper.mesh.geometry.dispose()
      paper.face.geometry.dispose()
    }
  }
}

// Exercise the real texture generator without a browser or GPU.
let pixels: { data: Uint8ClampedArray } | undefined
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  createElement: () => ({ getContext: () => ({
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (image: { data: Uint8ClampedArray }) => { pixels = image },
  }) }),
} })
const tex = tapeTexture(1)
assert.ok(pixels)
const data = pixels.data
let translucent = 0
for (let i = 3; i < data.length; i += 4) {
  if (data[i] > 0) {
    assert.ok(data[i] < 210, 'texture stays translucent rather than becoming an opaque strap')
    translucent++
  }
}
assert.ok(translucent > 128 * 512 * 0.85, 'tears preserve the strip body')
assert.ok(translucent < 128 * 512 * 0.96, 'torn ends leave a visible silhouette')
tex.dispose()
material.dispose()
console.log(`Tape checks passed: ${samples} surface samples, folder contact, print clearance, placement and torn translucent texture.`)
