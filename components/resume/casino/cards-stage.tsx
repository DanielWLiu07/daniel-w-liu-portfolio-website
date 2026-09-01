'use client'

/**
 * The playing card set, laid out so it can be read rather than admired.
 *
 * Not a scene: a SHEET, the same idea as /assets. Every card is the real solid
 * with the real materials, printed through the resume's own watercolour pass, so
 * a change to a pip layout or a court plate can be judged here and lands in the
 * casino page unchanged.
 *
 * Four rows of thirteen, in printing order, laid flat and shot straight down, so
 * a rank whose pips are wrong is countable instead of arguable.
 */
import { Suspense, useEffect, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { COMP_GRAPHS } from './comp-graphs'
import CompositorPost from './compositor-post'
import { driveLamp, feltMaterial, LAMP } from './materials'
import { loadCourtPlates } from './card-art'
import RoyalFlush, {
  ASPECT,
  LINK_KEYS,
  LinkCard,
  RANKS,
  SUITS,
  cardGeometry,
  cardMaterials,
  faceDownMaterials,
  linkCardMaterials,
  type LinkKey,
  type Rank,
  type Suit,
} from './playing-cards'

/**
 * What a slot on the sheet holds. The calling cards print on the same stock and
 * wear the same lit material, so they belong ON the sheet next to the ranks
 * rather than on a page of their own: side by side is the only way to see that
 * the two are getting the same treatment.
 */
type SheetItem = { kind: 'card'; rank: Rank; suit: Suit } | { kind: 'link'; key: LinkKey }
const itemKey = (i: SheetItem) => (i.kind === 'card' ? `${i.rank}${i.suit}` : `link:${i.key}`)

const LEN = 1.4
const WID = LEN * ASPECT
/** gaps wide enough that neighbouring cards do not read as one printed strip */
const COL = WID * 1.16
const ROW = LEN * 1.14

export type CardsMode = 'sheet' | 'fan' | 'links'

/**
 * The lamp is a spot over the felt with a 33 degree cone, which is the point of
 * it: things that leave the pool go dark. A sheet is the one case where that is
 * wrong, because the corner of a 15 unit wide grid is not "off the table", it is
 * the ten of clubs. So the sheet FLOODS the same lamp rather than swapping in a
 * different material: same shader, opened up.
 */
const FLOOD = { y: 16, cone: 82, blend: 0.95, range: 46, ambient: 0.22, gain: 1.0 }

/**
 * AFTER mount, not during render.
 *
 * driveLamp walks the materials that have already been built, and the cards
 * build theirs while they render, which is after this component renders. Driving
 * it in a useMemo set the felt and nothing else: every card kept the default 33
 * degree pool, so the sheet came out bright in the middle four columns and dark
 * at both ends. `count` is in the deps so a change of set re-drives it.
 */
function Flood({ on, count }: { on: boolean; count: number }) {
  useEffect(() => {
    if (on) driveLamp(FLOOD)
    else driveLamp({ y: LAMP.position[1], cone: LAMP.cone, blend: LAMP.blend, range: LAMP.range, ambient: LAMP.ambient, gain: LAMP.gain })
  }, [on, count])
  return null
}

/** frame the grid: zoom so the whole sheet fits whatever window it is opened in */
function FitOrtho({ w, h, pad = 1.08 }: { w: number; h: number; pad?: number }) {
  const { camera, size } = useThree()
  useMemo(() => {
    const cam = camera as THREE.OrthographicCamera
    cam.zoom = Math.min(size.width / (w * pad), size.height / (h * pad))
    cam.updateProjectionMatrix()
  }, [camera, size.width, size.height, w, h, pad])
  return null
}

function Grid({
  cards,
  cols,
  res,
  faceDown,
}: {
  cards: SheetItem[]
  cols: number
  res: number
  faceDown: boolean
}) {
  useCourtPlates()
  const geo = useMemo(() => cardGeometry(LEN), [])
  const felt = useMemo(() => feltMaterial(), [])
  const down = useMemo(() => faceDownMaterials(), [])
  const rows = Math.ceil(cards.length / cols)
  const z0 = -((rows - 1) * ROW) / 2
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} material={felt} receiveShadow>
        <planeGeometry args={[80, 80]} />
      </mesh>
      {cards.map((c, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        // a short last row is centred under the full ones rather than left
        // hanging off the left edge
        const inRow = Math.min(cols, cards.length - row * cols)
        const x0 = -((inRow - 1) * COL) / 2
        const mats = faceDown
          ? down
          : c.kind === 'card'
            ? cardMaterials(c.rank, c.suit, res)
            : linkCardMaterials(c.key, res)
        return (
          <mesh
            key={itemKey(c)}
            geometry={geo}
            material={mats}
            position={[x0 + col * COL, 0, z0 + row * ROW]}
            rotation={new THREE.Euler(-Math.PI / 2, 0, 0, 'YXZ')}
            castShadow
            receiveShadow
          />
        )
      })}
      <FitOrtho w={cols * COL} h={rows * ROW} />
    </>
  )
}

