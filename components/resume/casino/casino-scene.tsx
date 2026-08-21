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
import ResumeWord from './resume-word'
import CompositorPost from './compositor-post'
import Apple, { PommeLights } from './apple'
import RoundTable, { type TableFit } from './round-table'
import FlatTable, { RailTube, tableGraph, tableUniforms, type FlatTableSpec } from './flat-table'
import { getTune, REVEAL_TIME_SCALE, useTune, type Tune } from './tune'
import { driveLamp, LAMP, roomMaterial } from './materials'
import SetEditor, { type SetPiece } from './set-editor'
import { applyLayout, type StageLayout } from 'blender-to-threejs'
import { COMP_GRAPHS } from './comp-graphs'

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
const CHIP_INKS: ChipInk[] = ['red', 'gold', 'green', 'black']
export const CHIP_STACKS: { pos: [number, number]; ink: ChipInk; count: number; title: string }[] =
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
  const mats = useMemo(
    () => ({
      red: [chipMaterial('red'), chipFaceMaterial('red'), chipFaceMaterial('red')],
      gold: [chipMaterial('gold'), chipFaceMaterial('gold'), chipFaceMaterial('gold')],
      green: [chipMaterial('green'), chipFaceMaterial('green'), chipFaceMaterial('green')],
      black: [chipMaterial('black'), chipFaceMaterial('black'), chipFaceMaterial('black')],
    }),
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
function RoomLamp({ fx }: { fx: MutableRefObject<ImpactFx> }) {
  const light = useRef<THREE.SpotLight>(null)
  const target = useMemo(() => {
    const t = new THREE.Object3D()
    t.position.set(LAMP.position[0], 0, LAMP.position[2])
    return t
  }, [])
  useFrame(() => {
    const t = getTune()
    const { cone, gain, room } = lampCurve(fx.current.impactAge, t.lampCone, LAMP.gain)
    driveLamp({ y: t.lampH, cone, gain, room })
    const L = light.current
    if (L) {
      L.position.set(LAMP.position[0], t.lampH, LAMP.position[2])
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
  const geo = useMemo(() => cycloramaGeometry(120, 40, -12, 9, 40), [])
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
}: {
  scroll: MutableRefObject<ScrollState>
  fx: MutableRefObject<ImpactFx>
  tableFitRef: MutableRefObject<TableFit | null>
  focusRef?: MutableRefObject<boolean>
  pageRef?: MutableRefObject<PageFrame | null>
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
  useFrame(({ camera }, dt) => {
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
      // pomme's long lens: fov 25, pulled back to keep the same framing
      const pc = camera as THREE.PerspectiveCamera
      if (pc.fov !== 25) {
        pc.fov = 25
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
      camera.position.set(px, py + fx.current.jolt, pz)
      // aim between the felt and the chip's apex so the dealer, the flick and the word all sit in frame;
      // when the file is open, down over the fold of the spread
      camera.lookAt(0.9 * f, fy + tn.lookY + (fy - (fy + tn.lookY)) * f, -0.6 + (1.3 + 0.6) * f)
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
    // B&W IMPACT FRAMES (pomme's flicker sequence): five 12fps frames,
    // 2 inverted then 3 gritty mono, then the afterimage veil decays out
    const ia = fx.current.impactAge
    const IFR = 1 / 12
    let imp = 0
    if (ia >= 0) {
      const stepN = Math.floor(ia / IFR)
      if (stepN <= 1) imp = 2
      else if (stepN <= 4) imp = 1
    }
    p.uniforms.impact.value = imp
    p.uniforms.after.value = ia >= IFR * 5 ? 0.5 * Math.exp(-(ia - IFR * 5) * 6) : 0
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
  // the table is drawn like pomme's floor (one disc, material graph); ?table=model brings back the Meshy mesh
  const tune = useTune()
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
  const pommeMatch = useMemo(
    () => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('cam') === 'pomme' : false),
    [],
  )
  return (
    <>
      {/* the camera holds its table framing: the folder presents ITSELF to it (see ResumeFolder) */}
      <CameraRig scroll={scroll} fx={fx} tableFitRef={tableFitRef} pageRef={pageFrameRef} />
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
      {pommeMatch ? <PommeLights /> : <RoomLamp fx={fx} />}
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
                  flick={showHand ? { fromRef: handRef, at: 1.7, apex: 3.0 } : { from: [0, tableFit.feltY + 0.11, 0], at: 1.7, apex: 3.2 }}
                  onWord={onWord}
                  onStart={onChipStart}
                  armed={armed}
                  perch={{ at: 2.4 + 1.3 * 0.9, height: 0.06 }}
                  shed={folderOpen}
                />
              </Suspense>
              {/* the resume folder from the old page, standing on the felt beside the chip */}
              <Suspense fallback={null}>
                <ResumeFolder position={[0.15, tableFit.feltY + 0.004, 0.95]} length={3.6} yaw={Math.PI / 2 - 0.1} groupRef={setFolderGroup} deal={{ from: [13, 0.4], at: 2.4, duration: 1.3, turns: 1.5 }} fx={fx} onOpen={onFolderOpen} open={folderOpen} onPageFrame={onPageFrame} />
              </Suspense>
              {/* the hand: a royal flush in hearts, fanned on the felt */}
              <RoyalFlush position={[-3.2, tableFit.feltY + 0.006, -0.7]} yaw={0.24} length={1.25} spread={0.6} arc={0.2} />
              {/* RESUME under the tumbling chip at the apex (pomme's LOADING) */}
              {/* pomme's LOADING proportions exactly: the same span and per-letter tangent rotation it uses around
                  the apple, and the same letter-width to arc-step ratio (~1.22), which is what makes the arc
                  read as evenly wrapped. No depth wrap: pomme's is a flat arc, the wrap is the rotation. */}
              <ResumeWord state={wordState} radius={1.78} size={1.9} outline={16} groundY={tableFit.feltY} loose />
              {/* the title: two shallow banner arcs over the landed chip, felt-green ink, written in about a
                  second after the impact (after the flash frames) and kept */}
              <TitleDriver fx={fx} onState={onTitle} y={tableFit.feltY + tune.titleY} />
              {/* ?notitle drops the title arcs: capture with and without, diff, and any effect they have on
                  what is behind them shows up as itself. That is how the decal passes bug was found */}
              {!noTitle && <ResumeWord state={titleState} text="ALWAYS BET ON" ink="#6cf59a" arc="top" radius={tune.titleR} spacing={tune.titleSpacing} size={tune.titleSize} weight={tune.titleWeight} still />}
              {!noTitle && <ResumeWord state={titleState} text="DANIEL W LIU" ink="#6cf59a" arc="top" radius={tune.titleR - tune.titleGap} spacing={tune.titleSpacing * 0.9} size={tune.titleSize * 0.82} weight={tune.titleWeight} still stagger={0.5} />}
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
          renderScale={scaleOverride ?? COMP_GRAPHS[compName].renderScale}
          positionPass={COMP_GRAPHS[compName].positionPass}
          positionDirty={() => fx.current.impactAge < 2.5}
        />
      ) : (
        <MangaPost scroll={scroll} fx={fx} onReady={onReady} uniformsRef={uniformsRef} />
      )}
    </>
  )
}
