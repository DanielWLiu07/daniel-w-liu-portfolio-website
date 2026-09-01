'use client'

/**
 * The roulette wheel in the scene: geometry, materials, and the frame loop.
 *
 * All of the wheel's KNOWLEDGE lives in roulette.ts, which knows nothing about
 * three and is asserted by scripts/check-roulette.ts. This file turns that into
 * something you can look at, the same split the card set uses.
 *
 * The head spins, the bowl does not. That is the whole reason the two are
 * separate objects here rather than one wheel: a roulette wheel that turns as a
 * single piece, ball track and all, is the thing that makes an animation read
 * as a toy.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { solidWatercolorMaterial, type ChipInk } from './materials'
import {
  DIMS,
  POCKETS,
  POCKET_ARC,
  WHEEL_ORDER,
  cycleAt,
  pocketAngle,
  pocketColour,
  spinAt,
  type SpinOptions,
} from './roulette'

const MESHY_WHEEL = '/models/roulette-wheel-meshy.glb'

/** concatenate non indexed parts into one geometry, one material group each */
function joinGroups(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry()
  const counts = parts.map((p) => (p.getAttribute('position') as THREE.BufferAttribute).count)
  const total = counts.reduce((a, b) => a + b, 0)
  const pos = new Float32Array(total * 3)
  const nrm = new Float32Array(total * 3)
  let v = 0
  parts.forEach((p, i) => {
    const P = p.getAttribute('position') as THREE.BufferAttribute
    const N = p.getAttribute('normal') as THREE.BufferAttribute
    pos.set(P.array as Float32Array, v * 3)
    nrm.set(N.array as Float32Array, v * 3)
    out.addGroup(v, counts[i], i)
    v += counts[i]
  })
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
  out.computeBoundingBox()
  out.computeBoundingSphere()
  return out
}

/**
 * The bowl, as one revolve.
 *
 * A lathe is the right tool for this: the outer rim, the banked ball track and
 * the apron the ball falls down are all one profile turned about the centre, and
 * describing them as a profile is describing the actual object. Building them as
 * separate rings would leave seams exactly where the ball runs.
 */
function bowlGeometry(): THREE.BufferGeometry {
  const D = DIMS
  const profile: [number, number][] = [
    [0, -0.09],
    [D.bowl, -0.09],
    [D.bowl, D.wall],
    [D.bowl - 0.02, D.wall],
    [D.bowl - 0.06, D.wall * 0.65],
    // the ball track: a shallow GROOVE, not a point on a slope. Run as one
    // straight ramp from the rim to the apron and the track has no shelf, so
    // the ball reads as sliding down a cone rather than running a rim.
    [D.track + 0.035, D.wall * 0.5],
    [D.track + 0.012, D.wall * 0.44],
    [D.track, D.wall * 0.435],
    [D.track - 0.022, D.wall * 0.47],
    [D.track - 0.05, D.wall * 0.44],
    // the apron, sloping in and down to the head
    [D.deflector, 0.004],
    [D.head + 0.012, D.floor],
    // under the pocket ring, not up to it. Ending outside the head left a
    // 0.006 slot with a step behind it, and the felt showed through as a green
    // ring around the pockets.
    [D.head - 0.02, D.floor - 0.004],
    [D.head - 0.02, D.floor - 0.018],
  ]
  const g = new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 96)
  g.computeVertexNormals()
  return g.toNonIndexed()
}

/**
 * The wheel head: 37 pocket floors in three colours, the frets between them, and
 * the cone at the middle. Groups: 0 red, 1 black, 2 green, 3 metal.
 *
 * Merged by COLOUR rather than drawn per pocket, so a 37 pocket wheel is four
 * draw calls instead of seventy four.
 */
