'use client'

/**
 * A riffle shuffle: two halves merge into one interlaced deck, then that deck is
 * bridged square.
 *
 * Built apart from the casino scene so it can be tuned without the table, but on
 * the SAME cards: shape, back art and lit material all come from
 * playing-cards.tsx and materials.ts, and the stage runs the resume's own
 * watercolour pass, so what looks right here looks right when it is dropped in.
 *
 * The motion is a PURE FUNCTION of time. `pose(card, t)` returns a position and
 * a rotation; the frame loop only writes matrices. Nothing integrates frame to
 * frame, so it is deterministic, it can be scrubbed to any instant, and it
 * cannot drift or blow up when a backgrounded tab hands back a four-second
 * delta.
 *
 * The cycle:
 *   0.00 - 0.10  square   one neat deck
 *   0.10 - 0.30  cut      it splits; the halves separate and the top one rides up
 *   0.30 - 0.66  merge    cards fall alternately into ONE stack, still interlaced:
 *                         each card keeps a lateral offset toward its own half,
 *                         which is what a real riffle leaves behind
 *   0.66 - 0.88  bridge   that stack arches, then squares in a wave along its length
 *   0.88 - 1.00  square   neat again, ready to loop
 *
 * NO CLIPPING, and by construction rather than by luck. See CLEARANCE below.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { driveLamp, LAMP } from './materials'
import { ASPECT, cardGeometry, faceDownMaterials } from './playing-cards'

export { ASPECT }

export interface ShuffleOptions {
  count?: number
  /** long side of one card, in world units */
  length?: number
  /** thickness of one card; the deck is count * thickness tall */
  thickness?: number
  /** seconds for one full cycle */
  period?: number
  /** how far each half slides from centre at the cut */
  spread?: number
  /** how high the upper half rides while riffling */
  lift?: number
  /** how far the two halves stay offset once merged, before the bridge squares them */
  interlace?: number
}

export const DEFAULTS: Required<ShuffleOptions> = {
  count: 52,
  length: 1.4,
  /**
   * Real stock. A card is 0.3 mm thick on an 88 mm long card, so a 52 deck
   * stands 0.177 of the card's length. Picking a thickness by eye put the deck
   * at twice that and it read as a bar of soap.
   */
  thickness: (1.4 * 0.177) / 52,
  period: 4.2,
  /**
   * Wide enough that the two halves' FOOTPRINTS do not overlap while they are
   * parked, so nothing about the cut can intersect whatever the cards do. A card
   * is 1.0 wide here, so the centres must be at least that far apart; 0.62 each
   * side leaves a margin for the yaw.
   */
  spread: 0.62,
  /**
   * How high the halves are held. Must clear the merged stack, which grows to
   * count * thickness (0.248 here), or a card falling from a half would land
   * inside the stack it is building.
   */
  lift: 0.36,
  interlace: 0.1,
}

/* phase boundaries, as fractions of the cycle */
const CUT = 0.1
const MERGE = 0.3
const BRIDGE = 0.66
const SETTLE = 0.88

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const ease = (v: number) => {
  const t = clamp01(v)
  return t * t * (3 - 2 * t)
}
/** ease-out, for a card that is released and then arrives */
const easeOut = (v: number) => 1 - (1 - clamp01(v)) ** 3
const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a))

/**
 * A stable per-card wobble. Deterministic on purpose: Math.random gives a
 * different shuffle on every mount, and then the thing you were just looking at
 * is gone and there is nothing to tune against.
 */
function jitter(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x) - 0.5
}

/**
 * The interleave, as a hand does it: alternating CLUMPS from the two halves.
 *
 * Precomputed as a PERMUTATION, so every card gets its own landing slot. The
 * first version derived each card's slot from its position within its half,
 * mapped across the whole deck, which let several cards claim one slot: the
 * merged deck came out with gaps and pile-ups and read as a dropped deck.
 *
 * Clump sizes are hashed, so the shuffle is imperfect the way a hand is and
 * identical on every cycle. A strict one-and-one interleave is a FARO and looks
 * like a machine.
 */
