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
 *             backOut recovery with the underside staying on the felt
 *   IMPACT    ground shockwave, eyes and suits slow through their
 *             authored layout, then accelerate offscreen as normal paint
 *             expands from the centre; one opening flash and a camera jolt
 *
 * The chip lands and stays: it becomes part of the table.
 */
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { chipFaceMaterial, chipFaceWatercolorMaterial, chipMaterial, chipWatercolorMaterial, eyeMaterial } from './materials'
import { useTexture } from '@react-three/drei'
import { applyPainterlyStyle, modalTransform } from 'blender-to-threejs'
import { drawSuit, SUITS } from './card-art'
import { EYE_PLANE, inkFor, openAt } from './eye'
import { beatTime, easeFall, easeRise, FALL_FOR, getLetter, getTune, placingSuits, setLetter, type Tune } from './tune'
import { IMPACT_DURATION, impactBurstMotion, impactDrift, impactEyeMotion, impactExitPosition } from './impact-eye-motion'
import { markPropMotion } from './prop-arrival'
import type { createInteractiveChip } from './chip-interaction'
import { fitChipInGap } from './chip-home'

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

/** frames held on the impact before the settle runs. The pause IS the hit: nothing else in the beat
 *  stops, so stopping is what makes this one land. */
const HITSTOP = 0.26
/**
 * ?perf records [performance.now(), impact age] per frame on window.__hit.
 *
 * A frame-time trace on its own cannot tell you WHERE in the beat a stall landed, and guessing from the
 * loop period is how a compile at mount gets read as a cost at the hit. Same base as the rAF timestamps,
 * so the two line up directly.
 */
let perfLog: number[][] | null | undefined
function perfMark(ia: number) {
  if (perfLog === undefined) {
    perfLog =
      typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('perf')
        ? ((window as unknown as { __hit: number[][] }).__hit = [])
        : null
  }
  perfLog?.push([performance.now(), ia])
}

/** frames the burst is drawn at nothing for, at mount, so its shaders compile off the beat */
const WARM_FRAMES = 3
/** the eye ring keeps being drawn at nothing until this many seconds before the hit */
const WARM_UNTIL = 0.45
const HOVER_HOLD = 0.9 // seconds of tumbling hover before the drop
const FLICK_HOLD = 2.4 // seconds tumbling at the apex while the word writes itself

/** reused so the per-frame suit placement allocates nothing */
const scratch = { right: new THREE.Vector3(), up: new THREE.Vector3(), warm: new THREE.Vector3() }

/**
 * The burst as it was placed, baked in as the starting point.
 *
 * These are DEFAULTS, not saved state: the sparse tweak store is per browser, so without them the
 * arrangement would only exist in the one profile it was dialled in on. Anything dragged still overrides
 * its entry, and "reset burst" comes back to this rather than to nothing.
 */
const BURST_HOME: Record<string, { s: number; dx: number; dy: number; r: number }> = {
  'suit:0': { s: 1, dx: 0.966, dy: 1.013, r: -0.308 },
  'suit:1': { s: 1, dx: 0.445, dy: 1.122, r: 0 },
  'suit:2': { s: 1, dx: -0.04, dy: 1.029, r: 0 },
  'suit:3': { s: 1, dx: -0.338, dy: 0.868, r: 0.417 },
  'eye:0': { dx: 3.812, dy: 3.008, s: 1.597, r: 0 },
  'eye:1': { dx: -1.017, dy: 3.263, s: 0.913, r: -0.031 },
  'eye:2': { dx: -1.331, dy: 3.227, s: 1, r: 0 },
  'eye:3': { dx: 3.693, dy: 1.517, s: 1.278, r: -0.577 },
  'eye:4': { dx: -3.201, dy: 2.345, s: 1, r: 0.159 },
  'eye:5': { dx: -0.93, dy: 1.846, s: 1, r: -0.499 },
  'eye:6': { dx: -0.475, dy: 1.588, s: 1, r: 0.207 },
  'eye:7': { dx: -0.046, dy: 1.088, s: 1, r: 0.184 },
  'eye:8': { dx: -0.863, dy: 1.111, s: 1.458, r: 0.249 },
  'eye:9': { dx: 0.391, dy: 0.813, s: 1.446, r: 0 },
}

/** one suit's placed offset in the plane facing the lens */
function suitPlace(t: Tune, i: number): { x: number; y: number } {
  if (i === 0) return { x: t.suit0X, y: t.suit0Y }
  if (i === 1) return { x: t.suit1X, y: t.suit1Y }
  if (i === 2) return { x: t.suit2X, y: t.suit2Y }
  return { x: t.suit3X, y: t.suit3Y }
}

/**
 * Each eye's own size and tilt, so a fan of them does not read as one eye stamped out n times.
 *
 * Deterministic from the index rather than random: the same eye is the same eye across reloads, which
 * matters because they can be placed by hand and a placement that moved on refresh would be useless.
 */
function eyeVary(i: number): { s: number; r: number } {
  return { s: 0.78 + ((i * 7) % 5) * 0.11, r: (((i * 11) % 7) - 3) * 0.09 }
}

/**
 * Where eye `i` of `n` sits before anything is moved: MIRRORED PAIRS about the centre.
 *
 * Symmetric by construction rather than by nudging, so it is centred at every count and stays centred
 * when the count changes. Out and DOWN - tight and high in the middle, wide and low at the ends. An odd
 * count puts the odd one out on the centre line, which is the only symmetric place for it.
 */
function eyeHome(i: number, n: number): { x: number; y: number } {
  if (n <= 1) return { x: 0, y: 1.35 }
  const odd = n % 2 === 1
  if (odd && i === 0) return { x: 0, y: 1.35 }
  const j = odd ? i - 1 : i
  const pairs = Math.ceil((odd ? n - 1 : n) / 2)
  const p = Math.floor(j / 2)
  const side = j % 2 === 0 ? -1 : 1
  const t = pairs <= 1 ? 0 : p / (pairs - 1)
  return { x: side * (0.95 + t * 4.85), y: 1.35 - t * t * 5.2 }
}

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

