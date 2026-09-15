import { AnimationClip, NumberKeyframeTrack, Object3D, Quaternion, QuaternionKeyframeTrack, VectorKeyframeTrack, Mesh } from 'three'
import type { MotionTake, PoseSample } from './types'

export function sampleTake(take: MotionTake, time: number): PoseSample {
  const frames = take.frames
  const t = Math.max(0, Math.min(take.duration, time))
  let lo = 0, hi = frames.length - 1
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (frames[mid].time <= t) lo = mid; else hi = mid - 1 }
  const a = frames[lo], b = frames[Math.min(lo + 1, frames.length - 1)]
  const mix = a === b ? 0 : (t - a.time) / (b.time - a.time)
  const bones = Object.fromEntries(Object.keys(a.bones).map(name => [name,
    new Quaternion().fromArray(a.bones[name]).slerp(new Quaternion().fromArray(b.bones[name]), mix).toArray()]))
  const expressions = Object.fromEntries(Object.keys(a.expressions).map(name => [name, a.expressions[name] + (b.expressions[name] - a.expressions[name]) * mix]))
  const scaleNames = new Set([...Object.keys(a.scales ?? {}), ...Object.keys(b.scales ?? {})])
  const scales = Object.fromEntries([...scaleNames].map(name => [name, (a.scales?.[name] ?? [1,1,1]).map((value,i) => value+((b.scales?.[name]?.[i] ?? 1)-value)*mix)]))
  return { time: t, bones, expressions, scales }
}

export function takeClip(take: MotionTake, root: Object3D): AnimationClip {
  const times = take.frames.map(frame => frame.time)
  const tracks: (QuaternionKeyframeTrack | NumberKeyframeTrack | VectorKeyframeTrack)[] = []
  for (const name of Object.keys(take.frames[0].bones)) {
    if (root.getObjectByName(name)) tracks.push(new QuaternionKeyframeTrack(`${name}.quaternion`, times, take.frames.flatMap(frame => frame.bones[name])))
  }
  const scaleNames = new Set(take.frames.flatMap(frame => Object.keys(frame.scales ?? {})))
  for (const name of scaleNames) if (root.getObjectByName(name)) tracks.push(new VectorKeyframeTrack(`${name}.scale`, times, take.frames.flatMap(frame => frame.scales?.[name] ?? [1,1,1])))
  root.traverse(object => {
    const mesh = object as Mesh
    if (!mesh.isMesh || !mesh.morphTargetDictionary) return
    const names = Object.entries(mesh.morphTargetDictionary).sort((a, b) => a[1] - b[1]).map(([name]) => name)
    tracks.push(new NumberKeyframeTrack(`${mesh.name}.morphTargetInfluences`, times,
      take.frames.flatMap(frame => names.map(name => frame.expressions[name] ?? 0))))
  })
  return new AnimationClip(take.name, take.duration, tracks)
}

/** Validate imported files before allocating tracks or applying any transforms. */
export function parseTake(raw: string): MotionTake {
  if (raw.length > 12_000_000) throw new Error('Take is too large (12 MB maximum).')
  const take = JSON.parse(raw) as MotionTake
  if (take?.version !== 1 || !['casino-dealer-v2','casino-dealer-v3'].includes(take.model) || typeof take.name !== 'string' || take.name.length > 100 ||
    !Number.isFinite(take.duration) || take.duration <= 0 || take.duration > 60 || !Array.isArray(take.frames) || take.frames.length < 2 || take.frames.length > 1801) throw new Error('Unsupported motion take.')
  const boneNames = Object.keys(take.frames[0].bones ?? {}), morphNames = Object.keys(take.frames[0].expressions ?? {})
  if (!boneNames.length || boneNames.length > 100 || morphNames.length > 100) throw new Error('Invalid rig tracks.')
  let previous = -1
  for (const frame of take.frames) {
    if (!Number.isFinite(frame.time) || frame.time < 0 || frame.time <= previous || frame.time > take.duration + .001 ||
      !frame.bones || !frame.expressions || Object.keys(frame.bones).length !== boneNames.length || Object.keys(frame.expressions).length !== morphNames.length) throw new Error('Invalid frame timing or tracks.')
    for (const name of boneNames) {
      const q = frame.bones[name]
      if (!Array.isArray(q) || q.length !== 4 || !q.every(Number.isFinite) || Math.abs(Math.hypot(...q) - 1) > .02) throw new Error('Invalid bone rotation.')
    }
    for (const name of morphNames) if (!Number.isFinite(frame.expressions[name]) || frame.expressions[name] < 0 || frame.expressions[name] > 1) throw new Error('Invalid expression.')
    if (frame.scales && (Object.keys(frame.scales).length > 100 || Object.values(frame.scales).some(scale => !Array.isArray(scale) || scale.length !== 3 || scale.some(v => !Number.isFinite(v) || v < .25 || v > 3)))) throw new Error('Invalid bone scale.')
    previous = frame.time
  }
  if (take.frames[0].time !== 0 || Math.abs(previous - take.duration) > .001) throw new Error('Incomplete take.')
  return take
}

export function downloadMotion(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const link = document.createElement('a')
  link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
