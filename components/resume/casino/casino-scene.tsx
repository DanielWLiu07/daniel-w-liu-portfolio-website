'use client'

/**
 * The casino floor: "Always bet on Daniel W Liu". One long scroll drives
 * everything: `progress` (0..1 over the page) is read every frame from a ref,
 * and each beat of the scene keys off a slice of it. Cards are roles, chip
 * stacks are the tech stack, cash out is the resume. Rendering goes through the
 * manga post pass, so this file draws flat palette colours and lets the pass
 * make the print.
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { ShadowNodeMaterial } from 'three/webgpu'
import { compileNode, createMangaPost, graph, growFromImpact, revealMask, withOverlay, type Graph, type GraphNode, type MangaUniforms } from 'blender-to-threejs'
import { experiences } from '@/data/experience'
import { techCategories } from '@/data/tech-stack'
import {
  cardBackMaterial,
  cardFaceMaterial,
  chipFaceMaterial,
  chipMaterial,
  feltMaterial,
  inkMaterial,
  paperMaterial,
  type ChipInk,
} from './materials'
import Dealer from './dealer'
import Reaper from './reaper'
import ResumeFolder, { FOLDER_TIME, type PageFrameOut } from './resume-folder'
import RoyalFlush from './playing-cards'
import HeroChip, { type ChipWordState, type ImpactFx } from './hero-chip'
import JackIntro, { FallStreaks } from './jack-intro'
import EyeField from './eye-field'
import TitleProps from './title-props'

import ResumeWord from './resume-word'
import CompositorPost from './compositor-post'
import Apple, { PommeLights } from './apple'
import RoundTable, { type TableFit } from './round-table'
import FlatTable, { RailTube, tableGraph, tableUniforms, type FlatTableSpec } from './flat-table'
import { beatTime, camLift, getTune, REVEAL_TIME_SCALE, useTune, type Tune } from './tune'
import { driveLamp, LAMP, roomMaterial } from './materials'
import SetEditor, { type SetPiece } from './set-editor'
import { applyLayout, type StageLayout } from 'blender-to-threejs'
import { impactPass, COMP_GRAPHS } from './comp-graphs'

/** the window shape the title's numbers were dialled in at: 1500 x 900 */
const TITLE_TUNED_AT = 1500 / 900

export interface ScrollState {
  /** 0..1 over the whole page */
  progress: number
  /** signed, px per frame, for spin effects */
  velocity: number
}

/** Beats along the scroll. Each is [start, end] of the page progress. */
export const BEATS = {
  marquee: [0, 0.18],
  deal: [0.14, 0.5],
  chips: [0.48, 0.74],
  sign: [0.72, 1],
} as const

/**
 * Drops the compositor's internal resolution until the page actually hits its frame budget.
 *
 * The pass is the whole cost of this page and it is pixel-bound: measured, the same scene is 13.9 ms a
 * frame at 1280x720, 20.2 at 1920x1080 and 34.5 at 1920x1080 on a 2x display, with nothing else changing.
 * So the right number is not a constant at all - it depends on the display it lands on and on whatever
 * else that machine is doing, and a fixed 0.75 is only ever right for one of those.
 *
 * Deliberately timid. It measures the MEDIAN, not the mean, so one compile stall cannot trigger it; it
 * steps down at most three times and never back up, so it cannot oscillate; and each step costs a
 * Compositor rebuild (renderScale is in its effect's deps), so there is a cooldown between them and a hard
 * cap on how many the page will ever pay for. ?scale= turns it off, since that is someone choosing.
 */