/**
 * The three calling cards under the real lamp, clickable, with a RANKED card
 * either side of them.
 *
 * The neighbours are the point, not decoration. Both wear cardArtMaterial and
 * both print through the same compositor pass, so if the calling cards were
 * getting a different treatment the join between them would show it in one look.
 * Judging a shader on the only thing wearing it tells you nothing.
 */
const LINK_NEIGHBOURS: { rank: Rank; suit: Suit }[] = [
  { rank: 'A', suit: 'spades' },
  { rank: 'K', suit: 'hearts' },
]

function Links({ spin, res }: { spin: boolean; res: number }) {
  useCourtPlates()
  const felt = useMemo(() => feltMaterial(), [])
  const geo = useMemo(() => cardGeometry(LEN), [])
  const g = useMemo(() => new THREE.Group(), [])
  const turn = useMemo(() => ({ t: 0 }), [])
  useFrame((_, dt) => {
    if (!spin) return
    turn.t += dt * 0.2
    g.rotation.y = Math.sin(turn.t) * 0.22
  })
  const gap = LEN * ASPECT * 1.16
  const n = LINK_KEYS.length + LINK_NEIGHBOURS.length
  const x0 = -((n - 1) * gap) / 2
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]} material={felt} receiveShadow>
        <planeGeometry args={[30, 30]} />
      </mesh>
      <primitive object={g}>
        <mesh
          geometry={geo}
          material={cardMaterials(LINK_NEIGHBOURS[0].rank, LINK_NEIGHBOURS[0].suit, res)}
          position={[x0, 0.003, 0]}
          rotation={new THREE.Euler(-Math.PI / 2, 0, 0, 'YXZ')}
          castShadow
          receiveShadow
        />
        {LINK_KEYS.map((k, i) => (
          <LinkCard key={k} linkKey={k} position={[x0 + (i + 1) * gap, 0.003, 0]} length={LEN} res={res} />
        ))}
        <mesh
          geometry={geo}
          material={cardMaterials(LINK_NEIGHBOURS[1].rank, LINK_NEIGHBOURS[1].suit, res)}
          position={[x0 + (n - 1) * gap, 0.003, 0]}
          rotation={new THREE.Euler(-Math.PI / 2, 0, 0, 'YXZ')}
          castShadow
          receiveShadow
        />
      </primitive>
    </>
  )
}

/** the hand on the felt, under the real lamp, so the stock and the light can be judged */
function Fan({ suit, spin }: { suit: Suit; spin: boolean }) {
  useCourtPlates()
  const felt = useMemo(() => feltMaterial(), [])
  const g = useMemo(() => new THREE.Group(), [])
  const turn = useMemo(() => ({ t: 0 }), [])
  useFrame((_, dt) => {
    if (!spin) return
    turn.t += dt * 0.25
    g.rotation.y = turn.t
  })
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]} material={felt} receiveShadow>
        <planeGeometry args={[30, 30]} />
      </mesh>
      <primitive object={g}>
        <RoyalFlush position={[0, 0, 0]} yaw={0} suit={suit} length={1.5} />
      </primitive>
    </>
  )
}

