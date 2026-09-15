'use client'

/**
 * Chips and dice strewn round the ALWAYS BET ON title.
 *
 * SCATTERED FROM A SEED rather than placed one at a time. The point is a handful
 * of them looking dropped, and twenty positions to dial is not an editor, it is
 * a chore: a count, a size, a spread and a reroll gets there in four knobs and
 * every arrangement it makes is reproducible.
 *
 * Everything wears the table's own materials, so a chip here is the same object
 * as a chip on the felt rather than a lookalike sitting next to one.
 */
import { createContext, useContext, useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { chipFaceWatercolorMaterial, chipWatercolorMaterial, CHIP_INKS, LAMP, type ChipInk } from './materials'
import { heroChipHeight, heroChipRadius, type ImpactFx } from './hero-chip'
import { propArrival, bakedDiePose, diceEntranceYaw, markPropMotion } from './prop-arrival'
import type { createInteractiveDie } from './interactive-die'
import { createChipController } from './chip-pile-controller'
import { ROOM_FLOOR_DROP } from './room-geometry'
import Die from './dice'
import { impactPropFill } from './impact-eye-motion'
import { getProp, getTune, setProp, useTune, type PropTweak } from './tune'

const ChipPhysics = createContext<ReturnType<typeof createChipController> | null>(null)

/**
 * The same size as the chip in the middle of the table, taken FROM it, and
 * taken through the SAME knob it is.
 *
 * The hero chip is mounted with size={tune.chip}, so its radius is not a
 * constant at all: it tracks a slider. Matching only its code path, which is
 * what the first two attempts did, still came out wrong, because the knob was
 * never in the sum. Measured on the actual objects: the hero chip is 1.760
 * across and the strewn ones were 1.100, and 1.760 / 1.100 is exactly the 1.6
 * that knob sits at.
 */
export const propChipRadius = (chip: number) => heroChipRadius(chip)
export const propChipHeight = (chip: number) => heroChipHeight(chip)

/**
 * And the dice against the chips, at the ratio the real things have.
 *
 * A casino chip is 39 mm across and a casino die is 19 mm, so a die is a shade
 * under half a chip's diameter. Picking a die size by eye is what put them at
 * three quarters of one, which reads as a pair out of a board game.
 */
export const DIE_PER_CHIP = 19 / 39
export const propDieSize = (chip: number) => propChipRadius(chip) * 2 * DIE_PER_CHIP

/**
 * The placements he dragged, baked in.
 *
 * This is the LAYER between the seed and the drags: the scatter deals a handful
 * from nothing, this puts the ones that have been placed by hand where they
 * belong, and a live drag still beats both. Anything with no entry here falls
 * back to the scatter, so raising ttChips past what is listed still adds chips
 * rather than stacking them at the origin.
 *
 * It also gives "reset props" somewhere sensible to go: back to this, which is
 * the arrangement somebody chose, rather than back to a seed nobody did.
 */
export const PROP_LAYOUT: Record<string, PropTweak> = {
  'chip:0': { x: 4.957, z: -0.9523, s: 1, r: 5.8993 },
  'chip:1': { x: -4.0301, z: -4.0922, s: 1, r: 4.286 },
  'chip:2': { x: -3.5662, z: -2.1937, s: 1, r: 0.3126 },
  'chip:3': { x: 5.9211, z: -3.1258, s: 1, r: 5.9411 },
  'chip:4': { x: 4.3771, z: -3.9486, s: 1, r: 6.0762 },
  'chip:5': { x: -4.4436, z: -0.7125, s: 1, r: 4.8246 },
  'chip:6': { x: -5.3249, z: -2.6237, s: 1, r: 4.0489 },
  'die:0': { x: 2.6722, z: -2.8463, s: 1, r: 3.4207 },
  'die:1': { x: 3.7287, z: -1.9103, s: 1, r: 1.4726 },
}

/**
 * The approved rear edge moved from -4.5 to -2.5. Translate the whole
 * arrangement by the same +2 in Z, preserving spacing, pile shapes and saved
 * per-prop edits. This is a baked placement, not a link to the live table slider.
 */
export const PROP_LAYOUT_OFFSET_Z = 2

/** deterministic, so a seed always deals the same handful */
const hash = (n: number) => {
  const s = Math.sin(n * 91.7 + 53.3) * 43758.5453
  return s - Math.floor(s)
}

/**
 * One pile, with a CHARACTER of its own.
 *
 * Colour and height alone are not diversity. Every stack was drawn with the same
 * wobble expression and the same rotation step, so eight piles were eight copies
 * of one pile in eight colours: the thing the eye picks up on a table is how a
 * pile SITS, not what denomination it is.
 *
 * So each carries its own lean, its own wobble amplitude and phase, its own
 * twist per chip, and its own kind: a neat stack somebody built, a loose one
 * somebody pushed, or a single chip lying on its own. Those three read as
 * completely different objects at a glance.
 */
type PileKind = 'neat' | 'loose' | 'single'

/** five neat, three loose, two single in every ten */
const KIND_MIX: PileKind[] = ['neat', 'loose', 'neat', 'single', 'neat', 'loose', 'neat', 'loose', 'single', 'neat']

interface Placed {
  x: number
  z: number
  spin: number
  ink: ChipInk
  /** how many chips in the pile; 1 is a single chip lying on the felt */
  height: number
  value: number
  kind: PileKind
  /** how far off vertical the whole pile leans, radians */
  lean: number
  /** which way it leans */
  leanDir: number
  /** how far each chip sits off the pile's axis, and where that wander starts */
  wobble: number
  phase: number
  /** how far each chip is turned against the one under it */
  twist: number
}

/**
 * The handful. Chips and dice are laid out TOGETHER from one sequence so they
 * interleave: dealt separately they end up as a clump of chips beside a clump of
 * dice, which is two piles rather than a scatter.
 */
export function pileScatter(chips: number, dice: number, spread: number, seed: number): { chips: Placed[]; dice: Placed[] } {
  const n = chips + dice
  const out: Placed[] = []
  for (let i = 0; i < n; i++) {
    const a = hash(i * 3.7 + seed * 17.1) * Math.PI * 2
    // sqrt keeps the density even out to the edge; without it everything piles
    // into the middle, which is what a raw radius does
    const r = Math.sqrt(hash(i * 5.3 + seed * 23.9)) * spread
    // Mostly neat, a good few loose, a scattering of singles. A table of nothing
    // but tidy stacks looks staged; nothing but loose ones looks swept.
    //
    // Dealt from a fixed PATTERN rather than an independent hash, rotated by the
    // seed. A hash gives singles about one time in six, and the check caught the
    // consequence at once: fourteen piles at one seed came out with no single at
    // all. A pattern guarantees all three kinds inside any ten piles and still
    // deals a different arrangement per seed.
    const kind: PileKind = KIND_MIX[(i + seed) % KIND_MIX.length]
    const tall = hash(i * 13.9 + seed * 47.7)
    out.push({
      x: Math.cos(a) * r,
      z: Math.sin(a) * r * 0.55,
      spin: hash(i * 7.1 + seed * 31.7) * Math.PI * 2,
      // denominations come from the SAME hash as the height, so a tall pile is a
      // low denomination and a short one is a high one, the way a rack works
      ink: CHIP_INKS[Math.floor((1 - tall) * CHIP_INKS.length * 0.999)],
      height: kind === 'single' ? 1 : kind === 'neat' ? 3 + Math.floor(tall * 6) : 2 + Math.floor(tall * 4),
      value: 1 + Math.floor(hash(i * 19.1 + seed * 53.1) * 6),
      kind,
      // a loose pile leans; a neat one barely does; a single lies flat
      lean: kind === 'single' ? 0 : (kind === 'loose' ? 0.05 : 0.012) * (0.4 + hash(i * 37.7 + seed * 67.3)),
      leanDir: hash(i * 41.9 + seed * 71.9) * Math.PI * 2,
      wobble: kind === 'loose' ? 0.02 + 0.05 * hash(i * 43.1 + seed * 79.1) : 0.004 + 0.008 * hash(i * 47.3 + seed * 83.3),
      phase: hash(i * 53.9 + seed * 89.7) * Math.PI * 2,
      twist: kind === 'loose' ? 0.25 + 0.9 * hash(i * 59.1 + seed * 97.1) : 0.05 + 0.35 * hash(i * 61.7 + seed * 101.3),
    })
  }
  return { chips: out.slice(0, chips), dice: out.slice(chips) }
}

/**
 * Drag to place, shift-drag to size, alt-drag to spin.
 *
 * The drag runs on WINDOW listeners rather than on the mesh's own pointer
 * events. r3f's pointer capture did not hold here: the release went through to
 * whatever was under it, so dropping a chip on the resume folder opened the
 * folder. Taking the pointer at the window means nothing else sees the rest of
 * the gesture, and the click that a release generates is swallowed once, in the
 * capture phase, so a drag that ends over something clickable does not also
 * click it.
 *
 * Moving uses the RAY against the felt plane rather than a pixel delta, so the
 * prop stays under the cursor at any camera angle and any distance. A pixel
 * delta slides at a different speed depending on how far away the thing is,
 * which feels broken as soon as the camera is not square on. Size and spin do
 * use pixel deltas, because there is nothing in the world for them to track.
 */
function useDrag(key: string, base: PropTweak, planeY: number, origin: [number, number], onTap?: (event: ThreeEvent<PointerEvent>) => void, allowPlainMove = true) {
  const { camera, gl } = useThree()
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY), [planeY])
  const ray = useMemo(() => new THREE.Raycaster(), [])
  const ndc = useMemo(() => new THREE.Vector2(), [])
  const hit = useMemo(() => new THREE.Vector3(), [])

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const cur = getProp(key) ?? base
    const mode: 'move' | 'size' | 'spin' = e.shiftKey ? 'size' : e.altKey ? 'spin' : 'move'
    const from = { px: e.clientX, py: e.clientY, s: cur.s, r: cur.r }
    let moved = false

    const onMove = (ev: PointerEvent) => {
      // Dice clicks stay clicks even when the pointer drifts across an airborne
      // face. Ctrl-drag explicitly opts into moving the saved table placement.
      if (mode === 'move' && !allowPlainMove && !e.ctrlKey) return
      moved = moved || Math.abs(ev.clientX - from.px) + Math.abs(ev.clientY - from.py) > 3
      if (!moved) return
      if (mode === 'move') {
        const r = gl.domElement.getBoundingClientRect()
        ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -(((ev.clientY - r.top) / r.height) * 2 - 1))
        ray.setFromCamera(ndc, camera)
        if (!ray.ray.intersectPlane(plane, hit)) return
        setProp(key, { x: hit.x - origin[0], z: hit.z - origin[1] }, base)
        return
      }
      if (mode === 'size') {
        setProp(key, { s: Math.min(4, Math.max(0.25, from.s * Math.exp((from.py - ev.clientY) / 220))) }, base)
        return
      }
      setProp(key, { r: from.r + (ev.clientX - from.px) / 90 }, base)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (!moved) {
        if (mode === 'move' && !e.ctrlKey) onTap?.(e)
        return
      }
      // one shot, capture phase: the release that ends a drag must not land as a
      // click on whatever the prop was dropped onto
      const swallow = (ce: MouseEvent) => {
        ce.stopPropagation()
        ce.preventDefault()
        window.removeEventListener('click', swallow, true)
      }
      window.addEventListener('click', swallow, true)
      setTimeout(() => window.removeEventListener('click', swallow, true), 400)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  return { onPointerDown }
}

