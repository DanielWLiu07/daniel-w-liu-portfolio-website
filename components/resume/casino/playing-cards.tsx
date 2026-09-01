'use client'

/**
 * Cards as objects: the geometry, the materials and the hand on the felt.
 *
 * The ART lives in card-art.ts, which draws the whole 52 card set on canvas and
 * knows nothing about three. This file turns one of those faces into something
 * that can sit in a scene, so a change to the printing never touches the scene
 * and a change to the stock never touches the printing.
 *
 * A card here is a SOLID, not a quad: a rounded rectangle with real thickness
 * and three material groups, front, back and rim, so the face and the back can
 * be different prints and the cut edge is its own cream stock. Two planes with a
 * gap between them read as a card face on but go transparent at a grazing angle,
 * which is exactly the angle a hand fanned on a table is seen from.
 */
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { SOCIAL_URLS } from '@/data/social-links'
import { cardArtMaterial } from './materials'
import { claimPointer, releasePointer } from './cursor'
import {
  ASPECT,
  LINK_CARDS,
  LINK_KEYS,
  RANKS,
  SUITS,
  cardBackCanvas,
  cardEdgeCanvas,
  cardFaceCanvas,
  cardId,
  deck,
  handleFor,
  linkCardFaceCanvas,
  type Card as CardSpec,
  type LinkKey,
  type Rank,
  type Suit,
} from './card-art'

export {
  ASPECT,
  LINK_CARDS,
  LINK_KEYS,
  RANKS,
  SUITS,
  cardBackCanvas,
  cardEdgeCanvas,
  cardFaceCanvas,
  cardId,
  deck,
  handleFor,
  linkCardFaceCanvas,
  type CardSpec,
  type LinkKey,
  type Rank,
  type Suit,
}

/**
 * Where each calling card points. Read from the site's ONE table of profile
 * URLs, so a card can never send anyone somewhere the rest of the site does not.
 * Devpost is empty there for now, and an empty URL makes that card inert rather
 * than guessed.
 */
export const LINK_HREF: Record<LinkKey, string> = {
  linkedin: SOCIAL_URLS.linkedin,
  devpost: SOCIAL_URLS.devpost,
  github: SOCIAL_URLS.github,
}

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

/* -------------------------------------------------------------------------- */

function canvasTexture(c: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping
    t.wrapT = THREE.RepeatWrapping
  }
  return t
}

/** the shared back and rim, built once: every card in a scene flips onto the same back */
let SHARED: { back: THREE.Material; rim: THREE.Material } | null = null
export function sharedCardMaterials() {
  if (!SHARED) {
    SHARED = {
      back: cardArtMaterial(canvasTexture(cardBackCanvas()), 'back'),
      rim: cardArtMaterial(canvasTexture(cardEdgeCanvas(), true), 'edge'),
    }
  }
  return SHARED
}

const FACE_CACHE = new Map<string, THREE.Material>()
/** the printed face of one card, built once per card and reused across the page */
export function cardFaceMaterial(rank: Rank, suit: Suit, res = 620): THREE.Material {
  const k = `${rank}${suit}@${res}`
  const hit = FACE_CACHE.get(k)
  if (hit) return hit
  const m = cardArtMaterial(canvasTexture(cardFaceCanvas(rank, suit, res)), k)
  FACE_CACHE.set(k, m)
  return m
}

/** front, back, rim, in the order cardGeometry's groups expect */
export function cardMaterials(rank: Rank, suit: Suit, res = 620): THREE.Material[] {
  const s = sharedCardMaterials()
  return [cardFaceMaterial(rank, suit, res), s.back, s.rim]
}

const LINK_CACHE = new Map<string, THREE.Material>()
/** front, back, rim for one calling card */
export function linkCardMaterials(key: LinkKey, res = 620): THREE.Material[] {
  const href = LINK_HREF[key]
  const k = `link:${key}@${res}:${href}`
  let face = LINK_CACHE.get(k)
  if (!face) {
    face = cardArtMaterial(canvasTexture(linkCardFaceCanvas(key, href, res)), k)
    LINK_CACHE.set(k, face)
  }
  const s = sharedCardMaterials()
  return [face, s.back, s.rim]
}

/**
 * One calling card, clickable.
 *
 * The lift on hover is what says it is not scenery. A card whose URL is empty
 * still prints and still lifts nothing: it takes no pointer claim and opens
 * nothing, so it cannot send anyone to a guessed profile.
 */