function headGeometry(): THREE.BufferGeometry {
  const D = DIMS
  const byColour: Record<string, THREE.BufferGeometry[]> = { red: [], black: [], green: [] }
  const metal: THREE.BufferGeometry[] = []

  for (let i = 0; i < POCKETS; i++) {
    const colour = pocketColour(WHEEL_ORDER[i])
    // the floor of one pocket, a sector of the ring, inset a hair either side so
    // the fret sits in a gap rather than on top of the colour
    // the colour runs almost to the fret. A wide inset left a dark gutter down
    // both sides of every fret, which is what turned a thin divider into a wall
    // with a shadow either side of it.
    const a0 = pocketAngle(i) - POCKET_ARC / 2 + 0.003
    const sector = new THREE.RingGeometry(D.hub, D.head, 3, 1, a0, POCKET_ARC - 0.006)
    sector.rotateX(-Math.PI / 2)
    sector.translate(0, D.floor, 0)
    byColour[colour].push(sector.toNonIndexed())

    // the fret on the boundary between this pocket and the next
    const fret = new THREE.BoxGeometry(D.head - D.hub, D.fret, 0.0055)
    fret.translate((D.head + D.hub) / 2, D.floor + D.fret / 2, 0)
    fret.rotateY(-(pocketAngle(i) + POCKET_ARC / 2))
    metal.push(fret.toNonIndexed())
  }

  // the cone at the middle, and the turret standing out of it
  const cone = new THREE.CylinderGeometry(D.hub * 0.34, D.hub, 0.09, 48)
  cone.translate(0, D.floor + 0.045, 0)
  metal.push(cone.toNonIndexed())
  const spindle = new THREE.CylinderGeometry(0.02, 0.046, 0.19, 24)
  spindle.translate(0, D.floor + 0.09 + 0.095, 0)
  metal.push(spindle.toNonIndexed())
  const knob = new THREE.SphereGeometry(0.038, 20, 14)
  knob.translate(0, D.floor + 0.3, 0)
  metal.push(knob.toNonIndexed())
  // the four armed cross handle a real turret carries
  for (const rot of [0, Math.PI / 2]) {
    const arm = new THREE.CylinderGeometry(0.016, 0.016, 0.3, 12)
    arm.rotateZ(Math.PI / 2)
    arm.rotateY(rot)
    arm.translate(0, D.floor + 0.255, 0)
    metal.push(arm.toNonIndexed())
  }

  const parts = [
    mergeAll(byColour.red),
    mergeAll(byColour.black),
    mergeAll(byColour.green),
    mergeAll(metal),
  ]
  return joinGroups(parts)
}

function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const counts = parts.map((p) => (p.getAttribute('position') as THREE.BufferAttribute).count)
  const total = counts.reduce((a, b) => a + b, 0)
  const pos = new Float32Array(total * 3)
  const nrm = new Float32Array(total * 3)
  let v = 0
  parts.forEach((p, i) => {
    pos.set((p.getAttribute('position') as THREE.BufferAttribute).array as Float32Array, v * 3)
    nrm.set((p.getAttribute('normal') as THREE.BufferAttribute).array as Float32Array, v * 3)
    v += counts[i]
  })
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
  return g
}

/** the eight diamond deflectors on the apron, merged into one */
function deflectorGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < DIMS.deflectors; i++) {
    const a = (i / DIMS.deflectors) * Math.PI * 2 + Math.PI / DIMS.deflectors
    const d = new THREE.OctahedronGeometry(0.038, 0)
    d.scale(1, 0.55, 0.8)
    d.translate(DIMS.deflector, 0.012, 0)
    d.rotateY(-a)
    parts.push(d.toNonIndexed())
  }
  return mergeAll(parts)
}

/**
 * The Meshy wheel, SPLIT by radius so its head can turn.
 *
 * It arrives as one mesh, which is fine for a static prop and useless for this:
 * a wheel whose bowl turns with its head is the exact thing the procedural
 * version exists to avoid. Splitting on the radius of each triangle's centroid
 * is deterministic and needs nothing from the generator, and the seam lands on
 * the apron where the two are meant to meet anyway.
 */
