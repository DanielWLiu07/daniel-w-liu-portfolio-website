'use client'

import { useEffect, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import { transformGesture, type TransformPose } from 'blender-to-threejs'
import * as THREE from 'three'
import { PANEL_EDIT_EVENT } from '@/components/panels/panel-events'
import { flightEditor } from './flight-editor'
import { getTune, popUndo, pushUndo, setTune, TUNE_RANGES, type Tune } from './tune'

type Fields = Record<'x' | 'y' | 'depth' | 'size' | 'sx' | 'sy' | 'sz' | 'tilt' | 'yaw' | 'bank', keyof Tune>

/** Store-backed prop transforms, sharing the flight editor's single input owner. */
export function useFlightTransform(id: string, name: string, ref: RefObject<THREE.Group | null>, fields: Fields) {
  const { camera, gl } = useThree()
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('flight') || !ref.current) return
    const keys = Object.values(fields)
    let start: Tune | null = null
    let poseStart: TransformPose | null = null
    const cameraOrientation = new THREE.Quaternion()
    let halfH = 1, halfW = 1, unitsPerPixel = 1
    const apply = (patch: Partial<Tune>) => {
      setTune(patch)
      window.dispatchEvent(new Event(PANEL_EDIT_EVENT))
    }
    const clamp = (key: keyof Tune, value: number) => {
      const [min, max] = TUNE_RANGES[key]
      return Math.min(max, Math.max(min, value))
    }
    return flightEditor.add(id, ref.current, { name, transform: {
      enabled: () => ref.current?.visible === true,
      onBegin: () => {
        start = { ...getTune() }
        const t = start
        camera.getWorldQuaternion(cameraOrientation)
        const pc = camera as THREE.PerspectiveCamera
        halfH = Math.tan(THREE.MathUtils.degToRad(pc.fov) / 2) * 11
        halfW = halfH * pc.aspect
        unitsPerPixel = 2 * halfH * (11 - t[fields.depth]) / 11 / Math.max(1, gl.domElement.clientHeight)
        poseStart = {
          position: new THREE.Vector3(),
          quaternion: cameraOrientation.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(t[fields.tilt], t[fields.yaw], t[fields.bank]))),
          scale: new THREE.Vector3(t[fields.sx], t[fields.sy], t[fields.sz]).multiplyScalar(t[fields.size]),
        }
        pushUndo(keys)
      },
      onUpdate: gesture => {
        if (!start || !poseStart) return
        const pose = transformGesture(poseStart, gesture, { quaternion: cameraOrientation, unitsPerPixel })
        const inverse = cameraOrientation.clone().invert()
        const delta = pose.position.applyQuaternion(inverse)
        const rotation = new THREE.Euler().setFromQuaternion(inverse.multiply(pose.quaternion), 'XYZ')
        const size = gesture.mode === 'scale' && gesture.axis === null
          ? clamp(fields.size, Math.abs(start[fields.size] * (gesture.exact ?? gesture.scale ?? 1))) : start[fields.size]
        apply({
          [fields.x]: clamp(fields.x, start[fields.x] + delta.x / halfW),
          [fields.y]: clamp(fields.y, start[fields.y] + delta.y / halfH),
          [fields.depth]: clamp(fields.depth, start[fields.depth] + delta.z),
          [fields.size]: size,
          [fields.sx]: clamp(fields.sx, pose.scale.x / size),
          [fields.sy]: clamp(fields.sy, pose.scale.y / size),
          [fields.sz]: clamp(fields.sz, pose.scale.z / size),
          [fields.tilt]: rotation.x, [fields.yaw]: rotation.y, [fields.bank]: rotation.z,
        })
      },
      onCancel: () => {
        if (start) { apply(Object.fromEntries(keys.map(key => [key, start![key]]))); popUndo() }
        start = null; poseStart = null
      },
      onCommit: () => { start = null; poseStart = null },
    } })
  }, [camera, gl, id, name, ref, fields])
}