export function buildMerge(count: number, seed = 0): Int32Array {
  const cut = Math.floor(count / 2)
  const merge = new Int32Array(count)
  let lo = 0
  let hi = cut
  let slot = 0
  let fromTop = true
  let step = 0
  while (lo < cut || hi < count) {
    const takeTop = hi < count && (fromTop || lo >= cut)
    const clump = 1 + Math.floor((jitter(step, seed + (takeTop ? 3 : 7)) + 0.5) * 2.6)
    for (let c = 0; c < clump; c++) {
      if (takeTop) {
        if (hi >= count) break
        merge[hi++] = slot++
      } else {
        if (lo >= cut) break
        merge[lo++] = slot++
      }
    }
    fromTop = !fromTop
    step++
  }
  return merge
}

export interface CardPose {
  x: number
  y: number
  z: number
  pitch: number
  yaw: number
  roll: number
}

/**
 * CLEARANCE: the rule that makes tilting safe.
 *
 * A flat card occupies one thickness. A card tilted by theta reaches
 * (length / 2) * sin(theta) below its own centre, which for any visible tilt is
 * tens of times a card's thickness: tilt a card in a stack and its corner goes
 * straight through its neighbours. So the tilt is not a free parameter, it is a
 * FUNCTION of how far the card is above the one below it.
 *
 * Given a vertical gap g, the largest safe tilt is asin((g - thickness) / (L/2)),
 * and a card sitting on the stack gets a tilt of exactly zero.
 */
function safeTilt(gap: number, length: number, thickness: number, max: number): number {
  const reach = Math.max(0, gap - thickness)
  const half = length / 2
  if (reach >= half) return max
  return Math.min(max, Math.asin(reach / half))
}

/**
 * The bridge's arch amplitude, derived rather than dialled.
 *
 * The arch adds A * sin(pi * u) to a deck whose cards are `thickness` apart, so
 * it changes the spacing between neighbours by A * pi / n. Once that exceeds the
 * thickness the cards on the arch's falling side cross THROUGH each other. The
 * deck also loosens while it is bent, which buys back room, so the safe
 * amplitude is thickness * spacing * n / pi, and this takes 80 percent of it.
 */
function archAmplitude(o: Required<ShuffleOptions>, spacingMul: number): number {
  return 0.8 * ((o.thickness * spacingMul * o.count) / Math.PI)
}

/** how much looser the deck rides while it is bridged; the arch is paid for out of this */
const BRIDGE_SPACING = 3.2
const MAX_TILT = 0.34

