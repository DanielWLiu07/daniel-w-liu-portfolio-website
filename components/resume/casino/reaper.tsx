'use client'

/**
 * The skeleton dealer (Meshy reaper v2, rigged by Meshy: Mixamo-style bones).
 * Imported per the spec (flat normals, textures ignored, one palette material)
 * and animated on the bones by code, no clips: the flick hand comes out from
 * the cloak, opens palm-up, snaps upward at the flick time, then settles.
 * The hand's world position is published every frame so the chip can wait in
 * the palm (hero-chip flick.fromRef).
 */
import { useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import { characterMaterial } from './materials'

export const REAPER_RIGGED_URL = '/models/casino-reaper-v2-rigged.glb'

const cl = (x: number) => Math.min(1, Math.max(0, x))
const ease = (u: number) => u * u * (3 - 2 * u)

interface ArmBones {
  upper: THREE.Bone
  fore: THREE.Bone
  hand: THREE.Bone
  bind: { upper: THREE.Quaternion; fore: THREE.Quaternion; hand: THREE.Quaternion }
  /** the other arm, tucked behind the back so it never enters the frame */
  other?: { upper: THREE.Bone; bind: THREE.Quaternion }
}

/** rotate a bone about a WORLD axis on top of its bind rotation */
function rotateWorld(bone: THREE.Bone, bind: THREE.Quaternion, axis: THREE.Vector3, angle: number, tmpQ: THREE.Quaternion, tmpP: THREE.Quaternion) {
  const parent = bone.parent
  if (!parent) return
  parent.getWorldQuaternion(tmpP)
  // local = inv(parentWorld) * R_world * parentWorld * bind
  tmpQ.setFromAxisAngle(axis, angle)
  bone.quaternion.copy(tmpP).invert().multiply(tmpQ).multiply(tmpP).multiply(bind)
}

/** keep only triangles whose vertices are dominantly skinned to the arm bones of `side` (Arm, ForeArm, Hand and fingers) */
function armTriangles(geo: THREE.BufferGeometry, skeleton: THREE.Skeleton, side: 'Left' | 'Right'): THREE.BufferGeometry {
  const keep = new Set<number>()
  skeleton.bones.forEach((b, i) => {
    if (b.name.startsWith(side) && /Arm|ForeArm|Hand/.test(b.name)) keep.add(i)
  })
  const si = geo.getAttribute('skinIndex') as THREE.BufferAttribute
  const sw = geo.getAttribute('skinWeight') as THREE.BufferAttribute
  const n = geo.getAttribute('position').count
  const vertexKept = new Uint8Array(n)
  for (let v = 0; v < n; v++) {
    let best = 0, bestW = -1
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(v, k)
      if (w > bestW) { bestW = w; best = si.getComponent(v, k) }
    }
    vertexKept[v] = keep.has(best) ? 1 : 0
  }
  const tris: number[] = []
  for (let t = 0; t < n; t += 3) {
    if (vertexKept[t] + vertexKept[t + 1] + vertexKept[t + 2] >= 2) tris.push(t, t + 1, t + 2)
  }
  const out = new THREE.BufferGeometry()
  for (const name of Object.keys(geo.attributes)) {
    const a = geo.getAttribute(name) as THREE.BufferAttribute
    const arr = new (a.array.constructor as new (n: number) => typeof a.array)(tris.length * a.itemSize)
    for (let i = 0; i < tris.length; i++) for (let c = 0; c < a.itemSize; c++) arr[i * a.itemSize + c] = a.array[tris[i] * a.itemSize + c]
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize, a.normalized))
  }
  return out
}

/** the flick arm pose: out = hand come out (0..1), snap = wrist flick impulse; other arm tucked behind */
function poseArm(a: ArmBones, X: THREE.Vector3, out: number, snap: number, q: THREE.Quaternion, p: THREE.Quaternion, armOnly = false) {
  if (armOnly) {
    // arm-only staging: the arm lies HORIZONTAL (a quarter turn from hanging), sleeve trailing off the frame
    // edge, forearm straight, palm up; the flick is an upward wrist snap (positive here: the arm hangs
    // backward relative to facing on this rig, so the sign flips)
    rotateWorld(a.upper, a.bind.upper, X, -1.62 * out + 0.04 * snap, q, p)
    rotateWorld(a.fore, a.bind.fore, X, -0.12 * out + 0.22 * snap, q, p)
    rotateWorld(a.hand, a.bind.hand, X, -0.2 * out + 0.55 * snap, q, p)
    return
  }
  // upper arm: swings forward (negative lifts a hanging arm forward)
  rotateWorld(a.upper, a.bind.upper, X, -1.25 * out - 0.12 * snap, q, p)
  // forearm: straightens as the hand comes out (long reach), then whips up
  rotateWorld(a.fore, a.bind.fore, X, -0.45 * out - 0.75 * snap, q, p)
  // hand: palm up, then the wrist flick
  rotateWorld(a.hand, a.bind.hand, X, -0.35 * out - 0.7 * snap, q, p)
  // the other arm hangs as bound (in the arm-only staging it is not even built)
  void a.other
}

