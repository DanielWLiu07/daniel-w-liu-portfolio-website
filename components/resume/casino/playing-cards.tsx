'use client'

/**
 * The hand: a royal flush in hearts (10 J Q K A) on the felt.
 *
 * Shape: a rounded-rectangle card (poker proportion 2.5 x 3.5), built as two shape planes back to back
 * (face and back) plus a thin rim, so it reads as card stock rather than a quad.
 * Faces: drawn on canvas in the casino palette (corner indices both ways up, court letters with a heart,
 * classic pip layout for the ten), so no bitmaps ship with the page.
 * Materials: the same lamp term as everything else, so the hand sits in the light.
 */
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { cardArtMaterial } from './materials'

const CARD_W = 2.5
const CARD_H = 3.5
const ASPECT = CARD_W / CARD_H
const RED = '#b8181c'
const INK = '#1a1a1a'
const PAPER = '#f6f2e6'

export type Rank = '10' | 'J' | 'Q' | 'K' | 'A'

/** rounded-rect card outline, centred, width 1 and height 1/ASPECT */
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

function heart(x: CanvasRenderingContext2D, cx: number, cy: number, s: number, colour = RED) {
  x.save()
  x.translate(cx, cy)
  x.scale(s, s)
  x.beginPath()
  x.moveTo(0, 0.32)
  x.bezierCurveTo(-0.55, -0.12, -0.36, -0.62, 0, -0.3)
  x.bezierCurveTo(0.36, -0.62, 0.55, -0.12, 0, 0.32)
  x.closePath()
  x.fillStyle = colour
  x.fill()
  x.restore()
}

function corner(x: CanvasRenderingContext2D, rank: Rank, w: number, h: number, flip: boolean) {
  x.save()
  if (flip) {
    x.translate(w, h)
    x.rotate(Math.PI)
  }
  x.fillStyle = RED
  x.font = `700 ${rank === '10' ? 74 : 88}px Georgia, "Times New Roman", serif`
  x.textAlign = 'center'
  x.fillText(rank, 64, 104)
  heart(x, 64, 168, 52)
  x.restore()
}

/**
 * A court plate: a half figure drawn into the top half and mirrored into the bottom, the way a real court
 * card is printed. Bold shapes only (crown / tiara / hat, face, collar, robe with a heart), because the
 * watercolour pass eats fine line work.
 */
