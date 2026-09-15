import { Quaternion, Vector3 } from 'three'
import bake from './dice-baked.json'

/** Deterministic impact choreography: no integration drift on replay or slow frames. */
export function propArrival(age: number, duration: number) {
  const u = Math.max(0, Math.min(1, age / duration))
  return { visible: age >= 0, remaining: Math.pow(1 - u, 3) }
}

const nextRotation = new Quaternion()
let movingUntil = 0
export const propsAreMoving = () => performance.now() < movingUntil
export const markPropMotion = (seconds: number) => { movingUntil = Math.max(movingUntil, performance.now() + (seconds + 0.1) * 1000) }
export const diceEntranceDuration = (variant: number) => (bake.clips[variant % bake.clips.length].length - 1) / bake.fps
export function diceEntranceYaw(variant: number, parentYaw: number) {
  const start = bake.clips[variant % bake.clips.length][0]
  const current = Math.atan2(-start[2], start[0])
  return (variant % 2 === 0 ? Math.PI : 0) - parentYaw - current
}

export function sampleDieClip(clip: number[][], age: number, size: number, position: Vector3, rotation: Quaternion) {
  const frame = Math.max(0, Math.min(clip.length - 1, age * bake.fps))
  const i = Math.floor(frame)
  const a = clip[i], b = clip[Math.min(i + 1, clip.length - 1)]
  const mix = frame - i
  position.set(
    (a[0] + (b[0] - a[0]) * mix) * size,
    (a[1] + (b[1] - a[1]) * mix) * size,
    (a[2] + (b[2] - a[2]) * mix) * size,
  )
  rotation.set(a[3], a[4], a[5], a[6]).normalize()
  nextRotation.set(b[3], b[4], b[5], b[6]).normalize()
  rotation.slerp(nextRotation, mix)
}

/** Playback only: positions lerp and orientations slerp between recorded physics steps.
 * Size scales the normalized clip; saved placement/yaw remain on the parent group.
 */
export function bakedDiePose(age: number, size: number, variant: number, position: Vector3, rotation: Quaternion) {
  const clip = bake.clips[variant % bake.clips.length]
  sampleDieClip(clip, age, size, position, rotation)
  return age >= 0
}