function ChipStack({ at, size, geo, chipH, drag, kickRef, fx }: { at: Placed; size: number; geo: THREE.BufferGeometry; chipH: number; drag: ReturnType<typeof useDrag>; kickRef: MutableRefObject<((event: ThreeEvent<PointerEvent>) => void) | null>; fx?: MutableRefObject<ImpactFx>; tableMesh?: THREE.Mesh | null }) {
  const mats = useMemo(
    () => [chipWatercolorMaterial(at.ink), chipFaceWatercolorMaterial(at.ink), chipFaceWatercolorMaterial(at.ink)],
    [at.ink],
  )
  const root = useRef<THREE.Group>(null)
  const meshes = useRef<THREE.Mesh[]>([])
  const physics = useContext(ChipPhysics)!
  const homes = useMemo(() => {
    const lean = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(at.leanDir) * at.lean, 0, Math.cos(at.leanDir) * at.lean))
    return Array.from({ length: at.height }, (_, k) => {
      const t = k * 1.7 + at.phase
      const drift = at.wobble * (at.kind === 'loose' ? 1 + k / at.height : 1)
      return {
        position: new THREE.Vector3(Math.sin(t) * drift, chipH / 2 + k * chipH, Math.cos(t * 0.83) * drift).applyQuaternion(lean),
        quaternion: lean.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), at.spin + k * at.twist)),
      }
    })
  }, [at.height, at.lean, at.leanDir, at.phase, at.wobble, at.kind, at.spin, at.twist, chipH])
  useEffect(() => {
    const unregister = physics.register({ root: root.current!, meshes: meshes.current, radius: propChipRadius(chipH / propChipHeight(1)), height: chipH })
    kickRef.current = event => {
      if (!root.current || (fx && fx.current.impactAge < 1.5)) return
      const radius = propChipRadius(chipH / propChipHeight(1)) * root.current.getWorldScale(new THREE.Vector3()).x * 0.85
      physics.impact(event.point, radius, event.ray.direction)
      markPropMotion(1)
    }
    return () => { kickRef.current = null; unregister() }
  }, [homes, chipH, kickRef, fx, physics, size, at.x, at.z])
  useFrame(() => {
    if (!physics.active) homes.forEach((home, i) => {
      if (meshes.current[i]) meshes.current[i].visible = true
      meshes.current[i]?.position.copy(home.position)
      meshes.current[i]?.quaternion.copy(home.quaternion)
    })
  })
  return (
    <group ref={root} position={[at.x, 0, at.z]} scale={size} {...drag} onClick={event => event.stopPropagation()}>
      {/* Initial lean is baked into each body's pose; physics owns it after a click. */}
      {Array.from({ length: at.height }, (_, k) => {
        return (
          <mesh
            key={k}
            ref={mesh => { if (mesh) meshes.current[k] = mesh }}
            name="prop-chip"
            geometry={geo}
            material={mats}
            castShadow
            receiveShadow
            position={homes[k].position}
            quaternion={homes[k].quaternion}
          />
        )
      })}
    </group>
  )
}