export default function Reaper({
  position = [0, 0, -3.2],
  height = 2.6,
  yaw = 0,
  flickAt = 1.0,
  handRef,
  clock0,
  slide = 0,
  exitAfter = 0.7,
  clipScreenX,
  handTarget,
  armOnly = false,
  side = 'Left',
}: {
  position?: [number, number, number]
  height?: number
  yaw?: number
  /** seconds (on the chip's clock) when the wrist snaps */
  flickAt?: number
  /** written every frame: the flick hand's world position */
  handRef?: MutableRefObject<[number, number, number]>
  /** shared start time (clock.elapsedTime) so the arm and the chip agree; -1 = not started */
  clock0?: MutableRefObject<number>
  /**
   * "hand only": park him out of frame at `position` and slide him this far along his facing while
   * the hand comes out (so only hand and sleeve enter), then back out `exitAfter` seconds after the flick
   */
  slide?: number
  exitAfter?: number
  /** hand-only staging: nothing of him is drawn right of this screen fraction (Window-coordinate cutout in the graph) */
  clipScreenX?: number
  /**
   * world point the raised hand must reach at full "out"; his position is SOLVED from it (measured once from
   * the raised pose), so staging is written as "hand here", not as body coordinates
   */
  handTarget?: [number, number, number]
  /** hand-only staging: keep only the triangles skinned to the flick arm (sleeve + hand); the body is never built */
  armOnly?: boolean
  /** which arm flicks */
  side?: 'Left' | 'Right'
}) {
  const { scene } = useGLTF(REAPER_RIGGED_URL)
  const paper = useMemo(() => characterMaterial({ clipScreenX }), [clipScreenX])
  const model = useMemo(() => {
    const root = cloneSkinned(scene)
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return
      let flat = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()
      if (armOnly && (o as THREE.SkinnedMesh).isSkinnedMesh) flat = armTriangles(flat, (o as THREE.SkinnedMesh).skeleton, side)
      flat.computeVertexNormals()
      o.geometry = flat
      o.material = paper
      o.frustumCulled = false
    })
    return root
  }, [scene, paper, armOnly, side])

  const arm = useRef<ArmBones | null>(null)
  const groupRef = useRef<THREE.Group>(null)
  // solved group position for out = 1 (hand on target); null = use `position` as given
  const base = useRef<THREE.Vector3 | null>(null)
  const tmp = useRef({ q: new THREE.Quaternion(), p: new THREE.Quaternion(), v: new THREE.Vector3(), X: new THREE.Vector3(1, 0, 0), F: new THREE.Vector3(0, 0, 1), gq: new THREE.Quaternion() })

  useLayoutEffect(() => {
    // normalise in the model's own frame (setFromObject is world-space; subtract the parent's offset)
    // SKINNED (Meshy / Mixamo convention): the mesh node sits under a 0.01-scaled Armature with bones in
    // centimetres, and the geometry itself is authored in metres. At render the bones reproduce the
    // geometry exactly, so the character's world extent IS the geometry's own bounding box (in metres),
    // independent of the mesh node's transform. Box3.setFromObject (plain or precise) gets this wrong.
    const geoBox = new THREE.Box3()
    model.traverse((o) => {
      if (!(o as THREE.SkinnedMesh).isSkinnedMesh) return
      const g = (o as THREE.Mesh).geometry
      g.computeBoundingBox()
      if (g.boundingBox) geoBox.union(g.boundingBox)
    })
    const size = new THREE.Vector3()
    geoBox.getSize(size)
    const s = height / (size.y || 1)
    const c = new THREE.Vector3()
    geoBox.getCenter(c)
    model.scale.setScalar(s)
    model.position.set(-c.x * s, -geoBox.min.y * s, -c.z * s)
    model.updateWorldMatrix(true, true)
    // the flick arm is whichever hand sits on the viewer's right (+x)
    const pick = (side: 'Left' | 'Right') => {
      const upper = model.getObjectByName(`${side}Arm`) as THREE.Bone | undefined
      const fore = model.getObjectByName(`${side}ForeArm`) as THREE.Bone | undefined
      const hand = model.getObjectByName(`${side}Hand`) as THREE.Bone | undefined
      return upper && fore && hand ? { upper, fore, hand } : null
    }
    const chosen = pick(side)
    const otherArm = pick(side === 'Left' ? 'Right' : 'Left')
    arm.current = chosen
      ? {
          ...chosen,
          bind: { upper: chosen.upper.quaternion.clone(), fore: chosen.fore.quaternion.clone(), hand: chosen.hand.quaternion.clone() },
          other: otherArm ? { upper: otherArm.upper, bind: otherArm.upper.quaternion.clone() } : undefined,
        }
      : null
    // solve his position from the hand target: pose the raised arm once, measure the hand relative to the
    // group origin, and place the group so the hand lands on the target
    base.current = null
    const grp = groupRef.current
    if (arm.current && grp && handTarget) {
      const { q, p, X, gq } = tmp.current
      grp.position.set(0, 0, 0)
      grp.updateWorldMatrix(true, true)
      grp.getWorldQuaternion(gq)
      X.set(1, 0, 0).applyQuaternion(gq)
      poseArm(arm.current, X, 1, 0, q, p, armOnly)
      model.updateWorldMatrix(true, true)
      const h = arm.current.hand.getWorldPosition(new THREE.Vector3())
      base.current = new THREE.Vector3(handTarget[0] - h.x, handTarget[1] - h.y, handTarget[2] - h.z)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, height, side, armOnly, handTarget?.[0], handTarget?.[1], handTarget?.[2]])

  useFrame(({ clock }) => {
    const a = arm.current
    if (!a) return
    const t0 = clock0?.current ?? -1
    const te = t0 >= 0 ? clock.elapsedTime - t0 : 0
    const { q, p, v, X, F, gq } = tmp.current
    // hand comes out: 0.75 s before the flick the arm swings forward and up (palm up), holds, snaps, settles;
    // exitAfter seconds after the flick it withdraws (only meaningful with slide)
    const outIn = ease(cl((te - (flickAt - 0.75)) / 0.55))
    const back = slide > 0 ? ease(cl((te - (flickAt + exitAfter)) / 0.8)) : 0
    const out = outIn * (1 - back)
    const snapT = te - flickAt
    const snap = snapT >= 0 ? Math.sin(Math.min(snapT / 0.12, 1) * Math.PI * 0.5) * Math.exp(-Math.max(0, snapT - 0.12) * 4) : 0
    // arm axes follow his facing: "forward/up" is a rotation about his own right axis (world x at yaw 0)
    const grp = groupRef.current
    if (grp) {
      grp.getWorldQuaternion(gq)
      X.set(1, 0, 0).applyQuaternion(gq)
      F.set(0, 0, 1).applyQuaternion(gq)
      // slide in along his facing while the hand comes out, back out afterwards; the "in" spot is the
      // solved base (hand on target) when a handTarget was given
      const b = base.current
      const bx = b ? b.x : position[0] + F.x * slide
      const by = b ? b.y : position[1]
      const bz = b ? b.z : position[2] + F.z * slide
      // body staging slides in along his facing; arm-only staging slides in from the sleeve side (the arm
      // hangs backward relative to facing on this rig, so the sleeve trails toward +F)
      const dir = armOnly ? 1 : -1
      grp.position.set(bx + dir * F.x * slide * (1 - out), by, bz + dir * F.z * slide * (1 - out))
    }
    // arm-only staging: the arm stays raised, the entrance is the slide from the frame edge
    poseArm(a, X, armOnly ? 1 : out, snap, q, p, armOnly)
    model.updateWorldMatrix(true, true)
    if (handRef) {
      a.hand.getWorldPosition(v)
      handRef.current[0] = v.x
      handRef.current[1] = v.y + 0.12
      handRef.current[2] = v.z + 0.1
    }
  }, -1)

  return (
    <group ref={groupRef} position={position} rotation={[0, yaw, 0]}>
      <primitive object={model} />
    </group>
  )
}

useGLTF.preload(REAPER_RIGGED_URL)