/** the chip's own metrics, so anything that has to sit on or beside it measures off one place */
export const HERO_CHIP = { r: CHIP_R, h: CHIP_H, rest: 1, flight: 0.62 }
export const heroChipRadius = (size = 1) => HERO_CHIP.r * size * HERO_CHIP.rest
export const heroChipHeight = (size = 1) => HERO_CHIP.h * size * HERO_CHIP.rest

export default function HeroChip({
  landing = [0, 0, 0.7],
  report,
  painterly = false,
  watercolorMaterial = false,
  size: authoredSize = 1,
  flick,
  onWord,
  onStart,
  armed = true,
  perch,
  shed = false,
  folderObstacle,
  feltRear = -Infinity,
  folderRestPose,
  worldPositionRef,
}: {
  landing?: [number, number, number]
  /** Live prop position, including physics, for the character’s pointing gesture. */
  worldPositionRef?: MutableRefObject<THREE.Vector3 | null>
  /**
   * opening beat: the chip waits in a hand at `from` (world) until `at` seconds, is flicked
   * up to `apex` above the landing height, tumbles there while the word writes, then drops.
   * Without it: pomme's entrance from above.
   */
  flick?: { from?: [number, number, number]; fromRef?: MutableRefObject<[number, number, number]>; at: number; apex?: number; hold?: number }
  /** called once with the chip's start time (clock.elapsedTime) so other actors (the dealer's arm) share the clock */
  onStart?: (t0: number) => void
  /** the beat's clock only starts once armed (the page cover has cleared); the chip stays hidden before */
  armed?: boolean
  /** something slides under the landed chip `at` seconds after impact: it hops and settles `height` higher */
  perch?: { at: number; height: number }
  /** the thing it perches on opens: the chip hops off to the side and settles on the felt (returns when false) */
  shed?: boolean
  folderObstacle?: THREE.Group | null
  /** Frontmost edge of the padded rear rail, in the landing coordinate frame. */
  feltRear?: number
  folderRestPose?: { position: [number, number, number]; yaw: number }
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
  const home = useRef({ x: 0, z: 0, size: authoredSize, locked: false, requestedX: NaN, requestedZ: NaN, authoredSize: NaN, rear: NaN })
  const restFolder = useRef({ box: new THREE.Box3(), inverse: new THREE.Matrix4(), pose: new THREE.Matrix4(), mesh: new THREE.Matrix4(), part: new THREE.Box3() })
  const folderCollision = useRef({ box: new THREE.Box3(), lastBox: new THREE.Box3(), part: new THREE.Box3(), inverse: new THREE.Matrix4(), min: new THREE.Vector3(), max: new THREE.Vector3(), origin: new THREE.Vector3() })
  const folderSolids = useMemo(() => {
    const meshes: THREE.Mesh[] = []
    folderObstacle?.traverse((object) => {
      if (object.name === 'folder_back' || object.name === 'folder_cover' || object.name === 'folder_tab' || object.name === 'folder_page') {
        const mesh = object as THREE.Mesh
        if (mesh.geometry) meshes.push(mesh)
      }
    })
    return meshes
  }, [folderObstacle])
  useEffect(() => { restFolder.current.box.makeEmpty() }, [folderObstacle, folderRestPose])
  const interaction = useRef<{
    hovered: boolean; scale: number; ready: boolean; loading: boolean; pending: number; generation: number
    physics: Awaited<ReturnType<typeof createInteractiveChip>> | null; p: THREE.Vector3; q: THREE.Quaternion
  }>({ hovered: false, scale: 1, ready: false, loading: false, pending: 0, generation: 0, physics: null, p: new THREE.Vector3(0, 0.065, 0), q: new THREE.Quaternion() })
  useEffect(() => {
    const state = interaction.current
    return () => { state.generation++; state.physics?.dispose(); state.physics = null }
  }, [])
  // Only the optional cel/painterly mode uses this map. The default graph does
  // not sample it: don't download/upload 704KB merely to throw it away.
  const [normalMap] = useTexture(painterly ? ['/models/watercolor_normal-delivery.webp'] : [])
  useEffect(() => {
    if (!painterly || !chipMesh.current) return
    const handle = applyPainterlyStyle(chipMesh.current, { normalMap })
    return () => handle.remove()
  }, [painterly, normalMap])
  const lines = useRef<THREE.Group>(null)
  const burst = useRef<THREE.Group>(null)
  const suitRing = useRef<THREE.Group>(null)
  const eyeRing = useRef<THREE.Group>(null)
  const rays = useRef<THREE.Group>(null)
  /** how far along their travel the burst is on the frozen frame, so a drag maps 1:1 to the cursor */
  const spread = useRef(1)
  /** what G, S and R act on: whatever was clicked last */
  const sel = useRef<string | null>(null)
  const snap = useRef<{ s: number; dx: number; dy: number; r: number } | null>(null)
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
  /**
   * The ring and the dashes draw the same way the suits and the eyes do: over the frame, never behind it.
   *
   * They are one effect, and half of it having a depth test was the inconsistency - the shockwave could be
   * cut by the felt it is spreading across while the suits riding it could not.
   */
  const burstMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#121212', transparent: true, opacity: 0, depthWrite: false, depthTest: false, side: THREE.DoubleSide }),
    [],
  )
  /**
   * The impact lines are WHITE, where the ring and dashes are near-black.
   *
   * They are only ever drawn inside the inverted frame, and an inversion prints DARK as paper - a black
   * line on a dark table is exactly the thing that disappears. White reads as ink there, the same reason
   * the suits are drawn white.
   */
  const rayMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, depthTest: false, toneMapped: false, fog: false, side: THREE.DoubleSide }),
    [],
  )
  useEffect(() => () => { lineMat.dispose(); burstMat.dispose(); rayMat.dispose() }, [lineMat, burstMat, rayMat])

  /**
   * The four suits, thrown out on the shockwave and visible ONLY while the impact frames run.
   *
   * Drawn WHITE, which is what makes them print: the inverted frame inks anything bright or saturated, so
   * a white shape on the dark table comes through as solid black and reads as part of the flash rather
   * than as an object sitting in the scene. depthTest off for the same reason as the rest of the burst.
   *
   * They use the deck's own drawSuit, not glyphs, so they are the same shapes as the pips on the cards.
   */
  const suitMats = useMemo(() => {
    if (typeof document === 'undefined') return [] as THREE.MeshBasicMaterial[]
    return SUITS.map((suit) => {
      const S = 256
      const c = document.createElement('canvas')
      c.width = S
      c.height = S
      const x = c.getContext('2d')
      if (x) drawSuit(x as never, suit, S / 2, S / 2, S * 0.78, '#ffffff')
      const tex = new THREE.CanvasTexture(c)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 4
      return new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, depthTest: false, toneMapped: false, fog: false, side: THREE.DoubleSide })
    })
  }, [])
  useEffect(() => () => { for (const m of suitMats) { m.map?.dispose(); m.dispose() } }, [suitMats])

  /**
   * Eyes that exist only inside the flash, on the same wave as the suits.
   *
   * eyeMaterial from the eye stage, flat: in an impact frame these are graphics, not lit objects, and the
   * two-tone throws the shading away anyway. Each takes its own ink so a row of them is not one eye
   * repeated. Twelve are made and the ones past the count are hidden.
   */
  const eyeMats = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        // no paper wobble: see eyeMaterial. Twelve of these appear and leave inside six inverted frames,
        // and the wander costs a perlin field per fragment that none of those frames can show.
        const m = eyeMaterial(`hit${i}`, inkFor(i), true, false)
        m.depthTest = false
        m.depthWrite = false
        return m
      }),
    [],
  )

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

  /**
   * Speed lines thrown OUT of the chip, in the plane facing the lens.
   *
   * The shockwave ring and its dashes lie on the felt, so they describe the ground the hit travelled
   * along; these are square to the camera and describe the hit itself. Uneven on purpose - an even fan
   * reads as a sunburst graphic, and hand-drawn impact lines are never evenly spaced. Thin, because at
   * any real width they stop being speed lines and become bars across the frame.
   */
  const raySpec = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => {
        const a = (i / 22) * TAU + ((i * 37) % 11) * 0.026
        return { a, len: 1.1 + ((i * 13) % 7) * 0.5, wide: 0.018 + ((i * 5) % 4) * 0.013, off: 0.5 + ((i * 7) % 5) * 0.12 }
      }),
    [],
  )

  const wordLocal = useRef<ChipWordState>({ x: 0, y: 0, z: 0, onT: -1, offT: -1, hitAt: FALL_FOR })
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
    /** frames of the shader warm still owed. See warmBurst. */
    warm: WARM_FRAMES,
    /** the flight's impact age, stashed for the warm: -999 before the flight has run at all */
    ia: -999,
    /** clock at the first warm frame, so a page with no flight still lets go of the ring */
    warmT: -1,
  })

  /**
   * DRAW THE FLASH ONCE, at nothing, before the beat needs it.
   *
   * Everything in the burst is hidden until the hit and then all of it appears on ONE frame: the ring, the
   * dashes, twenty-two rays, four suits and twelve eyes, and the eyes are a procedural line-art shader
   * each. A pipeline is compiled the first time its object is actually drawn, so that frame was compiling
   * twenty-six of them at once. Measured on the first hit of a page load: a 600 ms frame and then a
   * 1383 ms one, against a 16.7 ms budget. Every later hit in the same load was clean, which is the
   * signature of compilation rather than of cost.
   *
   * So they are drawn during the opening instead, at a ten-thousandth of their size at the chip's landing
   * spot. Sub-pixel, so nothing lands on screen, but a real draw call, so the pipelines are real. The
   * stall moves to the cover, where there is already loading happening and nothing to interrupt.
   *
   * It has to be the LAST write of the frame: the burst's own code sets visible from the beat clock every
   * frame, and whatever is written last is what the renderer reads.
   */
  const warmBurst = (camera: THREE.Camera) => {
    const st = state.current
    if (st.warm <= 0) return
    /**
     * The EYES are warmed right up to the drop, the rest for two frames.
     *
     * Two frames is enough for the plain materials and measurably is not enough for the eyes: they went
     * on recompiling at the hit anyway, which says something between mount and the landing invalidates
     * them - a node material is rebuilt when the scene it is built against changes, and the whole opening
     * is the table lighting itself. Keeping them drawn through that means whatever rebuild is coming
     * happens on the frame that caused it, spread across the approach, rather than all of it arriving on
     * the one frame the flash needs.
     *
     * They are a ten-thousandth of their size the whole time, so the cost is twelve draw calls of no
     * pixels, and it ends before the flash is anywhere near.
     */
    const groups = [burst.current, rays.current, suitRing.current, eyeRing.current, lines.current]
    st.warm -= 1
    if (st.warmT < 0) st.warmT = st.lastT
    // the second clause is the way out on a page that never plays the flight at all: nothing would ever
    // set an impact age there, and the ring would sit in front of the lens for the life of the page
    const done = st.warm <= 0 && (st.ia > -WARM_UNTIL || st.lastT - st.warmT > 20)
    // PARKED IN FRONT OF THE LENS, not left where they live. A group at the landing spot is off screen for
    // most of the opening and gets frustum culled, and a culled object is never drawn and so never
    // compiled - the first warm did nothing for exactly that reason. Culling stays off afterwards too:
    // these are billboards that travel a long way from their group's origin, so the bounding sphere the
    // cull tests is the wrong shape for them anyway.
    // BEHIND the lens, not in front of it at a small size. A sub-pixel quad still covers a pixel centre
    // now and then, which is a speck blinking in the middle of the shot; everything behind the near plane
    // is clipped away with certainty. The draw is still recorded either way, which is all the compile needs.
    const at = scratch.warm.set(0, 0, 0.6).applyMatrix4(camera.matrixWorld)
    const short = st.warm <= 0
    for (const g of groups) {
      if (!g) continue
      // the plain materials are done after their two frames; only the eye ring keeps going
      const hold = !done && (!short || g === eyeRing.current)
      g.visible = hold
      g.scale.setScalar(hold ? 1e-4 : 1)
      if (hold) {
        g.position.copy(at)
        for (const c of g.children) c.frustumCulled = false
      } else g.position.set(landing[0], landing[1], landing[2])
    }
    if (done) st.warm = 0
    else st.warm = Math.max(st.warm, 0.5)
  }

  useFrame(({ clock, camera }) => {
    const g = chip.current
    if (!g) return
    const st = state.current
    const t = clock.elapsedTime
    if (st.t0 < 0) {
      if (!armed) {
        g.scale.setScalar(0.0001)
        warmBurst(camera)
        return
      }
      st.t0 = t
      onStart?.(t)
    }
    // through the beat's SHARED clock: it holds when the title's tuner freezes the beat, and it wraps when
    // ?jack=loop replays it, both at the same instant everything else does. A coin on its own clock would
    // either hold at a frame the beat never passes through, or restart out of step with the title.
    const te = beatTime(t - st.t0)
    const [requestedX, ly, requestedZ] = landing
    const obstacle = folderCollision.current
    obstacle.box.makeEmpty()
    if (folderObstacle) {
      // Only solid folder pieces, not oversized soft-shadow or link planes.
      for (const mesh of folderSolids) {
        mesh.updateWorldMatrix(true, false)
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
        obstacle.part.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld)
        obstacle.box.union(obstacle.part)
      }
      if (g.parent) {
        g.parent.updateWorldMatrix(true, false)
        obstacle.box.applyMatrix4(obstacle.inverse.copy(g.parent.matrixWorld).invert())
      }
    }
    const rest = restFolder.current
    if (rest.box.isEmpty() && folderObstacle && folderRestPose) {
      let motionRoot: THREE.Object3D = folderObstacle
      while (motionRoot.parent && motionRoot.name !== 'resume-folder-deal') motionRoot = motionRoot.parent
      motionRoot.updateWorldMatrix(true, false)
      rest.inverse.copy(motionRoot.matrixWorld).invert()
      rest.pose.makeRotationY(folderRestPose.yaw).setPosition(...folderRestPose.position)
      for (const mesh of folderSolids) {
        rest.mesh.copy(rest.pose).multiply(rest.inverse).multiply(mesh.matrixWorld)
        rest.part.copy(mesh.geometry.boundingBox!).applyMatrix4(rest.mesh)
        rest.box.union(rest.part)
      }
    }
    // clamped at both ends: a replay steps the clock BACKWARDS, and a negative dt integrated into the
    // tumble would unwind it
    const dt = st.lastT >= 0 ? Math.min(0.05, Math.max(0, t - st.lastT)) : 0
    st.lastT = t
    let lineFloor = 0
    // the flight's numbers, live off the panel. HIT is the drop's length and everything after it - the
    // hitstop, the squash, the settle - is measured relative to it, so they follow it on their own.
    const TN = getTune()
    const RISE = TN.jkRise
    const HIT = TN.jkFallFor
    const RISE_RATE = TN.jkSpinUp
    const APEX_RATE = TN.jkSpinTop
    const LAND_RATE = TN.jkSpinLand
    const hold = flick?.hold ?? FLICK_HOLD
    const preDrop = flick ? flick.at + RISE + hold : 1.1 + HOVER_HOLD
    const targetHome = home.current
    const retuned = targetHome.requestedX !== requestedX || targetHome.requestedZ !== requestedZ || targetHome.authoredSize !== authoredSize || targetHome.rear !== feltRear
    if (te < preDrop || !targetHome.locked || retuned) {
      fitChipInGap(targetHome, requestedX, requestedZ, authoredSize, feltRear, rest.box)
      targetHome.locked = te >= preDrop
      targetHome.requestedX = requestedX; targetHome.requestedZ = requestedZ
      targetHome.authoredSize = authoredSize; targetHome.rear = feltRear
    }
    const { x: lx, z: lz, size: landedSize } = targetHome
    const fitProgress = THREE.MathUtils.smoothstep(te, preDrop, preDrop + HIT)
    const size = THREE.MathUtils.lerp(authoredSize, landedSize, fitProgress)
    const chipH = CHIP_H * size
    const w = onWord ? wordLocal.current : null

    if (te < preDrop) {
      // the drop LATCHES its start pose, so a replay that steps the clock back before the drop has to
      // release it or the second pass falls from wherever the first one started
      st.drop = null
      if (flick) {
        // IN THE HAND, then the FLICK: a fast ballistic rise with a hard spin, easing into the tumble.
        // Every quantity is continuous across hand -> flick -> hover -> drop: position by construction,
        // rotation by integrating a continuous rate, scale constant.
        const apex = flick.apex ?? 1.75
        const src = flick.fromRef?.current ?? flick.from ?? [lx, ly + 1, lz]
        const [fx0, fy0, fz0] = src
        const u = cl((te - flick.at) / RISE)
        // gravity-like by default; jkEaseCoin puts it on the lens's chosen easing instead, so the two can
        // be shaped together rather than drifting apart
        const rise = TN.jkEaseCoin > 0.5 ? easeRise(u, TN.jkEaseUp, 2) : 1 - (1 - u) * (1 - u)
        // Small and quick, not big and slow: at 0.22 the coin covered 28 px in one direction across the
        // hold, which is a sink rather than a hover and reads as the camera giving way early.
        const hover = apex + 0.07 * Math.sin(t * 1.6) * u
        g.scale.setScalar(0.62)
        g.position.set(THREE.MathUtils.lerp(fx0, lx, rise), THREE.MathUtils.lerp(fy0, ly + hover, rise), THREE.MathUtils.lerp(fz0, lz, rise))
        if (te < flick.at) {
          // resting: near flat, no spin
          st.spinX = -0.35
          st.spinZ = 0
        } else {
          const ts = te - flick.at
          /**
           * The flip SLOWS INTO THE APEX, on the same shape as the climb itself.
           *
           * It used to hold a flat rate for the whole rise and then hand over to the fall's curve, which
           * started far lower - an eighteenfold collapse on a single frame, at the top, which is the one
           * moment in the beat the eye is already on the coin. Tying the rate to the climb gives a hard
           * flip off the thumb that winds down as the coin runs out of speed, and the fall picks it back
           * up from exactly there.
           */
          const rateX = APEX_RATE + (RISE_RATE - APEX_RATE) * (1 - cl(ts / RISE))
          st.spinX += rateX * dt
          // the second axis comes in only during a hang, so the face shows while it waits
          st.spinZ += 2.4 * (1 - Math.exp(-Math.max(0, ts - RISE) / 0.4)) * dt
        }
        g.rotation.set(st.spinX, 0, st.spinZ)
        lineFloor = u > 0 && u < 1 ? 0.55 + 0.45 * (1 - u) : u >= 1 ? 0.55 : 0
        if (w) {
          w.x = g.position.x
          w.y = g.position.y
          w.z = g.position.z
          w.onT = u >= 1 ? te - (flick.at + RISE) : -1
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
        const rx = g.rotation.x
        const rz = g.rotation.z
        let tx = TAU * Math.ceil((rx + 0.8) / TAU)
        // z snaps to the NEAREST flat; the fall is a clean single-axis flip about x with two extra turns
        const tz = TAU * Math.round(rz / TAU)
        tx += TAU * 2
        // start the drop from EXACTLY where the chip already is, in all three axes. The old line clamped
        // the height to at least 1.5 and ignored that the drop's own formula adds (chipH / 2) * sy, which
        // the hover does not, so the chip stepped on the first frame of its fall. Anything following the
        // chip inherits that step, and it is the visible break between the float and the fall.
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
      // HIT plus the settle windows below (the longest is 0.28) with room to spare. It was a bare literal
      // once, which silently stopped tracking the moment HIT moved.
      if (Td < HIT + 0.68) {
        // NO ANTICIPATION. There used to be a hitch UP before the fall, which is the standard way to sell
        // a drop and is wrong here: the coin is already at the top of a ballistic rise, so a second little
        // rise after it has stopped reads as two separate moves.
        const u = cl(Td / HIT)
        let y: number
        let sy = 1
        let sxz = 1
        if (u < 1) {
          y = drop.y0 * (1 - (TN.jkEaseCoin > 0.5 ? easeFall(u, TN.jkEaseDown, 2) : u * u))
          const near = 0.62 + 0.38 * u * u
          sy = near * (1 + 0.22 * u)
          sxz = near * (1 - 0.1 * u)
        } else {
          // No second launch after impact: squash recovers with its underside
          // planted on the felt, rather than adding a separate scripted hop.
          y = 0
          const k = backOut(cl((Td - HIT) / 0.28))
          // deep on purpose: it falls a long way, and flattening by a quarter is a coin being set down
          // rather than one arriving. The backOut brings it up past its own height before it settles.
          sy = 0.55 + 0.45 * k
          sxz = 1.34 - 0.34 * k
        }
        // the chip's pivot is its centre: sit its underside on the felt. x and z ease across from where
        // the chip actually was to the landing spot, rather than snapping to it on the first frame.
        const across = 1 - Math.pow(1 - cl(Td / HIT), 3)
        g.position.set(drop.x0 + (lx - drop.x0) * across, ly + y + (chipH / 2) * sy, drop.z0 + (lz - drop.z0) * across)
        g.scale.set(sxz, sy, sxz)
        const sp = cl(Td / HIT)
        const s2 = sp * sp
        const s3 = s2 * sp
        const h00 = 2 * s3 - 3 * s2 + 1
        const h10 = s3 - 2 * s2 + sp
        const h01 = -2 * s3 + 3 * s2
        // z snaps to the nearest flat over the first fifth of a second of the FALL, since there is no
        // anticipation to do it in any more; x flips through the whole drop
        const zq = cl(Td / 0.18)
        const za = zq * zq * (3 - 2 * zq)
        /**
         * A hermite on BOTH tangents, so the flip has a speed at each end rather than only at the start.
         *
         * The old curve set the start tangent and left the end one at zero, which meant the flip wound
         * DOWN through the fall and was at a standstill on impact - the coin falling faster and faster
         * while turning slower and slower. Starting at APEX_RATE keeps it continuous with the climb, and
         * ending at LAND_RATE puts the fastest part of the flip where the fastest part of the fall is. It
         * still arrives on drop.tx, a whole number of turns, so it lands flat either way.
         */
        const h11 = s3 - s2
        g.rotation.set(drop.rx * h00 + APEX_RATE * HIT * h10 + drop.tx * h01 + LAND_RATE * HIT * h11, 0, drop.rz + (drop.tz - drop.rz) * za)
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
      st.ia = ia
      perfMark(ia)
      // The camera takes the hit, and it is the ONLY shake in the beat, which is what lets it be this big.
      report(ia, ia >= 0 && ia < 0.5 ? Math.sin(ia * 38) * 0.22 * Math.exp(-ia * 8) : 0)
      // Slow through the layout, keep coasting, then accelerate out while normal paint returns behind.
      const placing = placingSuits()
      const burstMotion = impactBurstMotion(ia, placing)
      const eOut = burstMotion.arrival
      const alive = ia > 0 && ia < IMPACT_DURATION
      const pc = camera as THREE.PerspectiveCamera
      const distance = Math.hypot(camera.position.x - lx, camera.position.y - ly, camera.position.z - lz)
      const viewHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(pc.fov) / 2)
      // Twice the viewport diagonal also clears sprites whose origin is below the screen centre.
      const exitDistance = 2 * viewHeight * Math.hypot(1, pc.aspect) + 8
      const b = burst.current
      if (b) {
        b.visible = alive
        if (b.visible) {
          const e = eOut
          ;(b.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = 0.65
          // out to the rail, not a third of the way: the wave is what carries the reveal and the suits
          b.children[0].scale.setScalar(0.6 + 12 * e + exitDistance * burstMotion.exit)
          for (let i = 1; i < b.children.length; i++) {
            const d = b.children[i]
            const r = 0.45 + 7 * e + exitDistance * burstMotion.exit
            const a = dashAng[i - 1]
            d.position.set(Math.cos(a) * r, 0.04, Math.sin(a) * r)
            d.scale.setScalar(1 - 0.6 * e)
          }
        }
      }

      const right = scratch.right.setFromMatrixColumn(camera.matrixWorld, 0)
      const up = scratch.up.setFromMatrixColumn(camera.matrixWorld, 1)
      // out along each thing's OWN vector, from suitFrom of the way to all of it. At suitFrom 0 they are
      // EMITTED from the chip and the placed values are the end of the throw.
      const out = impactEyeMotion(ia, TN.suitFrom, placing).spread
      spread.current = out

      const ry = rays.current
      if (ry) {
        ry.visible = alive
        if (ry.visible) {
          // they LEAVE: the near end runs away from the chip rather than the line simply growing, which is
          // what makes them read as thrown off it instead of as a fixed star
          const near = 0.3 + 2.5 * eOut + exitDistance * burstMotion.exit
          for (let i = 0; i < ry.children.length; i++) {
            const m = ry.children[i] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
            const spx = raySpec[i]
            const d = near * spx.off + spx.len * 0.5
            m.position.set(0, 0, 0).addScaledVector(right, Math.cos(spx.a) * d).addScaledVector(up, Math.sin(spx.a) * d)
            m.quaternion.copy(camera.quaternion)
            m.rotateZ(spx.a - Math.PI / 2)
            m.scale.set(1, 1 - 0.45 * eOut + burstMotion.exit, 1)
            m.material.opacity = 0.9
          }
        }
      }

      /**
       * The suits ride the same wave, billboarded so they stay square to the lens as they travel out.
       *
       * They stay visible throughout outward flight and are retired only after clearing the viewport.
       */
      const sr = suitRing.current
      if (sr) {
        sr.visible = alive
        if (sr.visible) {
          for (let i = 0; i < sr.children.length; i++) {
            const m = sr.children[i] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
            const key = `suit:${i}`
            const tw = getLetter(key, BURST_HOME[key])
            const home = suitPlace(TN, i)
            const px = { x: home.x + tw.dx, y: home.y + tw.dy }
            const bo = impactDrift(ia, i)
            // Small rotational drift settles while outward translation keeps coasting.
            const jitter = TN.hitBoil * burstMotion.drift
            const pos = impactExitPosition(px.x * out, px.y * out, burstMotion.exit, exitDistance + TN.suitSize * tw.s * 2, i)
            m.position
              .set(0, 0, 0)
              .addScaledVector(right, pos.x + bo.x * jitter)
              .addScaledVector(up, pos.y + bo.y * jitter)
            m.quaternion.copy(camera.quaternion)
            m.rotateZ(tw.r + bo.turn * jitter * 1.2)
            m.scale.setScalar(TN.suitSize * tw.s)
            m.material.opacity = 0.95
          }
        }
      }

      const er = eyeRing.current
      if (er) {
        er.visible = alive
        if (er.visible) {
          // real seconds since the hit, which is what the eye's own wake curve is written against
          const eyeT = Math.max(0, ia)
          const n = Math.round(TN.hitEyeN)
          const eyeMotion = impactEyeMotion(ia, TN.suitFrom, placing)
          for (let i = 0; i < er.children.length; i++) {
            const m = er.children[i] as THREE.Mesh<THREE.BufferGeometry, THREE.Material>
            m.visible = i < n
            if (!m.visible) continue
            const key = `eye:${i}`
            const home = eyeHome(i, n)
            const tw = getLetter(key, BURST_HOME[key])
            const px = { x: home.x + tw.dx, y: home.y + tw.dy }
            const bo = impactDrift(ia, i + 41)
            const jitter = TN.hitBoil * burstMotion.drift
            const v = eyeVary(i)
            const extent = Math.hypot(EYE_PLANE.w, EYE_PLANE.h) * TN.hitEyeSize * tw.s * v.s
            const pos = impactExitPosition(px.x * eyeMotion.spread, px.y * eyeMotion.spread, burstMotion.exit, exitDistance + extent, i + 41)
            m.position
              .set(0, 0, 0)
              .addScaledVector(right, pos.x + bo.x * jitter)
              .addScaledVector(up, pos.y + bo.y * jitter)
            m.quaternion.copy(camera.quaternion)
            m.rotateZ(tw.r + v.r + bo.turn * jitter * 1.2)
            m.scale.setScalar(TN.hitEyeSize * tw.s * v.s)
            /**
             * Each eye WAKES, on the eye stage's own curve, and they do not wake together.
             *
             * A single eased opening with no overshoot, because an eye that springs past open and settles
             * back reads as a cartoon take rather than as waking up. A per-eye delay staggers them, so the
             * flash is a ripple of eyes opening rather than a row of lids moving as one shutter.
             *
             * WIDE OPEN while placing, though: the placer freezes one instant, and an eye whose delay has
             * not elapsed there is a closed lid - impossible to judge and nearly impossible to grab.
             */
            // Twelve distinct slots instead of seven shared ones; the order skips around the layout.
            const openingOrder = (i * 5) % 12
            const open = placing ? 1 : openAt(eyeT, { delay: TN.hitEyeDelay + openingOrder * TN.hitEyeStagger, wake: 0.13 + ((i * 3) % 4) * 0.03 })
            const uni = (m.material.userData.uniforms ?? {}) as Record<string, { value: number }>
            if (uni.eyeOpen) uni.eyeOpen.value = open
            if (uni.eyeIrisX) uni.eyeIrisX.value = 0
            if (uni.eyeIrisY) uni.eyeIrisY.value = 0
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
    if (t !== st.lineT) {
      st.lineT = t
      st.lineY = ay
    }
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

    // Layer interaction after the authored intro and air-line calculation. Only
    // the chip transforms: titles, impact clock and all saved anchors stay put.
    const interactionState = interaction.current
    interactionState.ready = te > preDrop + HIT + 2 && !placingSuits()
    if (!interactionState.ready) {
      if (interactionState.physics || interactionState.loading) {
        interactionState.generation++
        interactionState.physics?.dispose()
        interactionState.physics = null
        interactionState.loading = false
        interactionState.pending = 0
      }
      interactionState.scale = 1
      interactionState.hovered = false
    } else {
      // Freeze size in flight so hover cannot change a falling body's dimensions.
      const target = interactionState.physics && !interactionState.physics.sleeping()
        ? interactionState.scale : interactionState.hovered ? 1.18 : 1
      interactionState.scale += (target - interactionState.scale) * (1 - Math.exp(-16 * dt))
      if (Math.abs(target - interactionState.scale) < 0.001) interactionState.scale = target
      g.scale.multiplyScalar(interactionState.scale)
      const physics = interactionState.physics
      if (physics && !obstacle.box.isEmpty()) {
        const scale = size * interactionState.scale
        obstacle.origin.set(lx, ly, lz)
        obstacle.min.copy(obstacle.box.min).sub(obstacle.origin).divideScalar(scale)
        obstacle.max.copy(obstacle.box.max).sub(obstacle.origin).divideScalar(scale)
        physics.setFolder(obstacle.min, obstacle.max, !obstacle.lastBox.equals(obstacle.box))
        obstacle.lastBox.copy(obstacle.box)
      }
      const moving = physics?.step(dt, interactionState.p, interactionState.q) ?? false
      if (physics) {
        const scale = size * interactionState.scale
        g.position.x += interactionState.p.x * scale
        g.position.z += interactionState.p.z * scale
        g.position.y += interactionState.p.y * scale - CHIP_H * size / 2
        g.quaternion.copy(interactionState.q)
      } else g.position.y += CHIP_H * size / 2 * (interactionState.scale - 1)
      if (moving || interactionState.scale !== target) markPropMotion(0.1)
    }
    g.scale.multiplyScalar(size / authoredSize)
    if(worldPositionRef) {
      worldPositionRef.current ??= new THREE.Vector3()
      g.getWorldPosition(worldPositionRef.current)
    }
    warmBurst(camera)
  })

  /**
   * DRAG TO PLACE, only while ?suits is up.
   *
   * The sprites are billboarded, so the plane they live in is the camera's own: a pixel of cursor travel
   * is a fixed number of world units across the lens's right and up axes at their distance. Dividing by
   * the spread fraction is what keeps the sprite under the cursor - the stored value is the position at
   * FULL travel, and on the frozen frame it is only `spread` of the way there.
   */
  const { gl, camera: cam3 } = useThree()
  useEffect(() => {
    if (!placingSuits()) return
    const el = gl.domElement
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const right = new THREE.Vector3()
    const up = new THREE.Vector3()
    /** which group is being dragged and which member of it: suits and eyes are placed the same way */
    let held: { kind: 'suit' | 'eye'; i: number } | null = null
    let lastX = 0
    let lastY = 0
    const cursor = { x: 0, y: 0 }

    const pick = (e: PointerEvent): { kind: 'suit' | 'eye'; i: number } | null => {
      const r = el.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, cam3)
      for (const [kind, g] of [['suit', suitRing.current], ['eye', eyeRing.current]] as const) {
        if (!g || !g.visible) continue
        /**
         * VISIBLE children only, and this is not belt and braces.
         *
         * Three's raycaster does not skip invisible objects when it is handed an explicit array - it only
         * does that when it walks a hierarchy itself. The eyes past "how many eyes" are rendered but
         * hidden, sitting unmoved at the chip's origin, so without this filter they are pickable: an
         * invisible eye-shaped plane in the middle of the screen that can be grabbed and dragged.
         */
        const hit = ray.intersectObjects(g.children.filter((c) => c.visible), false)[0]
        if (hit) return { kind, i: g.children.indexOf(hit.object) }
      }
      return null
    }
    const selMesh = (): THREE.Object3D | null => {
      const k = sel.current
      if (!k) return null
      const [kind, n] = k.split(':')
      const g = kind === 'suit' ? suitRing.current : eyeRing.current
      return g?.children[Number(n)] ?? null
    }
    /** where the selected sprite is on screen, which is the PIVOT both S and R work around */
    const pivot = { x: 0, y: 0 }
    const start = { d: 1, a: 0 }

    const down = (e: PointerEvent) => {
      const i = pick(e)
      if (!i) return
      held = i
      sel.current = `${i.kind}:${i.i}`
      lastX = e.clientX
      lastY = e.clientY
      el.setPointerCapture(e.pointerId)
      e.preventDefault()
      e.stopPropagation()
    }
    const move = (e: PointerEvent) => {
      cursor.x = e.clientX
      cursor.y = e.clientY
      if (!held) return
      const g = held.kind === 'suit' ? suitRing.current : eyeRing.current
      if (!g) return
      const pc = cam3 as THREE.PerspectiveCamera
      const dist = g.children[held.i].getWorldPosition(right).distanceTo(cam3.position)
      const perPx = (2 * dist * Math.tan(THREE.MathUtils.degToRad(pc.fov) / 2)) / el.clientHeight
      right.setFromMatrixColumn(cam3.matrixWorld, 0)
      up.setFromMatrixColumn(cam3.matrixWorld, 1)
      const k = perPx / Math.max(0.05, spread.current)
      const dx = (e.clientX - lastX) * k
      const dy = -(e.clientY - lastY) * k
      lastX = e.clientX
      lastY = e.clientY
      const key = `${held.kind}:${held.i}`
      const tw = getLetter(key, BURST_HOME[key])
      setLetter(key, { dx: tw.dx + dx, dy: tw.dy + dy })
    }
    const up_ = (e: PointerEvent) => {
      if (!held) return
      held = null
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    }
    el.addEventListener('pointerdown', down, true)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up_)

    /**
     * Blender's G, S and R on whatever was last clicked.
     *
     * modalTransform reports the gesture and this decides what it means, which is the only shape that
     * works here: the burst is re-placed from the store every frame, so writing to an Object3D would be
     * overwritten on the next one. Escape restores the snapshot taken at onBegin, which is what makes a
     * cancel a cancel rather than an undo.
     */
    const stop = modalTransform(el, {
      enabled: () => sel.current !== null,
      onBegin: () => {
        snap.current = sel.current ? { ...getLetter(sel.current, BURST_HOME[sel.current]) } : null
        const m = selMesh()
        const r = el.getBoundingClientRect()
        if (m) {
          const v = m.getWorldPosition(new THREE.Vector3()).project(cam3)
          pivot.x = r.left + ((v.x + 1) / 2) * r.width
          pivot.y = r.top + ((1 - v.y) / 2) * r.height
        }
        // the cursor's distance and angle FROM the pivot when the key was pressed: S and R are both
        // ratios against these, which is what makes them feel like Blender's
        start.d = Math.max(8, Math.hypot(cursor.x - pivot.x, cursor.y - pivot.y))
        start.a = Math.atan2(-(cursor.y - pivot.y), cursor.x - pivot.x)
      },
      onUpdate: (gst) => {
        const key = sel.current
        const base = snap.current
        if (!key || !base) return
        const fine = gst.fine ? 0.25 : 1
        if (gst.mode === 'move') {
          // 1:1 with the cursor, the same conversion the drag uses, so G and dragging agree
          const m = selMesh()
          const pc = cam3 as THREE.PerspectiveCamera
          const dist = m ? m.getWorldPosition(new THREE.Vector3()).distanceTo(cam3.position) : 10
          const perPx = (2 * dist * Math.tan(THREE.MathUtils.degToRad(pc.fov) / 2)) / el.clientHeight
          const k = (perPx / Math.max(0.05, spread.current)) * fine
          const dx = gst.exact !== null ? gst.exact : gst.dx * k
          const dy = gst.exact !== null ? gst.exact : -gst.dy * k
          setLetter(key, {
            dx: base.dx + (gst.axis === 'y' ? 0 : dx),
            dy: base.dy + (gst.axis === 'x' ? 0 : dy),
          })
        } else if (gst.mode === 'scale') {
          /**
           * Blender scales by the cursor's DISTANCE from the pivot, not by how far it has travelled.
           *
           * Mapping horizontal travel instead means the direction that grows depends on nothing the eye
           * can see, so pulling away from a sprite on the left shrank it. As a ratio of distances, away is
           * always bigger and toward is always smaller, wherever it sits.
           */
          const d = Math.hypot(cursor.x - pivot.x, cursor.y - pivot.y)
          const f = gst.exact !== null ? gst.exact : 1 + (d / start.d - 1) * fine
          setLetter(key, { s: Math.max(0.05, base.s * Math.max(0.02, f)) })
        } else {
          /**
           * And rotates by the cursor's ANGLE around the pivot, so the sprite follows the hand round.
           *
           * The y term is negated because screen y grows downward: without it, dragging anticlockwise
           * turns the sprite clockwise.
           */
          const a = Math.atan2(-(cursor.y - pivot.y), cursor.x - pivot.x)
          let d = a - start.a
          while (d > Math.PI) d -= 2 * Math.PI
          while (d < -Math.PI) d += 2 * Math.PI
          const r = gst.exact !== null ? (gst.exact * Math.PI) / 180 : d * fine
          setLetter(key, { r: base.r + r })
        }
      },
      onCancel: () => {
        if (sel.current && snap.current) setLetter(sel.current, snap.current)
      },
    })

    return () => {
      stop()
      el.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up_)
    }
  }, [gl, cam3])

  return (
    <>
      <group ref={chip} scale={0.0001} userData={{ cardRenderLayer: 2 }}>
        <mesh ref={chipMesh} material={mats} castShadow
          onPointerOver={(event) => {
            if (!interaction.current.ready || !chip.current?.visible) return
            event.stopPropagation()
            interaction.current.hovered = true
            markPropMotion(0.6)
          }}
          onPointerOut={() => { interaction.current.hovered = false; markPropMotion(0.6) }}
          onClick={(event) => {
            if (!interaction.current.ready || !chip.current?.visible) return
            event.stopPropagation()
            const state = interaction.current
            if (state.physics) state.physics.kick()
            else {
              state.pending++
              if (!state.loading) {
                state.loading = true
                const generation = state.generation
                void import('./chip-interaction').then(async ({ createInteractiveChip }) => {
                  if (generation !== state.generation || !chip.current) return
                  const physics = await createInteractiveChip(chip.current.quaternion)
                  if (generation !== state.generation) { physics.dispose(); return }
                  state.physics = physics
                  state.loading = false
                  while (state.pending > 0) { physics.kick(); state.pending-- }
                  markPropMotion(1)
                }).catch((error) => {
                  if (generation !== state.generation) return
                  state.loading = false
                  state.pending = 0
                  console.error('Chip physics failed to load', error)
                })
              }
            }
            markPropMotion(1)
          }}>
          <cylinderGeometry args={[CHIP_R * authoredSize, CHIP_R * authoredSize, CHIP_H * authoredSize, 40]} />
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
      <group ref={rays} visible={false} position={[landing[0], landing[1], landing[2]]}>
        {raySpec.map((sp, i) => (
          <mesh key={i} material={rayMat} renderOrder={30 + i}>
            <planeGeometry args={[sp.wide, sp.len]} />
          </mesh>
        ))}
      </group>
      <group ref={suitRing} visible={false} position={[landing[0], landing[1], landing[2]]}>
        {suitMats.map((m, i) => (
          <mesh key={i} material={m} renderOrder={40 + i}>
            <planeGeometry args={[1, 1]} />
          </mesh>
        ))}
      </group>
      <group ref={eyeRing} visible={false} position={[landing[0], landing[1], landing[2]]}>
        {eyeMats.map((m, i) => (
          <mesh key={i} material={m} renderOrder={60 + i}>
            <planeGeometry args={[EYE_PLANE.w, EYE_PLANE.h]} />
          </mesh>
        ))}
      </group>
    </>
  )
}