export function pose(i: number, t: number, o: Required<ShuffleOptions>, merge: Int32Array): CardPose {
  const n = o.count
  const cut = Math.floor(n / 2)
  const inTop = i >= cut
  const side = inTop ? 1 : -1
  const m = merge[i]
  const u = n > 1 ? m / (n - 1) : 0

  const squaredY = i * o.thickness
  const landedY = m * o.thickness
  const wob = jitter(i, 1)

  // ---- square ----
  if (t < CUT) return { x: 0, y: squaredY, z: 0, pitch: 0, yaw: 0, roll: 0 }

  /**
   * CUT. BOTH halves come up off the table, which is the fix for the last kind
   * of self-intersection the check found.
   *
   * With only the top half lifted, a bottom-half card whose landing slot is above
   * its current one has to rise THROUGH the cards still parked above it in its
   * own half, and 11,888 pair-instants did exactly that. Held in two hands above
   * the table, every card is fed from the BOTTOM of its half and falls onto a
   * stack that is always below both of them, so it never crosses its own
   * half-mates and never reaches the other half except in the merged stack, where
   * order is enforced.
   *
   * The halves separate BEFORE they rise, and the two motions do not overlap at
   * all. Letting them run together crossed the pair either side of the cut
   * (cards 25 and 26): one rises to the top of its half while the other drops to
   * the bottom of its own, and they swap heights while still only half a card
   * apart sideways.
   */
  const part = ease(span(t, CUT, CUT + (MERGE - CUT) * 0.5))
  const raise = ease(span(t, CUT + (MERGE - CUT) * 0.55, MERGE))
  /** index within this card's own half, 0 at that half's bottom */
  const inHalf = inTop ? i - cut : i
  const heldY = o.lift + inHalf * o.thickness
  const cutX = side * o.spread * part
  const cutY = squaredY + (heldY - squaredY) * raise
  const cutYaw = side * 0.05 * part
  /**
   * FLAT through the cut and the merge, and this is not a style choice.
   *
   * Two cards from opposite halves tilt opposite ways, and once their footprints
   * meet in the middle they scissor straight through each other: the SAT check
   * found 31,928 intersecting pair-instants, every one of them a bottom-half card
   * against a top-half card, up to 68 thicknesses deep. No amount of vertical
   * ordering fixes that, because the overlap is in the tilt. Cards that stay
   * parallel and separate in height cannot intersect at all.
   */
  const cutPitch = 0
  if (t < MERGE) {
    return { x: cutX, y: cutY, z: 0, pitch: cutPitch, yaw: cutYaw, roll: 0 }
  }

  /**
   * MERGE. Cards release in landing order, so the stack builds from the bottom
   * and a falling card only ever has to clear what is already down.
   *
   * The descent is MONOTONIC: no lob over the top. A hump would let a card rise
   * above the one released before it and the two would swap places in height,
   * which is the one way this arrangement can self-intersect. It is also what a
   * riffle actually does, which is fall.
   */
  const window = 0.22
  const release = u * (1 - window)
  const flight = easeOut(span(t, MERGE + release * (BRIDGE - MERGE), MERGE + (release + window) * (BRIDGE - MERGE)))

  const restX = side * o.interlace + wob * 0.004
  const mergedX = cutX + (restX - cutX) * flight
  const mergedY = cutY + (landedY - cutY) * flight
  if (t < BRIDGE) {
    return {
      x: mergedX,
      y: mergedY,
      z: wob * 0.004,
      pitch: 0,
      yaw: cutYaw * (1 - flight) + wob * 0.02,
      roll: 0,
    }
  }

  /**
   * BRIDGE. The merged deck is still interlaced: every card is offset toward the
   * half it came from. This arches it, then squares it in a WAVE from one end to
   * the other, which is the part that reads as a bridge rather than as a stack
   * quietly tidying itself.
   */
  const b = span(t, BRIDGE, SETTLE)
  const arch = Math.sin(Math.PI * clamp01(b))
  const spacingMul = 1 + (BRIDGE_SPACING - 1) * arch
  const bow = archAmplitude(o, spacingMul) * arch * Math.sin(Math.PI * u)
  // the square-up runs along the deck, so cards near the bottom snap first
  const wave = ease(clamp01((b * 1.7 - u * 0.7) / 0.45))
  return {
    x: restX * (1 - wave),
    y: m * o.thickness * spacingMul + bow,
    z: wob * 0.004 * (1 - wave),
    pitch: 0,
    yaw: wob * 0.02 * (1 - wave),
    roll: 0,
  }
}

/**
 * Every card's pose at one instant, with the separation pass applied.
 *
 * Exported and pure so the no-clipping claim can be CHECKED rather than argued:
 * scripts/check-shuffle.ts walks the cycle through this and tests every pair of
 * cards whose footprints overlap for a y-range collision. The component calls
 * exactly this, so the thing that is tested is the thing that runs.
 */