/** one chip, with its own place: the scatter's, unless it has been dragged */
function Chip({ at, i, t, y, geo, chipH, fx, tableMesh }: { at: Placed; i: number; t: ReturnType<typeof useTune>; y: number; geo: THREE.BufferGeometry; chipH: number; fx?: MutableRefObject<ImpactFx>; tableMesh?: THREE.Mesh | null }) {
  const key = `chip:${i}`
  // the baked layout first, the scatter for anything it does not name
  const base: PropTweak = PROP_LAYOUT[key] ?? { x: at.x, z: at.z, s: 1, r: at.spin }
  const put = getProp(key) ?? base
  const kickRef = useRef<((event: ThreeEvent<PointerEvent>) => void) | null>(null)
  const drag = useDrag(key, base, y, [t.ttPropX, t.ttPropZ + PROP_LAYOUT_OFFSET_Z], event => kickRef.current?.(event), false)
  const arrival = useRef<THREE.Group>(null)
  useFrame(() => {
    if (!arrival.current) return
    const m = propArrival(fx?.current.impactAge ?? 10, 0.72 + (i % 3) * 0.07)
    arrival.current.visible = m.visible
    // Side lanes leave the hero chip and resume clear. Whole stacks slide flat.
    arrival.current.position.set((put.x < 0 ? -1 : 1) * 9 * m.remaining, 0, (i % 2 ? -0.5 : 0.5) * m.remaining)
  })
  return <group ref={arrival} visible={!fx}><ChipStack at={{ ...at, x: put.x, z: put.z, spin: put.r }} size={t.ttChipS * put.s} geo={geo} chipH={chipH} drag={drag} kickRef={kickRef} fx={fx} tableMesh={tableMesh} /></group>
}