function courtHalf(x: CanvasRenderingContext2D, rank: 'J' | 'Q' | 'K', W: number, H: number) {
  const cx = W / 2
  const ink = INK
  x.lineWidth = Math.max(3, W * 0.008)
  x.strokeStyle = ink
  x.lineJoin = 'round'
  // robe: a broad wedge from the waist up to the shoulders
  x.beginPath()
  x.moveTo(cx - W * 0.34, H * 0.5)
  x.lineTo(cx - W * 0.2, H * 0.3)
  x.lineTo(cx + W * 0.2, H * 0.3)
  x.lineTo(cx + W * 0.34, H * 0.5)
  x.closePath()
  x.fillStyle = RED
  x.fill()
  x.stroke()
  // collar
  x.beginPath()
  x.moveTo(cx - W * 0.2, H * 0.3)
  x.lineTo(cx, H * 0.38)
  x.lineTo(cx + W * 0.2, H * 0.3)
  x.closePath()
  x.fillStyle = PAPER
  x.fill()
  x.stroke()
  // a heart on the chest
  heart(x, cx, H * 0.44, W * 0.13)
  // face
  x.beginPath()
  x.ellipse(cx, H * 0.22, W * 0.1, H * 0.075, 0, 0, Math.PI * 2)
  x.fillStyle = PAPER
  x.fill()
  x.stroke()
  // eyes and mouth
  x.fillStyle = ink
  x.beginPath()
  x.arc(cx - W * 0.04, H * 0.21, W * 0.011, 0, Math.PI * 2)
  x.arc(cx + W * 0.04, H * 0.21, W * 0.011, 0, Math.PI * 2)
  x.fill()
  x.beginPath()
  x.moveTo(cx - W * 0.03, H * 0.245)
  x.quadraticCurveTo(cx, H * 0.255, cx + W * 0.03, H * 0.245)
  x.stroke()
  if (rank === 'K') {
    // crown: three points with jewels, and a beard
    x.beginPath()
    x.moveTo(cx - W * 0.14, H * 0.155)
    x.lineTo(cx - W * 0.1, H * 0.075)
    x.lineTo(cx - W * 0.05, H * 0.13)
    x.lineTo(cx, H * 0.06)
    x.lineTo(cx + W * 0.05, H * 0.13)
    x.lineTo(cx + W * 0.1, H * 0.075)
    x.lineTo(cx + W * 0.14, H * 0.155)
    x.closePath()
    x.fillStyle = RED
    x.fill()
    x.stroke()
    x.fillStyle = PAPER
    for (const jx of [-0.1, 0, 0.1]) {
      x.beginPath()
      x.arc(cx + W * jx, H * 0.105, W * 0.014, 0, Math.PI * 2)
      x.fill()
      x.stroke()
    }
    x.beginPath()
    x.moveTo(cx - W * 0.07, H * 0.26)
    x.quadraticCurveTo(cx, H * 0.33, cx + W * 0.07, H * 0.26)
    x.strokeStyle = ink
    x.stroke()
  } else if (rank === 'Q') {
    // tiara: a low band with three small points
    x.beginPath()
    x.moveTo(cx - W * 0.13, H * 0.155)
    x.lineTo(cx - W * 0.08, H * 0.1)
    x.lineTo(cx - W * 0.03, H * 0.14)
    x.lineTo(cx, H * 0.09)
    x.lineTo(cx + W * 0.03, H * 0.14)
    x.lineTo(cx + W * 0.08, H * 0.1)
    x.lineTo(cx + W * 0.13, H * 0.155)
    x.closePath()
    x.fillStyle = RED
    x.fill()
    x.stroke()
    // hair falling either side
    x.fillStyle = ink
    x.beginPath()
    x.moveTo(cx - W * 0.1, H * 0.17)
    x.quadraticCurveTo(cx - W * 0.17, H * 0.26, cx - W * 0.11, H * 0.31)
    x.stroke()
    x.beginPath()
    x.moveTo(cx + W * 0.1, H * 0.17)
    x.quadraticCurveTo(cx + W * 0.17, H * 0.26, cx + W * 0.11, H * 0.31)
    x.stroke()
  } else {
    // jack: a soft cap with a feather
    x.beginPath()
    x.moveTo(cx - W * 0.13, H * 0.16)
    x.quadraticCurveTo(cx, H * 0.05, cx + W * 0.13, H * 0.16)
    x.closePath()
    x.fillStyle = RED
    x.fill()
    x.stroke()
    x.beginPath()
    x.moveTo(cx + W * 0.1, H * 0.14)
    x.quadraticCurveTo(cx + W * 0.22, H * 0.07, cx + W * 0.17, H * 0.02)
    x.strokeStyle = ink
    x.stroke()
  }
}