export function posesAt(
  t: number,
  o: Required<ShuffleOptions>,
  merge: Int32Array,
  order: Int32Array,
): CardPose[] {
  const out: CardPose[] = new Array(o.count)
  let prevY = -Infinity
  // Only once the merge has started, and only for cards that have actually
  // ARRIVED in the merged stack. Running it during the cut walks the deck in
  // MERGED order while the cards are still in SQUARED order, so it reads the two
  // as disagreeing and fans the whole deck into a tower: the first version did
  // exactly that and the cut came out as a staircase.
  const merging = t >= MERGE
  // everything that has started moving inward; a card still parked at its half
  // is footprint-clear of the other half and is left alone
  const near = o.spread * 0.9
  for (let slot = 0; slot < order.length; slot++) {
    const i = order[slot]
    const p = pose(i, t, o, merge)
    if (merging && Math.abs(p.x) <= near) {
      const need = prevY + o.thickness + (o.length / 2) * Math.abs(Math.sin(p.pitch))
      if (p.y < need) p.y = need
      prevY = p.y
    }
    out[i] = p
  }
  return out
}

/** merged slot -> card index, so a deck can be walked bottom-up */
export function slotOrder(merge: Int32Array): Int32Array {
  const a = new Int32Array(merge.length)
  for (let i = 0; i < merge.length; i++) a[merge[i]] = i
  return a
}

/**
 * The same card solid the hand on the felt is built from, so the deck being
 * shuffled is the deck that gets dealt rather than a lookalike.
 */
function useCardGeometry(length: number, thickness: number) {
  return useMemo(() => cardGeometry(length, thickness), [length, thickness])
}

export default function DeckShuffle(props: ShuffleOptions & { paused?: boolean; scrub?: number }) {
  const o = { ...DEFAULTS, ...props }
  const geo = useCardGeometry(o.length, o.thickness)
  const cards = useRef<THREE.Object3D[]>([])
  const clock = useRef(0)
  const merge = useMemo(() => buildMerge(o.count), [o.count])
  const order = useMemo(() => slotOrder(merge), [merge])

  // face down, so both faces of the solid print the deck's back and the rim
  // prints the cut edge
  const materials = useMemo(() => faceDownMaterials(), [])

  // no casino scene here to drive the lamp, so this drives it once itself
  useEffect(() => {
    driveLamp({ y: LAMP.position[1], cone: LAMP.cone, gain: LAMP.gain })
  }, [])
  useEffect(() => () => geo.dispose(), [geo])

  useFrame((_, dt) => {
    // clamped: a backgrounded tab hands back one enormous delta, and a shuffle
    // that teleports through half a cycle on return reads as a bug
    if (!props.paused) clock.current += Math.min(dt, 1 / 20)
    const t = props.scrub !== undefined ? clamp01(props.scrub) : (clock.current % o.period) / o.period

    /**
     * The safety pass. Everything above is designed so cards cannot interpenetrate,
     * but "designed so" is an argument and this is a check: walk the deck in
     * merged order and push any card that has ended up too close to the one below
     * it. Cards still out at the cut are skipped, because the two halves are
     * laterally clear there and are SUPPOSED to overlap in height.
     */
    const poses = posesAt(t, o, merge, order)
    for (let i = 0; i < poses.length; i++) {
      const c = cards.current[i]
      if (!c) continue
      const p = poses[i]
      c.position.set(p.x, p.y, p.z)
      /**
       * ORDER 'YXZ', and it is not cosmetic.
       *
       * Under the default XYZ the Y term is applied BEFORE the card is laid flat
       * by the -90 on X, so it rotates about an axis that is still in the card's
       * plane: what reads in the code as a yaw is actually a tilt. Two cards
       * given opposite "yaws" then scissor through each other, which is what the
       * SAT check kept finding on the pair either side of the cut. In YXZ the Y
       * term is applied last and is a real spin about the world vertical, which
       * cannot bring two parallel cards into contact.
       */
      c.rotation.set(-Math.PI / 2 + p.pitch, p.yaw, p.roll, 'YXZ')
    }
  })

  return (
    <group>
      {Array.from({ length: o.count }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            if (el) cards.current[i] = el
          }}
          geometry={geo}
          material={materials}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  )
}