function OneDie({ at, i, t, y, fx }: { at: Placed; i: number; t: ReturnType<typeof useTune>; y: number; fx?: MutableRefObject<ImpactFx> }) {
  const key = `die:${i}`
  const base: PropTweak = PROP_LAYOUT[key] ?? { x: at.x, z: at.z, s: 1, r: at.spin }
  const put = getProp(key) ?? base
  const size = propDieSize(t.chip) * t.ttDiceS * put.s
  const roll = useRef<THREE.Group>(null)
  const generation = useRef(0)
  const playback = useRef<{ physics: Awaited<ReturnType<typeof createInteractiveDie>> | null; loading: boolean; pending: number; age: number; dead: boolean }>({ physics: null, loading: false, pending: 0, age: -1, dead: false })
  const velocity = useRef(new THREE.Vector3())
  const angularVelocity = useRef(new THREE.Vector3())
  const lastRotation = useRef(new THREE.Quaternion())
  const deltaRotation = useRef(new THREE.Quaternion())
  const lastPosition = useRef(new THREE.Vector3())
  const entranceYaw = useMemo(() => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), diceEntranceYaw(i, put.r)), [i, put.r])
  useEffect(() => {
    const state = playback.current
    state.dead = false
    return () => { generation.current++; state.dead = true; state.physics?.dispose(); state.physics = null }
  }, [])
  const drag = useDrag(key, base, y, [t.ttPropX, t.ttPropZ + PROP_LAYOUT_OFFSET_Z], () => {
    const state = playback.current
    if (!roll.current?.visible) return
    if (state.physics) {
      state.physics.kick()
      markPropMotion(1)
      return
    }
    state.pending++
    if (state.loading) return
    state.loading = true
    const ticket = generation.current
    void import('./interactive-die').then(async ({ createInteractiveDie }) => {
      if (state.dead || ticket !== generation.current || !roll.current) return
      const physics = await createInteractiveDie(roll.current.position, roll.current.quaternion, velocity.current, size, angularVelocity.current)
      if (state.dead || ticket !== generation.current) { physics.dispose(); return }
      state.physics = physics
      while (state.pending > 0) { physics.kick(); state.pending-- }
      state.loading = false
      markPropMotion(1)
    }).catch(error => { state.loading = false; console.error('Dice physics could not load', error) })
  }, false)
  useFrame((_, dt) => {
    if (!roll.current) return
    const state = playback.current
    const age = (fx?.current.impactAge ?? 10) - i * 0.06
    if (age < state.age - 0.1) { generation.current++; state.physics?.dispose(); state.physics = null; state.pending = 0; state.loading = false }
    state.age = age
    lastPosition.current.copy(roll.current.position)
    lastRotation.current.copy(roll.current.quaternion)
    if (state.physics) {
      if (state.physics.step(dt, roll.current.position, roll.current.quaternion)) markPropMotion(0.2)
    } else {
      roll.current.visible = bakedDiePose(age, size, i, roll.current.position, roll.current.quaternion)
      roll.current.position.applyQuaternion(entranceYaw)
      roll.current.quaternion.premultiply(entranceYaw)
    }
    if (dt > 0 && dt < 0.1) {
      velocity.current.copy(roll.current.position).sub(lastPosition.current).divideScalar(dt)
      const dq = deltaRotation.current.copy(lastRotation.current).invert().premultiply(roll.current.quaternion).normalize()
      if (dq.w < 0) dq.set(-dq.x, -dq.y, -dq.z, -dq.w)
      const sin = Math.hypot(dq.x, dq.y, dq.z)
      angularVelocity.current.set(dq.x, dq.y, dq.z).multiplyScalar(sin > 1e-6 ? 2 * Math.atan2(sin, dq.w) / (sin * dt) : 0)
    }
  })
  return (
    <group {...drag} onClick={e => e.stopPropagation()} position={[put.x, 0, put.z]} rotation={[0, put.r, 0]}>
      <group ref={roll} visible={!fx}>
      <Die
        value={at.value}
        ink="white"
        pipInk="black"
        size={size}
      />
      </group>
    </group>
  )
}