function faceCanvas(rank: Rank): HTMLCanvasElement {
  const W = 620, H = Math.round(620 / ASPECT)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const x = c.getContext('2d')!
  x.fillStyle = PAPER
  x.fillRect(0, 0, W, H)
  // a hairline frame, the way a printed card carries one
  x.strokeStyle = 'rgba(184,24,28,0.35)'
  x.lineWidth = 6
  x.strokeRect(26, 26, W - 52, H - 52)
  corner(x, rank, W, H, false)
  corner(x, rank, W, H, true)
  const cx = W / 2, cy = H / 2
  if (rank === 'A') {
    heart(x, cx, cy, 300)
  } else if (rank === '10') {
    // classic ten: two columns of four plus two centred, mirrored top and bottom
    const col = [W * 0.34, W * 0.66]
    const rows = [H * 0.2, H * 0.36, H * 0.64, H * 0.8]
    for (const px of col) for (const py of rows) heart(x, px, py, 96)
    heart(x, cx, H * 0.28, 96)
    heart(x, cx, H * 0.72, 96)
  } else {
    // court plate: the figure drawn once and mirrored, with the dividing rule
    x.save()
    x.beginPath()
    x.rect(W * 0.16, H * 0.05, W * 0.68, H * 0.45)
    x.clip()
    courtHalf(x, rank, W, H)
    x.restore()
    x.save()
    x.translate(W, H)
    x.rotate(Math.PI)
    x.beginPath()
    x.rect(W * 0.16, H * 0.05, W * 0.68, H * 0.45)
    x.clip()
    courtHalf(x, rank, W, H)
    x.restore()
    x.strokeStyle = 'rgba(26,26,26,0.4)'
    x.lineWidth = 4
    x.beginPath()
    x.moveTo(W * 0.16, cy)
    x.lineTo(W * 0.84, cy)
    x.stroke()
    x.strokeStyle = 'rgba(184,24,28,0.5)'
    x.strokeRect(W * 0.16, H * 0.05, W * 0.68, H * 0.9)
  }
  return c
}

function backCanvas(): HTMLCanvasElement {
  const W = 620, H = Math.round(620 / ASPECT)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const x = c.getContext('2d')!
  x.fillStyle = RED
  x.fillRect(0, 0, W, H)
  x.fillStyle = PAPER
  x.fillRect(22, 22, W - 44, H - 44)
  x.fillStyle = RED
  x.fillRect(38, 38, W - 76, H - 76)
  // lattice
  x.strokeStyle = 'rgba(246,242,230,0.5)'
  x.lineWidth = 3
  for (let i = -H; i < W; i += 34) {
    x.beginPath(); x.moveTo(i, 38); x.lineTo(i + H, H - 38); x.stroke()
    x.beginPath(); x.moveTo(i, H - 38); x.lineTo(i + H, 38); x.stroke()
  }
  return c
}

export const ROYAL_FLUSH: Rank[] = ['10', 'J', 'Q', 'K', 'A']

export default function RoyalFlush({
  position = [-3.2, 0, 1.2],
  yaw = 0.12,
  length = 1.5,
  spread = 0.9,
  arc = 0.16,
}: {
  position?: [number, number, number]
  yaw?: number
  /** long side of one card (world) */
  length?: number
  /** distance between card centres, as a fraction of the card width */
  spread?: number
  /** angle between cards (radians) */
  arc?: number
}) {
  const w = length * ASPECT
  const geo = useMemo(() => {
    const shape = cardShape(w, length, Math.min(w, length) * 0.07)
    const front = planarUV(new THREE.ShapeGeometry(shape, 12))
    const back = planarUV(new THREE.ShapeGeometry(shape, 12))
    back.rotateY(Math.PI)
    return { front, back }
  }, [w, length])
  const mats = useMemo(() => {
    const faces = {} as Record<Rank, THREE.Material>
    for (const r of ROYAL_FLUSH) {
      const t = new THREE.CanvasTexture(faceCanvas(r))
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 8
      faces[r] = cardArtMaterial(t, r)
    }
    const bt = new THREE.CanvasTexture(backCanvas())
    bt.colorSpace = THREE.SRGBColorSpace
    return { faces, back: cardArtMaterial(bt, 'back') }
  }, [])
  useEffect(
    () => () => {
      geo.front.dispose()
      geo.back.dispose()
    },
    [geo],
  )

  const n = ROYAL_FLUSH.length
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      {ROYAL_FLUSH.map((rank, i) => {
        const t = i - (n - 1) / 2
        return (
          <group key={rank} position={[t * w * spread, i * 0.004, Math.abs(t) * length * 0.04]} rotation={[-Math.PI / 2, 0, -t * arc]}>
            <mesh geometry={geo.front} material={mats.faces[rank]} position={[0, 0, 0.002]} castShadow />
            <mesh geometry={geo.back} material={mats.back} position={[0, 0, -0.002]} />
          </group>
        )
      })}
    </group>
  )
}
