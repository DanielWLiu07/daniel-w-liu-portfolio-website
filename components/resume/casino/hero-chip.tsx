'use client'

/**
 * The opening beat: a hero chip falls onto the felt. A direct port of pomme's
 * hero-apple landing (web/public/scene/natureScene.js), same numbers:
 *
 *   ENTRANCE  drops in from above the frame (cubic ease, 1.1s) to a mid-frame
 *             hover, held far-small (0.62), tumbling at 1.7 / 2.4 rad/s, with
 *             a ring of streaming air lines above it
 *   THE DROP  anticipation hop (0.18s) -> stretched fall, spin finishing
 *             upright via a Hermite spin-down that arrives at zero spin on the
 *             hit -> HITSTOP (world holds 160ms) -> deep squash (0.72) with
 *             backOut recover -> micro-bounce
 *   IMPACT    ground shockwave (expanding ink ring + 8 radial dashes over
 *             0.5s raw time), five 12fps impact frames in the pass (2 inverted
 *             two-tone, 3 gritty mono), an afterimage veil, a camera jolt
 *
 * The chip lands and stays: it becomes part of the table.
 */
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { chipFaceMaterial, chipFaceWatercolorMaterial, chipMaterial, chipWatercolorMaterial } from './materials'
import { useTexture } from '@react-three/drei'
import { applyPainterlyStyle } from 'blender-to-threejs'

export interface ImpactFx {
  /** seconds since the chip hit the felt, <0 before */
  impactAge: number
  /** camera jolt offset in world units, applied by the camera rig */
  jolt: number
  /** true once the chip has landed */
  landed: boolean
}

const TAU = Math.PI * 2
const cl = (x: number) => Math.min(1, Math.max(0, x))
const backOut = (u: number) =>
  u <= 0 ? 0 : u >= 1 ? 1 : 1 + 2.70158 * Math.pow(u - 1, 3) + 1.70158 * Math.pow(u - 1, 2)

const HIT = 0.62
const HITSTOP = 0.16
const HOVER_HOLD = 0.9 // seconds of tumbling hover before the drop
const FLICK_RISE = 0.55 // seconds from the hand to the apex
const FLICK_HOLD = 2.4 // seconds tumbling at the apex while the word writes itself

/** what the word (and anything else) needs to know about the chip, written every frame */
export interface ChipWordState {
  x: number
  y: number
  z: number
  /** seconds since the word should start writing (-1 before) */
  onT: number
  /** seconds since the drop began, i.e. since the word should un-write (-1 before) */
  offT: number
  /** offT at which the chip hits the felt, so anything riding the chip can land with it */
  hitAt: number
}
const CHIP_R = 0.55
const CHIP_H = 0.13