function splitMeshy(src: THREE.BufferGeometry, at: number) {
  const g = src.index ? src.toNonIndexed() : src.clone()
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute
  const inner: number[] = [], outer: number[] = []
  const iN: number[] = [], oN: number[] = []
  for (let t = 0; t < pos.count; t += 3) {
    let r = 0
    for (let k = 0; k < 3; k++) r += Math.hypot(pos.getX(t + k), pos.getZ(t + k)) / 3
    const to = r < at ? inner : outer
    const tn = r < at ? iN : oN
    for (let k = 0; k < 3; k++) {
      to.push(pos.getX(t + k), pos.getY(t + k), pos.getZ(t + k))
      tn.push(nrm.getX(t + k), nrm.getY(t + k), nrm.getZ(t + k))
    }
  }
  const make = (p: number[], n: number[]) => {
    const b = new THREE.BufferGeometry()
    b.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3))
    b.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n), 3))
    b.computeBoundingBox()
    b.computeBoundingSphere()
    return b
  }
  /**
   * Where this mesh's pockets actually are, measured off it.
   *
   * The ball's path comes from DIMS, and the generator had no idea what DIMS
   * says, so its pocket floor is at its own height and the ball was settling
   * inside the geometry. Taking the highest point in the pocket ring BAND, not
   * the head's bounding box, is what avoids the turret: the turret is the tallest
   * thing on the head by a long way and its top is not a floor.
   */
  let pocketTop = -Infinity
  for (let i = 0; i < inner.length; i += 3) {
    const r = Math.hypot(inner[i], inner[i + 2])
    if (r > DIMS.hub && r < DIMS.head && inner[i + 1] > pocketTop) pocketTop = inner[i + 1]
  }
  return { head: make(inner, iN), bowl: make(outer, oN), pocketTop: Number.isFinite(pocketTop) ? pocketTop : DIMS.floor }
}

function useMeshyWheel() {
  const { scene } = useGLTF(MESHY_WHEEL)
  return useMemo(() => {
    let found: THREE.BufferGeometry | null = null
    scene.updateWorldMatrix(true, true)
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh || found) return
      const g = m.geometry.clone()
      g.applyMatrix4(m.matrixWorld)
      g.computeBoundingBox()
      const b = g.boundingBox as THREE.Box3
      const size = b.getSize(new THREE.Vector3())
      const c = b.getCenter(new THREE.Vector3())
      g.translate(-c.x, -c.y, -c.z)
      // lay it flat by finding the THIN axis rather than assuming one, the same
      // way the chip does: this mesh comes out thin along Z, not Y
      const thin = size.x < size.y && size.x < size.z ? 'x' : size.z < size.y ? 'z' : 'y'
      if (thin === 'z') g.rotateX(-Math.PI / 2)
      else if (thin === 'x') g.rotateZ(Math.PI / 2)
      g.computeBoundingBox()
      const laid = (g.boundingBox as THREE.Box3).getSize(new THREE.Vector3())
      // scale so the DIAMETER matches the procedural wheel, so the ball's path,
      // which is computed from DIMS, still lands on this one's pockets
      const k = (DIMS.bowl * 2) / Math.max(laid.x, laid.z)
      g.scale(k, k, k)
      g.computeVertexNormals()
      g.computeBoundingBox()
      const box = g.boundingBox as THREE.Box3
      g.translate(0, -box.min.y - 0.09, 0)
      found = g
    })
    return found ? splitMeshy(found, DIMS.head + 0.02) : null
  }, [scene])
}

export interface RouletteProps extends SpinOptions {
  position?: [number, number, number]
  /** bowl radius in world units */
  size?: number
  /** use the generated wheel instead of the drawn one */
  mesh?: boolean
  paused?: boolean
  /** hold the spin at this point of the cycle, 0 to 1, instead of running it */
  scrub?: number
  /** called when a spin settles with the winning number, and with null when the next one is under way */
  onResult?: (n: number | null) => void
}