export function LinkCard({
  linkKey,
  position = [0, 0, 0],
  rotation = [-Math.PI / 2, 0, 0],
  length = 1.4,
  res = 620,
}: {
  linkKey: LinkKey
  position?: [number, number, number]
  rotation?: [number, number, number]
  length?: number
  res?: number
}) {
  const geo = useMemo(() => cardGeometry(length), [length])
  const mats = useMemo(() => linkCardMaterials(linkKey, res), [linkKey, res])
  const [hot, setHot] = useState(false)
  const href = LINK_HREF[linkKey]
  const id = `linkcard:${linkKey}`
  useEffect(() => () => releasePointer(id), [id])
  useEffect(() => () => geo.dispose(), [geo])
  return (
    <mesh
      geometry={geo}
      material={mats}
      position={[position[0], position[1] + (hot && href ? length * 0.055 : 0), position[2]]}
      rotation={new THREE.Euler(rotation[0], rotation[1], rotation[2], 'YXZ')}
      castShadow
      receiveShadow
      onPointerOver={(e) => {
        e.stopPropagation()
        if (!href) return
        setHot(true)
        claimPointer(id, true)
      }}
      onPointerOut={() => {
        setHot(false)
        claimPointer(id, false)
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (href) window.open(href, '_blank', 'noopener,noreferrer')
      }}
    />
  )
}

/** a card that shows its back on both sides, for a face down deck */
export function faceDownMaterials(): THREE.Material[] {
  const s = sharedCardMaterials()
  return [s.back, s.back, s.rim]
}

/**
 * One card in a scene. Lying flat is the common case, so the default rotation
 * puts the face up rather than making every call site remember the quarter turn.
 */
export function Card({
  rank,
  suit,
  position = [0, 0, 0],
  rotation = [-Math.PI / 2, 0, 0],
  length = 1.4,
  res = 620,
  faceDown = false,
}: {
  rank: Rank
  suit: Suit
  position?: [number, number, number]
  rotation?: [number, number, number]
  length?: number
  res?: number
  faceDown?: boolean
}) {
  const geo = useMemo(() => cardGeometry(length), [length])
  const mats = useMemo(() => (faceDown ? faceDownMaterials() : cardMaterials(rank, suit, res)), [rank, suit, res, faceDown])
  useEffect(() => () => geo.dispose(), [geo])
  return (
    <mesh
      geometry={geo}
      material={mats}
      position={position}
      rotation={new THREE.Euler(rotation[0], rotation[1], rotation[2], 'YXZ')}
      castShadow
      receiveShadow
    />
  )
}

export const ROYAL_FLUSH: Rank[] = ['10', 'J', 'Q', 'K', 'A']

/**
 * The hand on the felt: a royal flush, fanned.
 *
 * Cards are lifted along the fan by a hair each, and pushed back by their
 * distance from the middle, so the fan is a shallow arc rather than five cards
 * fighting for the same plane.
 */
export default function RoyalFlush({
  position = [-3.2, 0, 1.2],
  yaw = 0.12,
  suit = 'hearts',
  length = 1.5,
  spread = 0.9,
  arc = 0.16,
}: {
  position?: [number, number, number]
  yaw?: number
  suit?: Suit
  /** long side of one card (world) */
  length?: number
  /** distance between card centres, as a fraction of the card width */
  spread?: number
  /** angle between cards (radians) */
  arc?: number
}) {
  const w = length * ASPECT
  const geo = useMemo(() => cardGeometry(length), [length])
  const mats = useMemo(
    () => Object.fromEntries(ROYAL_FLUSH.map((r) => [r, cardMaterials(r, suit)])) as Record<Rank, THREE.Material[]>,
    [suit],
  )
  useEffect(() => () => geo.dispose(), [geo])

  const n = ROYAL_FLUSH.length
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      {ROYAL_FLUSH.map((rank, i) => {
        const t = i - (n - 1) / 2
        return (
          <mesh
            key={rank}
            geometry={geo}
            material={mats[rank]}
            position={[t * w * spread, i * 0.004 + 0.002, Math.abs(t) * length * 0.04]}
            rotation={new THREE.Euler(-Math.PI / 2, 0, -t * arc, 'YXZ')}
            castShadow
            receiveShadow
          />
        )
      })}
    </group>
  )
}
