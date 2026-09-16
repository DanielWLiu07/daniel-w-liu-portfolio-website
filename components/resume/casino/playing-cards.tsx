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
import { cardGeometry } from './card-stock'
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

export { STOCK, cardShape, planarUV, cardGeometry } from './card-stock'

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