function useAdaptiveScale(base: number, enabled: boolean): number {
  const [scale, setScale] = useState(base)
  const st = useRef({ samples: [] as number[], age: 0, steps: 0, cooldown: 0 })
  useFrame((_, dt) => {
    if (!enabled) return
    const q = st.current
    q.age += dt
    // It settles inside the first few seconds and then stops for good. A step is a Compositor REBUILD, so
    // it costs a stall, and a stall during the words landing or the fall is worse than the frame rate it
    // buys. The load and the card flourish are the right place to spend them: things are moving, so the
    // measurement is honest, but nothing in that window has to land on an exact frame.
    if (q.steps >= 3 || q.age > 6) return
    if (q.cooldown > 0) {
      q.cooldown -= dt
      return
    }
    q.samples.push(dt)
    if (q.samples.length < 30) return
    const med = [...q.samples].sort((a2, b2) => a2 - b2)[Math.floor(q.samples.length / 2)]
    q.samples.length = 0
    // 22 ms is about 45 fps: below that the fall stops reading as motion and starts reading as stutter
    // 24 ms, about 42 fps. Raised from 22: the floor below costs real sharpness, so the bar for paying it
    // has to be a page that is genuinely struggling rather than one a frame or two short.
    if (med > 0.024) {
      q.steps++
      q.cooldown = 1
      // floor 0.55, not 0.45: at 0.45 the lettering picks up visible fringing, and past a point the cure
      // is worse than the lag it treats
      setScale((v) => Math.max(0.55, Math.round((v - 0.1) * 100) / 100))
    }
  })
  return scale
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const ease = (t: number) => t * t * (3 - 2 * t)
const slice = (p: number, [a, b]: readonly [number, number]) => clamp01((p - a) / (b - a))

const SET_ONLY = true
// the chip lands here and the table paints in from this point (world XZ)
const REVEAL_FROM: [number, number] = [0, 0]
// the field the table and its shadow catcher paint in with; a short reach makes the wash soak outward from the chip
// baked set layout (from ?edit, key c): applied to the named pieces at load
const SET_LAYOUT: StageLayout = {}

// the painted D-shaped table (flat-table.tsx) is sized from the live tune (tune.ts: URL params, ?tune sliders)
const tableSpec = (t: Tune): FlatTableSpec => ({ feltR: t.table * 0.41, rail: t.rail, line: 0.86, chordZ: t.chord })
const tableReveal = (t: Tune) => ({ centre: REVEAL_FROM, reach: t.table * 0.5 })
// the catcher takes the noise-free outline times the reveal (cheap: the holey edge and the felt are not needed for a
// shadow); its dimensions are uniforms named like the tune-derived values, updated per frame by ShadowCatcher
// the catcher takes the noise-free outline times the paint reveal (same field as the table)
const tableAlpha = (g: Graph) => {
  const t = getTune()
  const s = tableSpec(t)
  const u = tableUniforms(g, { feltR: s.feltR, rail: s.rail, chordZ: s.chordZ, reach: t.table * 0.5 })
  const rv = { centre: REVEAL_FROM, reach: u.reach }
  const tg = tableGraph(g, { feltR: u.feltR, rail: u.rail, line: s.line, chordZ: u.chordZ }, rv)
  return g.multiply(tg.shape, revealMask(g, { ...rv, noiseAmount: g.uniform('revealNoise', 1), radialAmount: g.uniform('revealRadial', 1), softness: g.uniform('revealSoft', 0.13) }).mask)
}
/** per-frame values for the catcher's table uniforms */
const tableUniformValues = (t: Tune) => {
  const s = tableSpec(t)
  return { feltR: s.feltR, rail: s.rail, chordZ: s.chordZ, reach: t.table * 0.5 }
}

/**
 * The opening title runs first, so the chip is flicked later than it used to be.
 *
 * When, and how long it then hangs, are both on the panel as jkFlick and jkHold rather than being constants
 * here: they are downstream of how fast the words come in, so speeding those up leaves the lockup sitting
 * finished and motionless until the coin finally fires, and the two knobs have to be adjustable together.
 *
 * The apex hold is well under the chip's own default of 2.4. The lockup is thrown off the top of the frame
 * as the chip falls, and the two only trade places if the chip's rise and its fall are close enough
 * together to read as one exchange, so the time goes into the drop rather than onto the front of the page.
 */
/**
 * How far the CAMERA falls lives on the panel now, as jkFall. The note that was here is on the key.
 *
 * The short of it: the exit used to be the lockup rising, and that is exactly what it looked like - the
 * words flew up, nothing else in the frame moved, and the shot read as a title animating off. The camera
 * does the whole move now, sitting jkFall above its table framing through the title and arriving at the
 * framing exactly on impact, so the fall costs no recovery move and everything nailed to the world streams
 * up past the lens, which is the thing that actually says falling.
 */
/**
 * How high the chip is flicked, above the felt. Pinned to CAM_FALL: see the note above.
 *
 * High enough that the coin LEAVES THE FRAME. On a 25mm-equivalent lens the top edge sits only a few units
 * over the aim, so an apex that merely cleared centre never actually got away - the coin and the lens both
 * shuffled up a little and neither move read. At +9.5 the coin is well past the top edge at the camera's
 * resting height, and the only reason it is on screen at the top of the beat is that the lens has climbed
 * CAM_LIFT (7.4) after it. That is the chase: it gets away, and the frame goes and finds it.
 *
 * The aim sits lookY (1.4) over the camera, so at the top the centre line is jkLift + 1.4 and the coin
 * finishes on it: the lens climbs until the coin is dead centre, caught completely. jkApex and jkLift have
 * to move together for that reason - raising one alone moves the coin off centre rather than higher. It is
 * drawn in FRONT of the
 * title now (see DIST in jack-intro), so it no longer has to dodge the type to be seen.
 *
 * It is BEHIND the lockup at that height, and deliberately so: the title is 6 from the lens and the coin
 * about 12.8, so the letters occlude it where they cross. A coin drawn over the title would read as a
 * sticker on top of the type; tucked behind it, it reads as being in the room the title is hanging in.
 */


/** what the fall is doing at `t` seconds past the armed clock: how far up it still is, and how hard it is going */
interface Fall {
  clock0: MutableRefObject<number>
  /** the second the coin is flicked, so the camera can follow it UP before it follows it down */
  flickAt: number
  dropAt: number
  height: number
}
function fallState(fall: Fall | undefined, elapsed: number): { y: number; rush: number } {
  if (!fall) return { y: 0, rush: 0 }
  const ft = fall.clock0.current > 0 ? beatTime(elapsed - fall.clock0.current) : -1
  if (ft < 0) return { y: fall.height, rush: 0 }
  /**
   * ONE ARC for the whole move, rather than a rise branch and a fall branch meeting at a seam.
   *
   * The camera sits at its title framing, is yanked up after the coin a third of a second late, is still
   * climbing when the coin turns over, catches it, and then falls with it onto its mark exactly at impact.
   */
  return camLift(ft, fall.flickAt, fall.dropAt, getTune().jkFallFor, fall.height)
}

const CARD_W = 0.63
const CARD_H = 0.88
const CARD_T = 0.012

/** Roles that get a card: everything except the "coming soon" placeholder. */
export const HAND = experiences.filter((e) => !e.comingSoon)

/** Face textures load once; sRGB so the art keeps its colour before quantise. */
function useCardFaces() {
  return useMemo(() => {
    const loader = new THREE.TextureLoader()
    return HAND.map((e) => {
      const t = loader.load(e.logo ?? '/resume/button_img/waterloo_selected.webp')
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 4
      return t
    })
  }, [])
}

function Table() {
  const felt = useMemo(() => feltMaterial(), [])
  const ink = useMemo(() => inkMaterial(), [])
  return (
    <group>
      <mesh material={felt} position={[0, -0.05, 0]}>
        <boxGeometry args={[7, 0.1, 4.2]} />
      </mesh>
      {/* rail */}
      <mesh material={ink} position={[0, 0.02, -2.15]}>
        <boxGeometry args={[7.3, 0.14, 0.14]} />
      </mesh>
      <mesh material={ink} position={[0, 0.02, 2.15]}>
        <boxGeometry args={[7.3, 0.14, 0.14]} />
      </mesh>
      <mesh material={ink} position={[-3.65, 0.02, 0]}>
        <boxGeometry args={[0.14, 0.14, 4.4]} />
      </mesh>
      <mesh material={ink} position={[3.65, 0.02, 0]}>
        <boxGeometry args={[0.14, 0.14, 4.4]} />
      </mesh>
    </group>
  )
}

/**
 * The deal. Cards start stacked in the deck at the right, fly to a fan across
 * the table, then flip face-up one after another. Each card gets a staggered
 * slice of the deal beat.
 */
function Cards({ scroll, faces }: { scroll: MutableRefObject<ScrollState>; faces: THREE.Texture[] }) {
  const n = HAND.length
  const refs = useRef<(THREE.Group | null)[]>([])
  const paper = useMemo(() => paperMaterial(), [])
  const back = useMemo(() => cardBackMaterial(), [])
  const faceMats = useMemo(() => faces.map(cardFaceMaterial), [faces])

  const deckPos = new THREE.Vector3(2.6, 0.02, 1.2)
  const spread = Math.min(4.6, (n - 1) * 0.95)
  const targets = useMemo(
    () =>
      HAND.map((_, i) => {
        const x = n === 1 ? 0 : -spread / 2 + (spread * i) / (n - 1)
        const arc = 1 - Math.pow((x / (spread / 2 || 1)) * 0.9, 2)
        return new THREE.Vector3(x, 0.02 + i * CARD_T * 1.5, 0.35 - arc * 0.35)
      }),
    [n, spread],
  )

  useFrame(() => {
    const p = scroll.current.progress
    const t = slice(p, BEATS.deal)
    for (let i = 0; i < n; i++) {
      const g = refs.current[i]
      if (!g) continue
      const per = 1 / n
      const local = clamp01((t - i * per * 0.75) / (per * 1.6))
      const fly = ease(clamp01(local * 1.6))
      const flip = ease(clamp01((local - 0.55) / 0.45))
      const target = targets[i]
      g.position.lerpVectors(deckPos, target, fly)
      // lob: rise mid flight
      g.position.y += Math.sin(fly * Math.PI) * 0.6
      // deck stack offset before dealing
      if (fly === 0) g.position.y = deckPos.y + (n - i) * CARD_T
      // YXZ: lay the card flat first (x), then spin it about the table normal (y)
      g.rotation.order = 'YXZ'
      const spin = (1 - fly) * 1.4 + (i % 2 ? -1 : 1) * 0.06 * fly
      g.rotation.y = spin
      // flip about the long axis: face down (rotation.x = pi) to face up
      g.rotation.x = -Math.PI / 2 + Math.PI * (1 - flip)
      g.position.y += Math.sin(flip * Math.PI) * 0.35
    }
  })

  return (
    <group>
      {HAND.map((_, i) => (
        <group key={i} ref={(el) => { refs.current[i] = el }}>
          {/* card is a thin box lying in XY (face +z), rotated to lie on the table */}
          <mesh material={[paper, paper, paper, paper, faceMats[i], back]}>
            <boxGeometry args={[CARD_W, CARD_H, CARD_T]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Deck() {
  const ink = useMemo(() => inkMaterial(), [])
  const paper = useMemo(() => paperMaterial(), [])
  return (
    <group position={[2.6, 0.0, 1.2]}>
      {/* the deck box */}
      <mesh material={ink} position={[0, 0.06, 0]}>
        <boxGeometry args={[CARD_W + 0.05, 0.12, CARD_H + 0.05]} />
      </mesh>
      <mesh material={paper} position={[0, 0.125, 0]}>
        <boxGeometry args={[CARD_W, 0.01, CARD_H]} />
      </mesh>
    </group>
  )
}

/**
 * Chip stacks rise out of the felt during the chips beat: one stack per tech
 * category, one chip per tool, colour cycling through the palette inks.
 */
// the four the stacks actually cycle through, not the whole denomination set: ChipInk now runs to eight
// and a Record over all of them would be a lie about what this builds
const CHIP_INKS = ['red', 'gold', 'green', 'black'] as const satisfies readonly ChipInk[]
type StackInk = (typeof CHIP_INKS)[number]
export const CHIP_STACKS: { pos: [number, number]; ink: StackInk; count: number; title: string }[] =
  techCategories.map((c, i) => {
    const n = techCategories.length
    const x = -2.6 + (5.2 * i) / Math.max(1, n - 1)
    return {
      pos: [x, -1.25 - (i % 2) * 0.28],
      ink: CHIP_INKS[i % CHIP_INKS.length],
      count: Math.max(3, c.badges.length),
      title: c.title,
    }
  })
const CHIP_R = 0.16
const CHIP_H = 0.035

function Chips({ scroll }: { scroll: MutableRefObject<ScrollState> }) {
  // built per ink from CHIP_INKS rather than listed by hand, so a new
  // denomination is one entry in the palette and nothing else
  const mats = useMemo(
    () =>
      Object.fromEntries(
        CHIP_INKS.map((ink) => [ink, [chipMaterial(ink), chipFaceMaterial(ink), chipFaceMaterial(ink)]]),
      ) as unknown as Record<ChipInk, THREE.Material[]>,
    [],
  )
  const groups = useRef<(THREE.Group | null)[]>([])
  useFrame(() => {
    const t = slice(scroll.current.progress, BEATS.chips)
    CHIP_STACKS.forEach((s, i) => {
      const g = groups.current[i]
      if (!g) return
      // stacks are always on the table; during the chips beat each one hops
      // once in sequence so the eye is led along the row
      const local = clamp01((t - i * 0.1) / 0.35)
      g.position.y = Math.sin(local * Math.PI) * 0.22
    })
  })
  return (
    <>
      {CHIP_STACKS.map((s, i) => (
        <group key={i} ref={(el) => { groups.current[i] = el }} position={[s.pos[0], 0, s.pos[1]]}>
          {Array.from({ length: s.count }, (_, k) => (
            <mesh
              key={k}
              material={mats[s.ink]}
              position={[Math.sin(k * 2.3) * 0.01, CHIP_H / 2 + k * CHIP_H, Math.cos(k * 1.7) * 0.01]}
              rotation={[0, k * 0.4, 0]}
            >
              <cylinderGeometry args={[CHIP_R, CHIP_R, CHIP_H, 32]} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  )
}

/** A ground plane that renders nothing but received shadow (pomme's key casts onto the meadow; here onto paper). */
/**
 * The room's ONE light: a spot over the table for cast shadows on the catcher (the surfaces themselves
 * take the lamp from the graph term, driven here from the tune so both agree)
 */
/**
 * The lamp IS the reveal: before the drop it is a tight spot on the landing point; on impact it flares with a
 * short filament flicker and the cone swells open over 1.6 s, sweeping the table into the light from the
 * impact outward. Cone and gain are written to every lit material and to the shadow light together.
 */
const LAMP_TIGHT = 7
function lampCurve(impactAge: number, coneFull: number, gainFull: number): { cone: number; gain: number; room: { cone: number; gain: number } } {
  // before the landing the lamp lights the chip only (the room's cone term is held at zero, so no pool on the
  // floor); at the impact the centre pool appears with a filament flicker and opens over 1.6 s
  if (impactAge < 0) return { cone: coneFull, gain: gainFull * 0.85, room: { cone: LAMP_TIGHT, gain: 0 } }
  const t = impactAge
  const open = t / 1.6
  const e = open >= 1 ? 1 : 1 - Math.pow(1 - open, 3)
  const cone = LAMP_TIGHT + (coneFull - LAMP_TIGHT) * e
  // filament flicker in the first 0.45 s, then steady
  const fl = t < 0.45 ? 0.55 + 0.45 * Math.abs(Math.sin(t * 61) * Math.sin(t * 23 + 1.3)) : 1
  const gain = gainFull * (0.85 + 0.15 * e) * fl
  return { cone, gain, room: { cone, gain } }
}
/**
 * The lamp rides the fall.
 *
 * It is a spot over the felt at 7.5, pointing down, so anything that climbs past it leaves the pool and
 * goes dark - the comment on PRESENT_MATERIALS records the folder losing 38 percent on the way up. The
 * coin now peaks at CHIP_APEX, well over the lamp's head, and it came out a dark maroon disc: the shot's
 * subject, unlit, for the whole hold.
 *
 * So the lamp holds CAM_FALL high with the camera and comes down with it, on the same envelope, arriving
 * home exactly on impact. Nothing else changes, because through the title the room's own cone is still
 * shut (lampCurve, impactAge < 0) and the felt is not painted in yet, so the only thing this light is
 * reaching is the coin it is following. The alternative was choreographing around the lighting - keeping
 * the coin under 7.5, which caps the fall at about 6 - and the lighting should not get to dictate that.
 */
function RoomLamp({ fx, fall }: { fx: MutableRefObject<ImpactFx>; fall?: Fall }) {
  const light = useRef<THREE.SpotLight>(null)
  const target = useMemo(() => {
    const t = new THREE.Object3D()
    t.position.set(LAMP.position[0], 0, LAMP.position[2])
    return t
  }, [])
  useFrame(({ clock }) => {
    const t = getTune()
    const { cone, gain, room } = lampCurve(fx.current.impactAge, t.lampCone, LAMP.gain)
    const ly = t.lampH + fallState(fall, clock.elapsedTime).y
    driveLamp({ y: ly, cone, gain, room })
    const L = light.current
    if (L) {
      L.position.set(LAMP.position[0], ly, LAMP.position[2])
      L.angle = THREE.MathUtils.degToRad(cone)
      L.intensity = 90 * (gain / LAMP.gain)
    }
  })
  return (
    <>
      <primitive object={target} />
      <spotLight
        ref={light}
        color="#ffe3b8"
        intensity={90}
        position={[LAMP.position[0], LAMP.position[1], LAMP.position[2]]}
        angle={THREE.MathUtils.degToRad(LAMP.cone)}
        penumbra={LAMP.blend}
        decay={1.6}
        distance={40}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-radius={5}
        target={target}
      />
    </>
  )
}

/**
 * The room as a cyclorama: ONE surface sweeping from the floor up into the wall through a wide curve, one
 * material, so the lamp reveals no seam. Background is decided by the lamp, not by paper.
 */
function cycloramaGeometry(width: number, floorFront: number, cornerZ: number, radius: number, wallTop: number, segs = 48): THREE.BufferGeometry {
  const prof: [number, number][] = []
  prof.push([floorFront, 0])
  prof.push([cornerZ + radius, 0])
  for (let i = 1; i <= segs; i++) {
    const a = (i / segs) * (Math.PI / 2)
    prof.push([cornerZ + radius - Math.sin(a) * radius, radius - Math.cos(a) * radius])
  }
  prof.push([cornerZ, wallTop])
  const pos: number[] = []
  const nrm: number[] = []
  const idx: number[] = []
  const hw = width / 2
  for (let i = 0; i < prof.length; i++) {
    const [z, y] = prof[i]
    const [z0, y0] = prof[Math.max(0, i - 1)]
    const [z1, y1] = prof[Math.min(prof.length - 1, i + 1)]
    const tz = z1 - z0, ty = y1 - y0
    const len = Math.hypot(tz, ty) || 1
    const nz = -ty / len, ny = tz / len
    const sgn = nz + ny >= 0 ? 1 : -1
    pos.push(-hw, y, z, hw, y, z)
    nrm.push(0, ny * sgn, nz * sgn, 0, ny * sgn, nz * sgn)
  }
  for (let i = 0; i < prof.length - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3
    idx.push(a, b, c, b, d, c)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  g.setIndex(idx)
  return g
}

function Room({ floorY }: { floorY: number }) {
  const mat = useMemo(() => roomMaterial('wall'), [])
  // wallTop 240, not the 40 it was: the camera climbs jkFall + jkLift chasing the coin, which is now well
  // over 45, and a 40-high wall put its own top edge across the frame as a hard horizontal seam at the top
  // of the move. Measured at rest before and after - the difference is inside the run-to-run noise.
  const geo = useMemo(() => cycloramaGeometry(120, 40, -12, 9, 240), [])
  useEffect(() => () => geo.dispose(), [geo])
  return <mesh position={[0, floorY, 0]} geometry={geo} material={mat} receiveShadow />
}

/** drives a word state from the impact clock: writes in `delay` seconds after the landing, never un-writes */
function TitleDriver({ fx, onState, y, delay = 1.1 }: { fx: MutableRefObject<ImpactFx>; onState: (s: ChipWordState) => void; y: number; delay?: number }) {
  const local = useRef<ChipWordState>({ x: 0, y: 3, z: 0, onT: -1, offT: -1, hitAt: -1 })
  useFrame(() => {
    const ia = fx.current.impactAge
    const s = local.current
    s.x = 0
    s.y = y
    s.z = 0
    s.onT = ia >= delay ? ia - delay : -1
    s.offT = -1
    onState(s)
  })
  return null
}

function ShadowCatcher({
  y = -0.001,
  radius,
  fx,
  reveal,
  alpha,
}: {
  y?: number
  radius?: number
  fx?: MutableRefObject<ImpactFx>
  reveal?: { centre: [number, number]; reach: number }
  /** a scalar graph gating the shadow (the painted table's own alpha); overrides the plain reveal */
  alpha?: (g: Graph) => GraphNode
}) {
  const built = useMemo(() => {
    const m = new ShadowNodeMaterial()
    m.color = new THREE.Color('#2a1a1a')
    m.transparent = true
    if (alpha || reveal) {
      // the shadow is cut by the SAME field as the table (a graph plugged into a
      // ShadowNodeMaterial socket): no shadow lands on unpainted paper or past the table's edge
      const g = graph()
      const gate = alpha ? alpha(g) : revealMask(g, { centre: reveal!.centre, reach: g.uniform('reach', reveal!.reach) }).mask
      const plug = compileNode(g.multiply(gate, 0.75))
      m.opacityNode = plug.node
      return { m, grow: plug.uniforms.grow, uniforms: plug.uniforms }
    }
    m.opacity = 0.75
    return { m, grow: undefined as { value: number } | undefined, uniforms: {} as Record<string, { value: number }> }
    // the reveal centre is constant; reach and the table dimensions are uniforms updated below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alpha, reveal?.centre[0], reveal?.centre[1]])
  const builtRef = useRef(built)
  useEffect(() => {
    builtRef.current = built
  }, [built])
  useFrame(() => {
    const b = builtRef.current
    if (fx && b.grow) b.grow.value = growFromImpact(fx.current.impactAge * REVEAL_TIME_SCALE)
    const u = b.uniforms
    if (u.feltR) {
      const v = tableUniformValues(getTune())
      u.feltR.value = v.feltR
      if (u.rail) u.rail.value = v.rail
      if (u.chordZ) u.chordZ.value = v.chordZ
      if (u.reach) u.reach.value = v.reach
    } else if (u.reach && reveal) u.reach.value = reveal.reach
    if (u.revealNoise) { const t = getTune(); u.revealNoise.value = t.revealNoise; if (u.revealRadial) u.revealRadial.value = t.revealRadial; if (u.revealSoft) u.revealSoft.value = t.revealSoft }
  })
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} receiveShadow material={built.m} userData={{ compNoPosition: true }}>
      {radius ? <circleGeometry args={[radius, 64]} /> : <planeGeometry args={[40, 40]} />}
    </mesh>
  )
}

/** Camera rides the scroll: high over the marquee (dealer in frame), down to the felt for the deal, low and left for the chips, back up for cash out. */
// the folder owns this shape; duplicating it here is how the camera and the folder drifted apart before
type PageFrame = PageFrameOut

function CameraRig({
  scroll,
  fx,
  tableFitRef,
  focusRef,
  pageRef,
  fall,
}: {
  scroll: MutableRefObject<ScrollState>
  fx: MutableRefObject<ImpactFx>
  tableFitRef: MutableRefObject<TableFit | null>
  focusRef?: MutableRefObject<boolean>
  pageRef?: MutableRefObject<PageFrame | null>
  /** the opening fall: the camera drops with the chip, on the chip's own clock */
  fall?: Fall
}) {
  // 0 = the table framing, 1 = settled over the open file; a real-clock tween, eased, that waits a beat
  // after the cover starts to swing so the move reads as a consequence of the folder opening
  const focus = useRef(0)
  const focusLin = useRef(0)
  // camera height/distance from the live tune (read per frame: no re-render on slider moves)
  const look = useMemo(() => new THREE.Vector3(), [])
  // dev hook: ?cam=dealer parks the camera on the dealer for mesh iteration
  const devCam = useMemo(
    () => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('cam') : null),
    [],
  )
  useFrame(({ camera, clock }, dt) => {
    if (devCam === 'pomme') {
      // pomme's camera exactly (natureScene.js): fov 25 at (5.2, 2.4, 6.9) looking at (-0.4, 1.0, -0.4)
      const pc = camera as THREE.PerspectiveCamera
      if (pc.fov !== 25) {
        pc.fov = 25
        pc.updateProjectionMatrix()
      }
      camera.position.set(5.2, 2.4 + fx.current.jolt, 6.9)
      camera.lookAt(-0.4, 1.0, -0.4)
      return
    }
    if (devCam === 'dealer') {
      camera.position.set(2.4, 1.6, -0.2)
      camera.lookAt(1.7, 0.9, -2.75)
      return
    }
    if (devCam === 'reaper') {
      // the skeleton dealer behind the table, framed full body for mesh iteration
      camera.position.set(0.6, 1.9, 1.6)
      camera.lookAt(0, 1.2, -3.2)
      return
    }
    if (SET_ONLY) {
      /**
       * THE OPENING FALL.
       *
       * The camera holds this far above its table framing all through the title, then falls to it on the
       * chip's own curve, arriving exactly on impact. Two things make it read as falling rather than as a
       * camera move. It ACCELERATES, because the offset comes off as 1 - u^2, the same shape the chip's own
       * drop uses, so the lens and the coin are locked and the coin barely moves in the frame. And it is a
       * pure TRANSLATION: the look target comes down by the same amount, so the camera does not pitch up as
       * it descends. Pitching up swings the world back down the frame and cancels most of the motion; with
       * the aim held, everything nailed to the room streams straight up past the lens, which is the actual
       * cue for falling. Without that there is no self-motion anywhere in the shot and the eye reads the
       * only moving thing, the title, as having flown away by itself.
       */
      // `rush` is a BUMP, not a ramp: zero before the drop, zero after it. A value that feeds motion has to
      // return to rest on its own rather than because something downstream happens to cancel it - the first
      // version drove a camera buffet off the fall's PROGRESS, which ends at 1 and stays there, and shook
      // the picture for as long as the page was open.
      const { y: fallY, rush } = fallState(fall, clock.elapsedTime)
      // pomme's long lens: fov 25, pulled back to keep the same framing. The lens WIDENS through the fall
      // and is back to 25 on impact: a symmetric bump, so the framing the rest of the page is built on is
      // untouched and the only thing it costs is the rush.
      const pc = camera as THREE.PerspectiveCamera
      const wantFov = 25 + 3.2 * rush
      if (Math.abs(pc.fov - wantFov) > 0.01) {
        pc.fov = wantFov
        pc.updateProjectionMatrix()
      }
      // frame relative to the felt once the table has reported its height
      const fy = tableFitRef.current?.feltY ?? 0
      // a little higher and further back than pomme so the whole D-shaped table sits in frame
      const tn = getTune()
      const want = focusRef?.current ? 1 : 0
      const d = Math.min(dt, 0.05)
      // the camera runs on the folder's own clock, with no beat in front of it: same durations, same
      // easing, so the folder opening and the camera coming down are one continuous move
      if (want) focusLin.current = Math.min(1, focusLin.current + d / FOLDER_TIME.open)
      else focusLin.current = Math.max(0, focusLin.current - d / FOLDER_TIME.shut)
      const l = focusLin.current
      focus.current = l * l * l * (l * (l * 6 - 15) + 10)
      const f = focus.current
      const pf = pageRef?.current
      if (f > 0.001 && pf) {
        // read the page: look straight down its normal with the camera's up along the page's up, at the
        // distance that fits it in the frame (both axes), so the resume is never slanted or sideways
        const pc2 = camera as THREE.PerspectiveCamera
        const half = Math.tan(THREE.MathUtils.degToRad(pc2.fov) / 2)
        // 1.25 rather than a wide 1.9: the resume is the subject, so it fills the frame and the folder's
        // edges are allowed to run off it. The margin left over covers the foreshortening from the slight
        // lean below (the camera is not straight down the page normal).
        // frame the whole SPREAD, centred on the fold, so the open folder reads symmetrically: the page on
        // one side and the leaf's links on the other, with the crease down the middle. Fitting the page
        // alone put the fold off to one side and pushed the other leaf out of frame.
        const dist = Math.max(pf.height / 2 / half, pf.spread / 2 / (half * pc2.aspect)) * 1.12
        const fy2 = tableFitRef.current?.feltY ?? 0
        const tablePos = new THREE.Vector3(0, fy2 + tn.camY, tn.camZ)
        const tableAim = new THREE.Vector3(0, fy2 + tn.lookY, -0.6)
        // the FOLDER turns to face the reader, so the camera stays level: it just comes down and in, high
        // above the page and a little toward the viewer, with the world's up
        const pagePos = pf.crease.clone().add(new THREE.Vector3(0, dist * 0.94, dist * 0.34))
        camera.position.copy(tablePos).lerp(pagePos, f)
        camera.position.y += fx.current.jolt
        camera.up.set(0, 1, 0)
        camera.lookAt(tableAim.lerp(pf.crease, f))
        return
      }
      camera.up.set(0, 1, 0)
      // table framing, easing to a view settled over the open file
      // the open spread (back + cover flipped toward the viewer) is ~4.6 long, so the file view sits high
      const px = 0.9 * f, py = fy + tn.camY + (fy + 9.2 - (fy + tn.camY)) * f, pz = tn.camZ + (1.9 - tn.camZ) * f
      // No buffet. A shaken camera is the obvious way to say "fast" and it was the wrong tool here twice
      // over: at 71 rad/s sampled at 60 fps it is about five samples a cycle, so it does not read as a
      // wobble at all, it reads as the picture being unstable. The drop, the lens and the streaks carry the
      // fall between them and the jolt at the bottom is the only shake in the beat, which is where the one
      // shake belongs.
      camera.position.set(px, py + fx.current.jolt + fallY, pz)
      // aim between the felt and the chip's apex so the dealer, the flick and the word all sit in frame;
      // when the file is open, down over the fold of the spread. `fallY` on the target as well as on the
      // position is what keeps the fall a pure drop instead of a tilt.
      camera.lookAt(0.9 * f, fy + tn.lookY + (fy - (fy + tn.lookY)) * f + fallY, -0.6 + (1.3 + 0.6) * f)
      return
    }
    const p = scroll.current.progress
    const a = ease(slice(p, [0, 0.4]))
    const b = ease(slice(p, [0.45, 0.8]))
    const c = ease(slice(p, [0.78, 1]))
    // marquee: high, dealer at the far rail. deal: down over the felt. chips: low and left. sign: rise
    const x = 0 + (-1.2 * b) + 1.2 * c
    const y = 4.4 - 1.8 * a - 1.4 * b + 1.6 * c
    const z = 6.6 - 2.8 * a - 1.4 * b + 0.8 * c
    camera.position.set(x, y + fx.current.jolt, z)
    look.set(0, 0.5 - 0.5 * a, -0.9 + 1.1 * a - 0.9 * b + 0.4 * c)
    camera.lookAt(look)
  })
  return null
}

/**
 * The manga pass. Takes over rendering (useFrame priority > 0 disables R3F's
 * own render call) and drives its knobs from the scroll: grit ramps up as the
 * page descends, spot colour dips slightly at the top so the marquee opens near
 * mono and colour "arrives" with the deal.
 */
function MangaPost({
  scroll,
  fx,
  onReady,
  uniformsRef,
}: {
  scroll: MutableRefObject<ScrollState>
  fx: MutableRefObject<ImpactFx>
  onReady: () => void
  uniformsRef: MutableRefObject<MangaUniforms | null>
}) {
  const { gl, scene, camera } = useThree()
  const postRef = useRef<ReturnType<typeof createMangaPost> | null>(null)
  const ready = useRef(false)

  useEffect(() => {
    const p = createMangaPost(gl as never, scene, camera, { grit: 0.25 })
    postRef.current = p
    uniformsRef.current = p.uniforms
    return () => {
      p.post.dispose()
      postRef.current = null
      uniformsRef.current = null
    }
  }, [gl, scene, camera, uniformsRef])

  useFrame(() => {
    const p = postRef.current
    if (!p) return
    const prog = scroll.current.progress
    p.uniforms.grit.value = 0.25 + 0.4 * ease(prog)
    p.uniforms.spot.value = 0.9 + 0.1 * ease(slice(prog, [0.05, 0.3]))
    // the impact flicker, from the one place that owns it
    const { impact: imp, after: aft } = impactPass(fx.current.impactAge)
    p.uniforms.impact.value = imp
    p.uniforms.after.value = aft
    // gizmos and helpers (userData.compOverlay) draw on top, untouched by the pass
    withOverlay(gl as never, scene, camera, () => p.post.render())
    if (!ready.current) {
      ready.current = true
      onReady()
    }
  }, 1)
  return null
}

export default function CasinoScene({
  armed = true,
  folderOpen = false,
  onFolderOpen,
  scroll,
  fx,
  report,
  onReady,
  uniformsRef,
}: {
  /** the opening beat starts only once the page cover has cleared */
  armed?: boolean
  /** the resume file is open: the camera settles over the folder */
  folderOpen?: boolean
  onFolderOpen?: () => void
  scroll: MutableRefObject<ScrollState>
  fx: MutableRefObject<ImpactFx>
  report: (impactAge: number, jolt: number) => void
  onReady: () => void
  uniformsRef: MutableRefObject<MangaUniforms | null>
}) {
  const faces = useCardFaces()
  const [tableFit, setTableFit] = useState<TableFit | null>(null)
  const tableFitRef = useRef<TableFit | null>(null)
  const folderOpenRef = useRef(false)
  const pageFrameRef = useRef<PageFrame | null>(null)
  const onPageFrame = useCallback((f: PageFrame) => {
    pageFrameRef.current = f
  }, [])
  useEffect(() => {
    folderOpenRef.current = folderOpen
  }, [folderOpen])
  useEffect(() => {
    tableFitRef.current = tableFit
  }, [tableFit])
  // dev switch: ?comp=<name> renders through a compositor graph from comp-graphs.ts
  // default look is the dark room (night); ?comp=watercolor is pomme's cream paper, ?comp=manga the ink pass
  const compName = useMemo(() => {
    if (typeof window === 'undefined') return 'night'
    const v = new URLSearchParams(window.location.search).get('comp')
    return v === 'manga' ? null : (v ?? 'night')
  }, [])
  // ?mat=watercolor shades the chip with the per-object watercolour material graph
  const matMode = useMemo(
    () => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('mat') : null),
    [],
  )
  // default: the watercolour material graph on the chip (?mat=painterly for pomme's toon port)
  const wcMat = matMode !== 'painterly'
  const noTitle = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('notitle')
  // ?nojack drops the opening title card and puts the chip back on its old 1.7 flick
  const noJack = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('nojack')
  // the eyes are off over the title; ?eyes brings the field back (and its tuning panel with it)
  const eyesOn = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('eyes')
  // the title is shot as whole words; ?smletter goes back to one glyph at a time
  const smGroup: 'letter' | 'word' =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('smletter') ? 'letter' : 'word'
  // the table is drawn like pomme's floor (one disc, material graph); ?table=model brings back the Meshy mesh
  const tune = useTune()
  // read fresh every render so the ?title panel moves it live; ResumeWord only
  // reads this inside useFrame, so a new object each render costs nothing
  const wordMotion = {
    beat: tune.wdBeat,
    step: tune.wdStep,
    from: tune.wdFrom,
    turn: tune.wdTurn,
    swing: tune.wdSwing,
    drag: tune.wdDrag,
    dir: tune.wdDir,
  }

  /**
   * How much the title has to come in to fit this window.
   *
   * The scene is world geometry under a perspective camera, so its HORIZONTAL
   * extent is the vertical one times the aspect: a narrow window does not crop
   * the shot evenly, it takes the ends off the widest thing in it, and the
   * widest thing is the title. Everything else on the table has room to spare.
   *
   * TITLE_TUNED_AT is the shape the numbers were dialled in at. Narrower than
   * that scales down in proportion; wider leaves it alone, because a title that
   * grew on a wide monitor would eventually walk off the sides again.
   */
  const { size: viewSize } = useThree()
  const titleFit = useMemo(
    () => Math.min(1, viewSize.width / Math.max(1, viewSize.height) / TITLE_TUNED_AT),
    [viewSize.width, viewSize.height],
  )
  const spec = useMemo(() => tableSpec(tune), [tune])
  const reveal = useMemo(() => tableReveal(tune), [tune])
  // ?edit: transform gizmo over the set pieces (set-editor.tsx)
  // ?hand: the arm-only dealer flick (parked by default)
  const showHand = useMemo(
    () => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).has('hand') : false),
    [],
  )
  const editMode = useMemo(
    () => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).has('edit') : false),
    [],
  )
  const [tableMesh, setTableMesh] = useState<THREE.Mesh | null>(null)
  const [folderGroup, setFolderGroup] = useState<THREE.Group | null>(null)
  // the opening beat: the dealer's hand flicks the chip up from here, the word writes at the apex, then the drop
  const wordState = useRef<ChipWordState>({ x: 0, y: 0, z: 0, onT: -1, offT: -1, hitAt: 0.62 })
  const handRef = useRef<[number, number, number]>([0.95, 1.45, -3.0])
  const chipClock0 = useRef(-1)
  // one descriptor, read by the lens and by the lamp, so the two cannot fall at different rates
  // the frame the chip starts to fall, which is the frame the camera starts to fall with it
  const jackDropAt = tune.jkFlick + tune.jkRise + tune.jkHold
  // a ref cell so retuning the timing reaches the rig without re-creating it every frame
  const fallRig = useMemo(() => ({ clock0: chipClock0, flickAt: tune.jkFlick, dropAt: jackDropAt, height: tune.jkFall }), [])
  fallRig.height = tune.jkFall
  fallRig.flickAt = tune.jkFlick
  fallRig.dropAt = jackDropAt
  const onChipStart = useCallback((t0: number) => {
    chipClock0.current = t0
  }, [])
  // the title's own word state: anchored above the landed chip, on-clock from the impact
  const titleState = useRef<ChipWordState>({ x: 0, y: 3, z: 0, onT: -1, offT: -1, hitAt: -1 })
  const onTitle = useCallback((s: ChipWordState) => {
    Object.assign(titleState.current, s)
  }, [])
  const onWord = useCallback((s: ChipWordState) => {
    Object.assign(wordState.current, s)
  }, [])
  const pieces = useMemo<SetPiece[]>(
    () => [
      { name: 'table', object: tableMesh, lockTranslate: ['y'] },
      { name: 'folder', object: folderGroup },
    ],
    [tableMesh, folderGroup],
  )
  useEffect(() => {
    if (tableMesh) applyLayout({ table: tableMesh }, SET_LAYOUT)
  }, [tableMesh])
  // ?cards puts the fanned hand back on the felt
  const showCards = useMemo(
    () => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).has('cards') : false),
    [],
  )
  const modelTable = useMemo(
    () => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('table') === 'model' : false),
    [],
  )
  // ?scale=0.5 overrides the compositor's internal render scale (perf tuning)
  const scaleOverride = useMemo(() => {
    if (typeof window === 'undefined') return undefined
    const v = new URLSearchParams(window.location.search).get('scale')
    return v ? Number(v) : undefined
  }, [])
  // ?cam=pomme reproduces pomme's landing framing exactly for shader comparison
  const adaptiveScale = useAdaptiveScale(COMP_GRAPHS[compName ?? 'night']?.renderScale ?? 1, !scaleOverride)
  const pommeMatch = useMemo(
    () => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('cam') === 'pomme' : false),
    [],
  )
  return (
    <>
      {/* the camera holds its table framing: the folder presents ITSELF to it (see ResumeFolder) */}
      <CameraRig scroll={scroll} fx={fx} tableFitRef={tableFitRef} pageRef={pageFrameRef} fall={noJack ? undefined : fallRig} />
      {editMode && <SetEditor pieces={pieces} />}
      {/* SET_ONLY: everything but the hero chip is parked while the opening
          beat is tuned; flip to false to bring the table back */}
      {!SET_ONLY && (
        <>
          <Table />
          <Dealer />
          <Deck />
          <Cards scroll={scroll} faces={faces} />
          <Chips scroll={scroll} />
        </>
      )}
      {pommeMatch ? <PommeLights /> : <RoomLamp fx={fx} fall={noJack ? undefined : fallRig} />}
      {pommeMatch ? (
        <>
          {/* pomme's exact placement: apple centred at GROW_CENTER (-0.5, 0, -0.65), height 1.9, ground at y = -0.95, paper background */}
          <color attach="background" args={['#dcd6c4']} />
          <Suspense fallback={null}>
            <HeroChip report={report} landing={[1.4, -0.95, 0.4]} painterly={!wcMat} watercolorMaterial={wcMat} />
          </Suspense>
          <ShadowCatcher y={-0.95} />
          <Suspense fallback={null}>
            <Apple position={[-0.5, 0, -0.65]} height={1.9} centred />
          </Suspense>
        </>
      ) : (
        <>
          {/* the round poker table: a painted disc like pomme's floor (or the Meshy mesh with ?table=model); props sit on its felt */}
          {modelTable ? (
            <Suspense fallback={null}>
              <RoundTable diameter={tune.table} onFit={setTableFit} reveal={REVEAL_FROM} fx={fx} />
            </Suspense>
          ) : (
            <>
              {/* drawn-in reveal (pomme's field, noise on the revealNoise slider) plus the lamp opening */}
              <FlatTable {...spec} onFit={setTableFit} reveal={reveal} fx={fx} meshRef={setTableMesh} />
              {tableFit && <RailTube feltR={spec.feltR} rail={spec.rail} chordZ={spec.chordZ} y={tableFit.feltY} reveal={reveal} fx={fx} />}
            </>
          )}
          {tableFit && (
            <>
              <Room floorY={tableFit.feltY - 0.06} />
              {/* graph materials are unlit and cannot receive shadows: an invisible catcher disc on the felt
                  carries them; it sits a hair above the felt and BELOW the props' bases, and paints in with the table */}
              <ShadowCatcher y={tableFit.feltY + 0.001} radius={tableFit.feltR + 1.3} fx={fx} reveal={reveal} alpha={modelTable ? undefined : tableAlpha} />
              <Suspense fallback={null}>
                <HeroChip
                  report={report}
                  landing={[0, tableFit.feltY + 0.004, 0]}
                  size={tune.chip}
                  painterly={!wcMat}
                  watercolorMaterial={wcMat}
                  flick={
                    showHand
                      ? { fromRef: handRef, at: noJack ? 1.7 : tune.jkFlick, apex: noJack ? 3.0 : tune.jkFall + tune.jkApex, hold: noJack ? undefined : tune.jkHold }
                      : { from: [0, tableFit.feltY + 0.11, 0], at: noJack ? 1.7 : tune.jkFlick, apex: noJack ? 3.2 : tune.jkFall + tune.jkApex, hold: noJack ? undefined : tune.jkHold }
                  }
                  onWord={onWord}
                  onStart={onChipStart}
                  armed={armed}
                  perch={{ at: 2.4 + 1.3 * 0.9, height: 0.06 }}
                  shed={folderOpen}
                />
              </Suspense>
              {/* the title card, before any of this: it is carried off the top as the chip falls */}
              {!noJack && <JackIntro armed={armed} clock0={chipClock0} flickAt={tune.jkFlick} riseFor={tune.jkRise} holdFor={tune.jkHold} />}
              {!noJack && <FallStreaks armed={armed} clock0={chipClock0} flickAt={tune.jkFlick} dropAt={jackDropAt} />}
              {/* the eyes, off by default over the title: ?eyes puts the field back on the same beat clock */}
              {!noJack && eyesOn && <EyeField clock0={chipClock0} />}
              {/* the resume folder from the old page, standing on the felt beside the chip */}
              <Suspense fallback={null}>
                <ResumeFolder position={[0.15, tableFit.feltY + 0.004, 0.95]} length={3.6} yaw={Math.PI / 2 - 0.1} groupRef={setFolderGroup} deal={{ from: [13, 0.4], at: 2.4, duration: 1.3, turns: 1.5 }} fx={fx} onOpen={onFolderOpen} open={folderOpen} onPageFrame={onPageFrame} />
              </Suspense>
              {/* the hand: a royal flush in hearts, fanned on the felt. Off by
                  default while the chips and dice are being placed, since it took
                  the whole left of the table; ?cards brings it back rather than
                  losing it. */}
              {showCards && <RoyalFlush position={[-3.2, tableFit.feltY + 0.006, -0.7]} yaw={0.24} length={1.25} spread={0.6} arc={0.2} />}
              {/* RESUME under the tumbling chip at the apex (pomme's LOADING) */}
              {/* pomme's LOADING proportions exactly: the same span and per-letter tangent rotation it uses around
                  the apple, and the same letter-width to arc-step ratio (~1.22), which is what makes the arc
                  read as evenly wrapped. No depth wrap: pomme's is a flat arc, the wrap is the rotation. */}
              {/* Only when the title card is off. RESUME writes at the chip's APEX, which is now the frame
                  the lockup is still holding in, so the two land on top of each other: two titles at once
                  and neither readable. The opening word is JACK OF ALL TRADES now, and the apex belongs to
                  the handoff rather than to a second piece of lettering. */}
              {noJack && <ResumeWord state={wordState} radius={1.78} size={1.9} outline={16} groundY={tableFit.feltY} loose />}
              {/* the title: two shallow banner arcs over the landed chip, felt-green ink, written in about a
                  second after the impact (after the flash frames) and kept */}
              <TitleDriver fx={fx} onState={onTitle} y={tableFit.feltY + tune.titleY} />
              {/* ?notitle drops the title arcs: capture with and without, diff, and any effect they have on
                  what is behind them shows up as itself. That is how the decal passes bug was found */}
              {/* each line in its OWN group, so it can be moved, sized and rolled without
                  redrawing the arc both are flowed onto */}
              {/*
                * The arc's APEX is pinned, so titleR only changes the curve.
                *
                * ResumeWord puts a top arc's highest point at y + 0.92 * radius,
                * which means the radius moves the title as much as it bends it:
                * raising it to flatten the banner threw the whole thing out of
                * the top of the frame, and titleY could not reach far enough
                * back down to fetch it. Cancelling that term here leaves titleY
                * meaning the height the title SITS at and titleR meaning how
                * curved it is, which is what you would expect of two knobs with
                * those names.
                *
                * Both lines take the same radius now and are separated by
                * titleGap in world units. The gap used to be a radius
                * DIFFERENCE, so it set the second line's curve and its distance
                * at once and neither could be touched alone.
                */}
              {/*
                * The whole title inside ONE fit group, so it holds on a shape it
                * was not tuned at.
                *
                * It is world geometry under a perspective camera, so a narrower
                * window does not crop it evenly, it loses the ends of the longest
                * line first: ALWAYS BET ON runs off both sides while the felt
                * still has room. titleFit is the horizontal extent the camera
                * actually has against the extent it was tuned at, so the title
                * shrinks only when the frame gets narrower than that and never
                * grows past what was dialled in.
                *
                * Nested rather than folded into each line's scale because the
                * offsets are world units: an outer scale carries the positions
                * with it, so the two lines keep their spacing instead of drifting
                * apart as it shrinks.
                *
                * Note the apex term carries the LINE'S OWN scale. The arc's rise
                * happens inside that group, so it is scaled with everything else,
                * and cancelling an unscaled 0.92 * radius left each line's height
                * depending on its size again: making DANIEL W LIU bigger sent it
                * up and off the top while ALWAYS BET ON sank onto the felt.
                */}
              {!noTitle && (
                <group scale={titleFit}>
                  <group position={[tune.ttAX, tune.ttAY - 0.92 * tune.titleR * tune.ttAS, 0]} rotation={[0, 0, tune.ttAR]} scale={tune.ttAS}>
                    <ResumeWord state={titleState} text="ALWAYS BET ON" ink="#6cf59a" arc="top" stopMotion={{ fps: tune.smFps, travel: tune.smTravel, from: tune.smFrom, boil: tune.smBoil, boilTurn: tune.smTurn, group: smGroup, word: wordMotion }} radius={tune.titleR} spacing={tune.titleSpacing} size={tune.titleSize} weight={tune.titleWeight} still ransom={noJack ? undefined : tune.jkSeed} ransomWord={11} />
                  </group>
                  {/* spacing follows the line's own size: a bigger line needs more
                      room between its letters or they overlap, and the 0.82 that
                      used to sit here made DANIEL W LIU permanently the smaller of
                      the two whatever its own knob said */}
                  <group position={[tune.ttBX, tune.ttBY - 0.92 * tune.titleR * tune.ttBS - tune.titleGap, 0]} rotation={[0, 0, tune.ttBR]} scale={tune.ttBS}>
                    <ResumeWord state={titleState} text="DANIEL W LIU" ink="#6cf59a" arc="top" stopMotion={{ fps: tune.smFps, travel: tune.smTravel, from: tune.smFrom, boil: tune.smBoil, boilTurn: tune.smTurn, group: smGroup, word: wordMotion }} radius={tune.titleR} spacing={tune.titleSpacing} size={tune.titleSize} weight={tune.titleWeight} still stagger={0.5} ransom={noJack ? undefined : tune.jkSeed} ransomWord={12} />
                  </group>
                </group>
              )}
              {/* chips and dice strewn under the title, from a seed */}
              {!noTitle && <TitleProps y={tableFit.feltY + 0.004} />}
              {/* the dealer's hand (reaper.tsx, arm-only staging) is parked until the flick reads right (mocap);
                  ?hand brings it back */}
              {showHand && (
                <Suspense fallback={null}>
                  <Reaper armOnly position={[7.6, tableFit.feltY - 4.1, 7.0]} handTarget={[0.2, tableFit.feltY + 3.1, 7.0]} height={5.5} yaw={Math.PI / 2} slide={3.2} flickAt={1.7} handRef={handRef} clock0={chipClock0} />
                </Suspense>
              )}
            </>
          )}
        </>
      )}
      {compName && COMP_GRAPHS[compName] ? (
        <CompositorPost
          build={COMP_GRAPHS[compName].build}
          onFrame={(u, t) => COMP_GRAPHS[compName].onFrame?.(u, t, fx.current)}
          onReady={onReady}
          rawOutput={COMP_GRAPHS[compName].rawOutput}
          renderScale={scaleOverride ?? adaptiveScale}
          positionPass={COMP_GRAPHS[compName].positionPass}
          positionDirty={() => fx.current.impactAge < 2.5}
        />
      ) : (
        <MangaPost scroll={scroll} fx={fx} onReady={onReady} uniformsRef={uniformsRef} />
      )}
    </>
  )
}