export default function TitleProps({ y, fx, tableMesh }: { y: number; fx?: MutableRefObject<ImpactFx>; tableMesh?: THREE.Mesh | null }) {
  const t = useTune()
  const physics = useMemo(() => createChipController(() => {
    const tune = getTune()
    tableMesh?.updateWorldMatrix(true, false)
    return { radius: tune.table * 0.41 + tune.rail, chord: tableMesh ? tune.chord - tune.rail : -tune.table, floorY: y - 0.004 - ROOM_FLOOR_DROP,
      matrix: tableMesh?.matrixWorld ?? new THREE.Matrix4().makeRotationX(-Math.PI / 2) }
  }, () => propChipRadius(getTune().chip)), [tableMesh, y])
  useEffect(() => () => physics.dispose(), [physics])
  const root = useRef<THREE.Group>(null)
  const wasLit = useRef(false)
  useFrame((_, dt) => {
    const age = fx?.current.impactAge ?? 10
    if (physics.step(dt, age)) markPropMotion(0.1)
    const flash = impactPropFill(age)
    if (!root.current || (!flash && !wasLit.current)) return
    // The impact threshold otherwise erases these dim side actors. Keep their local
    // fill throughout the radial return, then settle it once every pixel is in colour.
    root.current.traverse(o => {
      const mat = (o as THREE.Mesh).material
      if (!mat) return
      for (const m of Array.isArray(mat) ? mat : [mat]) {
        const u = m.userData.uniforms as Record<string, { value: number }> | undefined
        if (u?.lampAmb) u.lampAmb.value = LAMP.ambient + flash * 0.8
      }
    })
    wasLit.current = flash > 0
  })
  // rebuilt when the chip knob moves, because that knob is what sets the size
  const chipR = propChipRadius(t.chip)
  const chipH = propChipHeight(t.chip)
  const cyl = useMemo(() => new THREE.CylinderGeometry(chipR, chipR, chipH, 40), [chipR, chipH])
  const { chips, dice } = useMemo(
    () => pileScatter(Math.round(t.ttChips), Math.round(t.ttDice), t.ttSpread, Math.round(t.ttSeed)),
    [t.ttChips, t.ttDice, t.ttSpread, t.ttSeed],
  )
  if (!chips.length && !dice.length) return null
  return (
    <ChipPhysics.Provider value={physics}>
    <group ref={root} position={[t.ttPropX, y, t.ttPropZ + PROP_LAYOUT_OFFSET_Z]}>
      {chips.map((c, i) => (
        <Chip key={`c${i}`} at={c} i={i} t={t} y={y} geo={cyl} chipH={chipH} fx={fx} tableMesh={tableMesh} />
      ))}
      {dice.map((d, i) => (
        <OneDie key={`d${i}`} at={d} i={i} t={t} y={y} fx={fx} />
      ))}
    </group>
    </ChipPhysics.Provider>
  )
}