/**
 * Court plates are files on disk, so they load asynchronously while every face
 * is built synchronously. This resolves once, before anything is built, and
 * throws the promise so Suspense holds the scene until it has: without it the
 * first frame prints drawn courts and a later one prints plates, which looks
 * like a flicker and is really a race.
 */
let platesReady: Promise<string[]> | null = null
let platesDone = false
function useCourtPlates() {
  if (platesDone) return
  if (!platesReady) platesReady = loadCourtPlates().then((got) => { platesDone = true; return got })
  throw platesReady
}

export default function CardsStage({
  comp = 'night',
  mode = 'sheet',
  suit,
  rank,
  res,
  faceDown = false,
  spin = true,
}: {
  comp?: string
  mode?: CardsMode
  /** one suit only, or all four */
  suit?: Suit
  /** one rank across all four suits */
  rank?: Rank
  res?: number
  faceDown?: boolean
  spin?: boolean
}) {
  const entry = COMP_GRAPHS[comp] ?? COMP_GRAPHS.night

  const { cards, cols, resolution } = useMemo(() => {
    if (rank) {
      const only: SheetItem[] = SUITS.map((s) => ({ kind: 'card', rank, suit: s }))
      return { cards: only, cols: 4, resolution: res ?? 620 }
    }
    if (suit) {
      const only: SheetItem[] = RANKS.map((r) => ({ kind: 'card', rank: r, suit }))
      return { cards: only, cols: 7, resolution: res ?? 480 }
    }
    const all: SheetItem[] = []
    for (const s of SUITS) for (const r of RANKS) all.push({ kind: 'card', rank: r, suit: s })
    // the calling cards close the sheet the way a real pack's advertisement
    // cards close the box, and it puts them next to the ranks for comparison
    for (const k of LINK_KEYS) all.push({ kind: 'link', key: k })
    // 55 faces at full print resolution is over 100 MB of texture; the sheet is
    // for reading the set, and 300 across still resolves a pip
    return { cards: all, cols: 13, resolution: res ?? 300 }
  }, [rank, suit, res])

  const sheet = mode === 'sheet'
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0d0f0d', zIndex: 100000 }}>
      <Canvas
        dpr={[1, 1.75]}
        shadows
        orthographic={sheet}
        camera={
          sheet
            ? { position: [0, 20, 0.0001], up: [0, 0, -1], zoom: 60, near: 0.1, far: 100 }
            : mode === 'links'
              ? { position: [0, 3.6, 4.0], fov: 34 }
              : { position: [0, 3.5, 3.7], fov: 34 }
        }
        gl={async (props) => {
          const renderer = new WebGPURenderer({ canvas: props.canvas as HTMLCanvasElement, antialias: true })
          await renderer.init()
          return renderer as unknown as never
        }}
      >
        <color attach="background" args={['#0d0f0d']} />
        <Flood on={sheet} count={cards.length} />
        <Suspense fallback={null}>
          {sheet ? (
            <Grid cards={cards} cols={cols} res={resolution} faceDown={faceDown} />
          ) : mode === 'links' ? (
            <Links spin={spin} res={res ?? 620} />
          ) : (
            <Fan suit={suit ?? 'hearts'} spin={spin} />
          )}
        </Suspense>
        {/**
          * positionPass ALWAYS, not the graph's own 'onChange'.
          *
          * The watercolour pass anchors its wash to the world through a POSITION
          * pass, which in 'onChange' mode renders once and waits for a call to
          * invalidatePosition that only the casino scene makes. The fan turns, so
          * the wash would stay pinned to where the cards first were and leave a
          * ghost of them behind.
          */}
        <CompositorPost
          build={entry.build}
          rawOutput={entry.rawOutput}
          renderScale={entry.renderScale ?? 1}
          positionPass="always"
        />
      </Canvas>
    </div>
  )
}