export default function Roulette({
  position = [0, 0, 0],
  size = 1.15,
  mesh = false,
  paused = false,
  scrub,
  onResult,
  ...spin
}: RouletteProps) {
  const bowl = useMemo(() => bowlGeometry(), [])
  const seat = useMemo(() => {
    // the ring the frets seat into. The bowl and the black pockets are the same
    // ink, so without it the pocket ring has no outer edge at all wherever a
    // black pocket meets the bowl.
    const g = new THREE.TorusGeometry(DIMS.head - 0.004, 0.007, 8, 96)
    g.rotateX(Math.PI / 2)
    g.translate(0, DIMS.floor + 0.004, 0)
    return g
  }, [])
  const rim = useMemo(() => {
    const g = new THREE.TorusGeometry(DIMS.bowl - 0.012, 0.016, 10, 96)
    g.rotateX(Math.PI / 2)
    g.translate(0, DIMS.wall, 0)
    return g
  }, [])
  const head = useMemo(() => headGeometry(), [])
  const diamonds = useMemo(() => deflectorGeometry(), [])
  const meshy = useMeshyWheel()
  const useMesh = mesh && meshy !== null

  const mats = useMemo(() => {
    const m = (ink: ChipInk, key: string) => solidWatercolorMaterial(ink, key)
    return {
      /**
       * Black bowl, brass rim.
       *
       * The bowl and the black pockets started as the same ink, which lost half
       * the wheel's pockets in the thing holding them. The palette's nearest
       * brown is its orange, and a whole bowl of it reads as a pumpkin rather
       * than as mahogany. A brass ring on the rim is what separates them on a
       * real wheel anyway, and it costs one torus.
       */
      bowl: m('black', 'rouletteBowl'),
      head: [m('red', 'roulettePocketRed'), m('black', 'roulettePocketBlack'), m('green', 'roulettePocketGreen'), m('gold', 'rouletteMetal')] as THREE.Material[],
      metal: m('gold', 'rouletteMetal'),
      ball: m('white', 'rouletteBall'),
    }
  }, [])

  const headRef = useRef<THREE.Group>(null)
  const ballRef = useRef<THREE.Mesh>(null)
  const clock = useRef(0)
  const lastResult = useRef<number | null>(null)

  useEffect(
    () => () => {
      bowl.dispose()
      head.dispose()
      diamonds.dispose()
      rim.dispose()
      seat.dispose()
    },
    [bowl, head, diamonds, rim, seat],
  )

  useFrame((_, dt) => {
    // clamped: a backgrounded tab hands back one enormous delta, and a wheel
    // that teleports through half a spin on return reads as a bug
    if (!paused) clock.current += Math.min(dt, 1 / 20)
    const period = spin.period ?? 15
    const t = scrub !== undefined ? scrub * period : clock.current
    const c = scrub !== undefined ? { cycle: 0, t } : cycleAt(t, spin)
    const s = spinAt(c.t, c.cycle, spin)

    if (headRef.current) headRef.current.rotation.y = s.wheel
    if (ballRef.current) {
      // the generated wheel's pockets are not at DIMS.floor, so the settled
      // height is lifted onto whatever that mesh's pocket floor measured at
      const lift = useMesh ? (meshy as { pocketTop: number }).pocketTop - DIMS.floor : 0
      const seated = s.phase === 'track' ? 0 : s.phase === 'settled' ? 1 : (s.ballHeight - DIMS.floor) < 0.05 ? 1 : 0
      // local to the lifted group, so no scale and no base offset here
      ballRef.current.position.set(
        Math.cos(s.ballAngle) * s.ballRadius,
        s.ballHeight + lift * seated,
        Math.sin(s.ballAngle) * s.ballRadius,
      )
    }
    // fires on EVERY change, null included. Reporting only the number left the
    // readout holding the last spin's result all the way through the next spin,
    // so the wheel said 6 black while the ball was still going round.
    if (s.result !== lastResult.current) {
      lastResult.current = s.result
      onResult?.(s.result)
    }
  })

  return (
    // lifted so the bowl's underside sits at the caller's y. Without it the
    // pocket floor is below the table and the felt draws over the pockets.
    <group position={position} scale={size}>
      <group position={[0, -DIMS.base, 0]}>
      {useMesh ? (
        <>
          <mesh geometry={(meshy as { bowl: THREE.BufferGeometry }).bowl} material={mats.bowl} castShadow receiveShadow />
          <group ref={headRef}>
            <mesh geometry={(meshy as { head: THREE.BufferGeometry }).head} material={mats.metal} castShadow receiveShadow />
          </group>
        </>
      ) : (
        <>
          <mesh geometry={bowl} material={mats.bowl} castShadow receiveShadow />
          <mesh geometry={rim} material={mats.metal} castShadow receiveShadow />
          <mesh geometry={diamonds} material={mats.metal} castShadow receiveShadow />
          <group ref={headRef}>
            <mesh geometry={head} material={mats.head} castShadow receiveShadow />
            <mesh geometry={seat} material={mats.metal} castShadow receiveShadow />
          </group>
        </>
      )}
      <mesh ref={ballRef} material={mats.ball} castShadow>
        <sphereGeometry args={[DIMS.ball, 20, 14]} />
      </mesh>
      </group>
    </group>
  )
}

useGLTF.preload(MESHY_WHEEL)