export default function HeroChip({
  landing = [0, 0, 0.7],
  report,
  painterly = false,
  watercolorMaterial = false,
  size = 1,
  flick,
  onWord,
  onStart,
  armed = true,
  perch,
  shed = false,
}: {
  landing?: [number, number, number]
  /**
   * opening beat: the chip waits in a hand at `from` (world) until `at` seconds, is flicked
   * up to `apex` above the landing height, tumbles there while the word writes, then drops.
   * Without it: pomme's entrance from above.
   */
  flick?: { from?: [number, number, number]; fromRef?: MutableRefObject<[number, number, number]>; at: number; apex?: number }
  /** called once with the chip's start time (clock.elapsedTime) so other actors (the dealer's arm) share the clock */
  onStart?: (t0: number) => void
  /** the beat's clock only starts once armed (the page cover has cleared); the chip stays hidden before */
  armed?: boolean
  /** something slides under the landed chip `at` seconds after impact: it hops and settles `height` higher */
  perch?: { at: number; height: number }
  /** the thing it perches on opens: the chip hops off to the side and settles on the felt (returns when false) */
  shed?: boolean
  /** called every frame with the word state (position, write on/off clocks) for the ResumeWord */
  onWord?: (s: ChipWordState) => void
  /** chip diameter multiplier (the drop choreography is unchanged) */
  size?: number
  /** called every frame with the impact state (age, jolt) */
  report: (impactAge: number, jolt: number) => void
  /** shade the chip with pomme's painterly cel style (needs /models/watercolor_normal.png) */
  painterly?: boolean
  /** use the per-object watercolour MATERIAL graph instead of the flat palette chip */
  watercolorMaterial?: boolean
}) {
  const chip = useRef<THREE.Group>(null)
  const chipMesh = useRef<THREE.Mesh>(null)
  const normalMap = useTexture('/models/watercolor_normal.png')
  useEffect(() => {
    if (!painterly || !chipMesh.current) return
    const handle = applyPainterlyStyle(chipMesh.current, { normalMap })
    return () => handle.remove()
  }, [painterly, normalMap])
  const lines = useRef<THREE.Group>(null)
  const burst = useRef<THREE.Group>(null)
  const mats = useMemo(
    () =>
      watercolorMaterial
        ? [chipWatercolorMaterial('red'), chipFaceWatercolorMaterial('red'), chipFaceWatercolorMaterial('red')]
        : [chipMaterial('red'), chipFaceMaterial('red'), chipFaceMaterial('red')],
    [watercolorMaterial],
  )
  // opacity is animated per frame by reaching the material through the
  // group refs (mutating hook-returned values directly trips the compiler lint)
  const lineMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#2a2622', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    [],
  )
  const burstMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#121212', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    [],
  )
  useEffect(() => () => { lineMat.dispose(); burstMat.dispose() }, [lineMat, burstMat])

  // air-line ring: same layout as the apple's (12 lines, offsets, speeds)
  const lineSpec = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * TAU + (i % 3) * 0.35
        const r = 0.34 + (i % 4) * 0.09
        const h = 0.5 + ((i * 7) % 5) * 0.14
        return { a, r, h, phase: (i * 0.61) % 1, speed: 1.5 + (i % 5) * 0.3 }
      }),
    [],
  )
  const dashAng = useMemo(() => Array.from({ length: 8 }, (_, i) => (i / 8) * TAU + 0.2), [])

  const wordLocal = useRef<ChipWordState>({ x: 0, y: 0, z: 0, onT: -1, offT: -1, hitAt: HIT })
  const state = useRef({
    t0: -1,
    drop: null as null | { y0: number; x0: number; z0: number; rx: number; rz: number; tx: number; tz: number },
    lineAmt: 0,
    lineT: -1,
    lineY: 0,
    hitAt: -1,
    shedAmt: 0,
    // integrated tumble angles (flick mode): rates change continuously, angles never jump or run backwards
    spinX: 0,
    spinZ: 0,
    lastT: -1,
  })

  useFrame(({ clock }) => {
    const g = chip.current
    if (!g) return
    const st = state.current
    const t = clock.elapsedTime
    if (st.t0 < 0) {
      if (!armed) {
        g.scale.setScalar(0.0001)
        return
      }
      st.t0 = t
      onStart?.(t)
    }
    const te = t - st.t0
    const [lx, ly, lz] = landing
    const dt = st.lastT >= 0 ? Math.min(0.05, t - st.lastT) : 0
    st.lastT = t
    const chipH = CHIP_H * size
    let lineFloor = 0

    const preDrop = flick ? flick.at + FLICK_RISE + FLICK_HOLD : 1.1 + HOVER_HOLD
    const w = onWord ? wordLocal.current : null
    if (te < preDrop) {
      if (flick) {
        // IN THE HAND, then the FLICK: a fast ballistic rise with a hard spin, easing into the tumble.
        // Every quantity is continuous across hand -> flick -> hover -> drop: position by construction,
        // rotation by integrating a continuous rate (rest 0 -> launch peak -> the hover rates 1.7 / 2.4
        // that the drop's hermite tangents assume), scale constant.
        const apex = flick.apex ?? 1.75
        const src = flick.fromRef?.current ?? flick.from ?? [lx, ly + 1, lz]
        const [fx0, fy0, fz0] = src
        const u = cl((te - flick.at) / FLICK_RISE)
        const rise = 1 - (1 - u) * (1 - u) // decelerating, gravity-like
        const hover = apex + 0.22 * Math.sin(t * 0.9) * u
        g.scale.setScalar(0.62)
        g.position.set(THREE.MathUtils.lerp(fx0, lx, rise), THREE.MathUtils.lerp(fy0, ly + hover, rise), THREE.MathUtils.lerp(fz0, lz, rise))
        if (te < flick.at) {
          // resting: near flat, no spin
          st.spinX = -0.35
          st.spinZ = 0
        } else {
          // a flicked chip: a hard kick spread over both horizontal axes (so the face keeps showing through
          // the spin, not an edge-on flip), decaying into pomme's two-axis tumble (1.7 / 2.4)
          const ts = te - flick.at
          // the launch flip is about ONE axis (a coin flicked off a thumb) at the same rate as the fall's
          // (about 30 rad/s), held through the rise; it eases into the tumble only at the apex, and the second
          // axis comes in only during the hang so the face shows
          const RISE_RATE = 30
          const rateX = ts < FLICK_RISE ? RISE_RATE : 1.7 + (RISE_RATE - 1.7) * Math.exp(-(ts - FLICK_RISE) / 0.22)
          st.spinX += rateX * dt
          st.spinZ += 2.4 * (1 - Math.exp(-Math.max(0, ts - FLICK_RISE) / 0.4)) * dt
        }
        g.rotation.set(st.spinX, 0, st.spinZ)
        lineFloor = u > 0 && u < 1 ? 0.55 + 0.45 * (1 - u) : u >= 1 ? 0.55 : 0
        if (w) {
          w.x = g.position.x
          w.y = g.position.y
          w.z = g.position.z
          w.onT = u >= 1 ? te - (flick.at + FLICK_RISE) : -1
          w.offT = -1
        }
      } else {
        // ENTRANCE + HOVER (pomme)
        g.scale.setScalar(0.62)
        const enter = 1 - Math.pow(1 - cl(te / 1.1), 3)
        const hover = 1.75 + 0.22 * Math.sin(t * 0.9)
        const yE = THREE.MathUtils.lerp(8.0, hover, enter)
        g.position.set(lx, ly + yE, lz)
        g.rotation.set(t * 1.7, 0, t * 2.4)
        lineFloor = Math.max(cl((0.92 - enter) * 3), 0.55)
      }
      if (burst.current) burst.current.visible = false
      report(-1, 0)
    } else {
      // THE DROP
      const T = te - preDrop
      if (w) {
        w.x = g.position.x
        w.y = g.position.y
        w.z = g.position.z
        w.offT = T
      }
      const Td = T <= HIT ? T : HIT + Math.max(0, T - HIT - HITSTOP)
      if (!st.drop) {
        const rx = g.rotation.x, rz = g.rotation.z
        let tx = TAU * Math.ceil((rx + 0.8) / TAU)
        // z: snap to the NEAREST flat during the anticipation (a quick adjust), then the fall is a clean
        // single-axis flip about x with two extra turns
        const tz = TAU * Math.round(rz / TAU)
        tx += TAU * 2
        // start the drop from EXACTLY where the chip already is, in all three axes. The old line clamped
        // the height to at least 1.5 and ignored that the drop's own formula adds (chipH / 2) * sy, which
        // the hover does not, so the chip stepped on the first frame of its fall: about 0.075 up, against
        // 0.020 for a normal frame. Anything following the chip (the word) inherits that step, and it is
        // the visible break between the float and the fall.
        st.drop = {
          y0: Math.max(g.position.y - ly - (chipH / 2) * 0.62, 0.2),
          x0: g.position.x,
          z0: g.position.z,
          rx,
          rz,
          tx,
          tz,
        }
      }
      const drop = st.drop
      if (Td < 1.6) {
        const antic = cl(Td / 0.18)
        const u = cl((Td - 0.18) / (HIT - 0.18))
        let y: number, sy = 1, sxz = 1
        if (u <= 0) {
          y = drop.y0 + 0.28 * Math.sin((antic * Math.PI) / 2)
          sy = sxz = 0.62
        } else if (u < 1) {
          y = (drop.y0 + 0.28) * (1 - u * u)
          const near = 0.62 + 0.38 * u * u
          sy = near * (1 + 0.22 * u)
          sxz = near * (1 - 0.1 * u)
        } else {
          const b = cl((Td - HIT) / 0.22)
          y = 0.12 * Math.sin(b * Math.PI) * (1 - b)
          const k = backOut(cl((Td - HIT) / 0.28))
          sy = 0.72 + 0.28 * k
          sxz = 1.16 - 0.16 * k
        }
        // the chip's pivot is its centre: sit its underside on the felt. x and z ease across from where
        // the chip actually was to the landing spot, rather than snapping to it on the first frame.
        const across = 1 - Math.pow(1 - cl(Td / HIT), 3)
        g.position.set(
          drop.x0 + (lx - drop.x0) * across,
          ly + y + (chipH / 2) * sy,
          drop.z0 + (lz - drop.z0) * across,
        )
        g.scale.set(sxz, sy, sxz)
        const s = cl(Td / HIT)
        const s2 = s * s, s3 = s2 * s
        const h00 = 2 * s3 - 3 * s2 + 1
        const h10 = s3 - 2 * s2 + s
        const h01 = -2 * s3 + 3 * s2
        // z settles in the anticipation (0.18 s), x flips through the fall
        const za = antic * antic * (3 - 2 * antic)
        g.rotation.set(drop.rx * h00 + 1.7 * HIT * h10 + drop.tx * h01, 0, drop.rz + (drop.tz - drop.rz) * za)
      } else {
        // at rest; if a folder slides under it, a small hop and it settles on top
        let lift = 0
        if (perch) {
          const pt = T - HIT - perch.at
          if (pt >= 0) {
            const hop = pt < 0.32 ? Math.sin((pt / 0.32) * Math.PI) * 0.22 : 0
            const settle = pt < 0.32 ? cl(pt / 0.32) : 1
            lift = perch.height * settle + hop
          }
        }
        // shed: hops off to the side when the folder opens, back when it closes
        const shedTarget = shed ? 1 : 0
        st.shedAmt += (shedTarget - st.shedAmt) * Math.min(1, dt * 4)
        const sh = st.shedAmt
        const arc = Math.sin(sh * Math.PI) * 0.45
        // clear of the reading frame, not just off the folder: the camera comes right down on the page
        const dx = 2.6 * sh
        const dz = 4.6 * sh
        g.position.set(lx + dx, ly + chipH / 2 + lift * (1 - sh) + arc, lz + dz)
        g.scale.setScalar(1)
        g.rotation.set(drop.tx + sh * 0.35, sh * 0.6, drop.tz - sh * 0.25)
      }

      // IMPACT: shockwave on RAW time so it expands through the held frames
      const ia = T - HIT
      report(ia, ia >= 0 && ia < 0.35 ? Math.sin(ia * 42) * 0.07 * Math.exp(-ia * 11) : 0)
      const bT = ia / 0.5
      const b = burst.current
      if (b) {
        b.visible = bT > 0 && bT < 1
        if (b.visible) {
          const e = 1 - Math.pow(1 - bT, 3)
          ;(b.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = 0.65 * (1 - bT)
          b.children[0].scale.setScalar(0.6 + 3.6 * e)
          for (let i = 1; i < b.children.length; i++) {
            const d = b.children[i]
            const r = 0.45 + 2.2 * e
            const a = dashAng[i - 1]
            d.position.set(Math.cos(a) * r, 0.04, Math.sin(a) * r)
            d.scale.setScalar(1 - 0.6 * bT)
          }
        }
      }
    }

    if (w && onWord) onWord(w)

    // AIR LINES from measured downward speed plus the loading-phase floor
    const ay = g.position.y
    if (t !== st.lineT && st.lineT >= 0) {
      const vy = (st.lineY - ay) / Math.max(t - st.lineT, 1e-3)
      const want = cl((vy - 0.5) / 3.0)
      st.lineAmt += (want - st.lineAmt) * 0.35
    }
    if (t !== st.lineT) { st.lineT = t; st.lineY = ay }
    const amt = Math.max(st.lineAmt, lineFloor)
    const L = lines.current
    if (L) {
      L.visible = amt > 0.03
      if (L.visible) {
        L.position.set(lx, ay + 0.55, lz)
        ;(L.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = 0.45 * amt
        const rate = 1.3 + 1.5 * amt
        L.children.forEach((k, i) => {
          const spec = lineSpec[i]
          const cyc = (spec.phase + t * spec.speed * rate) % 1
          k.position.y = cyc * 1.5
          const fade = Math.sin(cyc * Math.PI)
          k.scale.y = (0.5 + 0.8 * fade) * (0.7 + 0.5 * amt)
        })
      }
    }
  })

  return (
    <>
      <group ref={chip} scale={0.0001}>
        <mesh ref={chipMesh} material={mats} castShadow>
          <cylinderGeometry args={[CHIP_R * size, CHIP_R * size, CHIP_H * size, 40]} />
        </mesh>
      </group>
      <group ref={lines} visible={false}>
        {lineSpec.map((l, i) => (
          <mesh key={i} material={lineMat} position={[Math.cos(l.a) * l.r, 0, Math.sin(l.a) * l.r]} rotation={[0, -l.a, 0]}>
            <planeGeometry args={[0.05, l.h]} />
          </mesh>
        ))}
      </group>
      <group ref={burst} visible={false} position={[landing[0], landing[1], landing[2]]}>
        <mesh material={burstMat} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.42, 0.52, 40]} />
        </mesh>
        {dashAng.map((a, i) => (
          <mesh key={i} material={burstMat} position={[Math.cos(a) * 0.5, 0.04, Math.sin(a) * 0.5]} rotation={[-Math.PI / 2, 0, -a]}>
            <planeGeometry args={[0.3, 0.05]} />
          </mesh>
        ))}
      </group>
    </>
  )
}
