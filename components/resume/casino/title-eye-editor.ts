'use client'

import { SceneEditor, transformGesture, type TransformPose } from 'blender-to-threejs'
import { Euler, Quaternion, Vector3, type Object3D } from 'three'
import { getTitleEyes, rememberTitleEyes, setTitleEye, setTitleEyePreview, snapshotTitleEyes } from './title-eye-layout'

export const titleEyeEditor = new SceneEditor()
export interface EyeTransformView {
  camera: Quaternion
  anchor: Quaternion
  halfWidth: number
  halfHeight: number
  height: number
}

/** Compose the library's world/local transforms, then write the authored eye pose. */
export function registerTitleEye(index: number, object: Object3D, view: () => EyeTransformView) {
  let start: ReturnType<typeof snapshotTitleEyes> | null = null
  let poseStart: TransformPose | null = null
  let captured: EyeTransformView | null = null
  return titleEyeEditor.add(`eye:${index}`, object, { name: `Eye ${String(index + 1).padStart(2, '0')}`, transform: {
    onBegin: () => {
      setTitleEyePreview(false)
      start = snapshotTitleEyes()
      const eye = start[index], current = view()
      captured = { ...current, camera: current.camera.clone(), anchor: current.anchor.clone() }
      poseStart = {
        position: new Vector3(),
        quaternion: captured.camera.clone().multiply(new Quaternion().setFromEuler(new Euler(eye.tilt ?? 0, eye.yaw ?? 0, eye.roll))),
        scale: new Vector3(eye.sx ?? 1, eye.sy ?? 1, eye.sz ?? 1).multiplyScalar(eye.size),
      }
    },
    onUpdate: gesture => {
      if (!start || !poseStart || !captured) return
      const eye = start[index]
      const pose = transformGesture(poseStart, gesture, {
        quaternion: captured.camera,
        unitsPerPixel: 2 * captured.halfHeight * (24 - (eye.depth ?? 0)) / 24 / Math.max(1, captured.height),
        moveSnap: 0.1,
      })
      const delta = pose.position.applyQuaternion(captured.anchor.clone().invert())
      const rotation = new Euler().setFromQuaternion(captured.camera.clone().invert().multiply(pose.quaternion), 'XYZ')
      const size = gesture.mode === 'scale' && gesture.axis === null
        ? Math.max(0.02, Math.min(0.6, eye.size * pose.scale.length() / Math.max(1e-9, poseStart.scale.length())))
        : eye.size
      if (gesture.mode === 'move') setTitleEye(index, { x: eye.x + delta.x / captured.halfWidth, y: eye.y + delta.y / captured.halfHeight, depth: (eye.depth ?? 0) + delta.z })
      else if (gesture.mode === 'rotate') setTitleEye(index, { tilt: rotation.x, yaw: rotation.y, roll: rotation.z })
      else setTitleEye(index, { size, sx: pose.scale.x / size, sy: pose.scale.y / size, sz: pose.scale.z / size })
    },
    onCancel: () => {
      if (start) {
        // Explicit identity values also clear fields introduced during this gesture.
        setTitleEye(index, { depth: 0, tilt: 0, yaw: 0, sx: 1, sy: 1, sz: 1, ...start[index] })
      }
      start = null; poseStart = null; captured = null
    },
    onCommit: () => {
      if (start && JSON.stringify(start[index]) !== JSON.stringify(getTitleEyes()[index])) rememberTitleEyes(start)
      start = null; poseStart = null; captured = null
    },
  } })
}
