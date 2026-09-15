'use client'

import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { transformGesture, type TransformPose } from 'blender-to-threejs'
import * as THREE from 'three'
import { PANEL_EDIT_EVENT } from '@/components/panels/panel-events'
import Roulette from './roulette-wheel'
import FlightCallout, { placeFlightCallout } from './flight-callout'
import { flightEditor } from './flight-editor'
import { beatTime, getTune, popUndo, pushUndo, setTune, TUNE_RANGES, undoTune, useTune, type Tune } from './tune'

/** A large left-side wheel accompanies the chip's rise and fall, clearing at impact. */
export default function FlightRoulette({ clock0 }: { clock0: MutableRefObject<number> }) {
  const tune = useTune()
  const group = useRef<THREE.Group>(null)
  const caption = useRef<THREE.Group>(null)
  const time = useRef<number | null>(null)
  const tilt = useMemo(() => new THREE.Quaternion(), [])
  const sway = useMemo(() => new THREE.Quaternion(), [])
  const upright = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const angles = useMemo(() => new THREE.Euler(), [])
  const { gl, camera, scene } = useThree()

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('flight')) return
    const canvas = gl.domElement
    const object = group.current
    if (!object) return
    const previousTabIndex = canvas.getAttribute('tabindex')
    canvas.setAttribute('tabindex', '0')
    const keys = ['rouX', 'rouY', 'rouDepth', 'rouSize', 'rouScaleX', 'rouScaleY', 'rouScaleZ', 'rouTilt', 'rouYaw', 'rouBank'] as const
    let start: Pick<Tune, typeof keys[number]> | null = null
    let poseStart: TransformPose | null = null
    const cameraOrientation = new THREE.Quaternion()
    let halfH = 1, halfW = 1, unitsPerPixel = 1
    const apply = (patch: Partial<Tune>) => {
      setTune(patch)
      window.dispatchEvent(new Event(PANEL_EDIT_EVENT))
    }
    const clamp = (key: typeof keys[number], value: number) => {
      const [min, max] = TUNE_RANGES[key]
      return Math.min(max, Math.max(min, value))
    }
    const removeScene = object.parent ? flightEditor.add('flight-scene', object.parent, { name: 'Flight scene' }) : () => {}
    const removeRoulette = flightEditor.add('roulette', object, { name: 'Roulette', transform: {
      enabled: () => group.current?.visible === true,
      onBegin: () => {
        const t = getTune()
        start = Object.fromEntries(keys.map(key => [key, t[key]])) as Pick<Tune, typeof keys[number]>
        camera.getWorldQuaternion(cameraOrientation)
        const pc = camera as THREE.PerspectiveCamera
        halfH = Math.tan(THREE.MathUtils.degToRad(pc.fov) / 2) * 11
        halfW = halfH * pc.aspect
        unitsPerPixel = 2 * halfH * (11 - t.rouDepth) / 11 / Math.max(1, canvas.clientHeight)
        poseStart = {
          position: new THREE.Vector3(),
          quaternion: cameraOrientation.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(t.rouTilt, t.rouYaw, t.rouBank))),
          scale: new THREE.Vector3(t.rouScaleX, t.rouScaleY, t.rouScaleZ).multiplyScalar(t.rouSize),
        }
        pushUndo([...keys])
      },
      onUpdate: gesture => {
        if (!start || !poseStart) return
        const pose = transformGesture(poseStart, gesture, { quaternion: cameraOrientation, unitsPerPixel })
        const inverseCamera = cameraOrientation.clone().invert()
        const delta = pose.position.applyQuaternion(inverseCamera)
        const rotation = new THREE.Euler().setFromQuaternion(inverseCamera.multiply(pose.quaternion), 'XYZ')
        const size = gesture.mode === 'scale' && gesture.axis === null
          ? clamp('rouSize', Math.abs(start.rouSize * (gesture.exact ?? gesture.scale ?? 1))) : start.rouSize
        apply({
          rouX: clamp('rouX', start.rouX + delta.x / halfW),
          rouY: clamp('rouY', start.rouY + delta.y / halfH),
          rouDepth: clamp('rouDepth', start.rouDepth + delta.z),
          rouSize: size,
          rouScaleX: clamp('rouScaleX', pose.scale.x / size),
          rouScaleY: clamp('rouScaleY', pose.scale.y / size),
          rouScaleZ: clamp('rouScaleZ', pose.scale.z / size),
          rouTilt: rotation.x, rouYaw: rotation.y, rouBank: rotation.z,
        })
      },
      onCancel: () => {
        if (start) { apply(start); popUndo() }
        start = null
        poseStart = null
      },
      onCommit: () => { start = null; poseStart = null },
    } })
    const screenPoint = (point: THREE.Vector3) => {
      const rect = canvas.getBoundingClientRect()
      point.project(camera)
      return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 }
    }
    const selectedObject = () => scene.getObjectByName(`flight-${flightEditor.selectedId()}`) ?? object
    const stop = flightEditor.connect(canvas, {
      profile: 'blender', axes: ['x', 'y', 'z'],
      pivot: () => screenPoint(selectedObject().getWorldPosition(new THREE.Vector3())),
      axisScreen: () => {
        const position = selectedObject().getWorldPosition(new THREE.Vector3())
        const center = screenPoint(position.clone())
        return Object.fromEntries((['x', 'y', 'z'] as const).map(axis => {
          const vector = new THREE.Vector3(); vector[axis] = 1
          const point = screenPoint(position.clone().add(vector))
          return [axis, { x: point.x - center.x, y: point.y - center.y }]
        })) as Record<'x' | 'y' | 'z', { x: number; y: number }>
      },
    })
    const undo = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (flightEditor.gesture() || !flightEditor.canTransform() || target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault()
        if (undoTune()) window.dispatchEvent(new Event(PANEL_EDIT_EVENT))
      }
    }
    window.addEventListener('keydown', undo)
    return () => {
      stop()
      removeRoulette()
      removeScene()
      if (previousTabIndex === null) canvas.removeAttribute('tabindex')
      else canvas.setAttribute('tabindex', previousTabIndex)
      window.removeEventListener('keydown', undo)
    }
  }, [gl, camera, scene])

  useFrame(({ camera, clock }) => {
    const g = group.current
    if (!g) return
    const tn = getTune()
    const t = clock0.current >= 0 ? beatTime(clock.elapsedTime - clock0.current) : -1
    const age = t - tn.jkFlick - tn.rouDelay
    // Stay beside the descending chip too. Reserve the end of its fall for
    // travelling offscreen, so the wheel is clear when the impact frame starts.
    const exitFor = Math.min(tn.rouExit, tn.jkFallFor * 0.65)
    const leaveAt = Math.max(0.1, tn.jkRise + tn.jkHold + tn.jkFallFor - tn.rouDelay - exitFor)
    const visible = age >= 0 && age < leaveAt + exitFor
    if (g.visible !== visible) {
      g.visible = visible
      flightEditor.refresh()
    }
    // Freeze placement for editing, while the wheel and ball keep spinning.
    time.current = g.visible ? Math.max(0, clock.elapsedTime - clock0.current - tn.jkFlick - tn.rouDelay) : null
    if (!g.visible) { if (caption.current) caption.current.visible = false; return }

    // Frame-relative placement shares the title's approach and stays on the left
    // even on narrow screens. All motion is on the chip's clock, including replay.
    const pc = camera as THREE.PerspectiveCamera
    const distance = 11
    const hh = Math.tan(THREE.MathUtils.degToRad(pc.fov) / 2) * distance
    const hw = hh * pc.aspect
    const baseRadius = Math.min(hh * 0.48, hw * 0.28)
    const radius = baseRadius * tn.rouSize
    const enter = Math.min(1, age / Math.min(tn.rouEnter, leaveAt))
    const leave = Math.max(0, (age - leaveAt) / exitFor)
    // The travel envelope grows with the wheel and offset, so even a very large
    // wheel enters/exits beyond the frame rather than popping at the visibility gate.
    const extent = radius * Math.max(Math.abs(tn.rouScaleX), Math.abs(tn.rouScaleY), Math.abs(tn.rouScaleZ)) * 1.15
    const clearance = 1.35 + extent / hh + extent / distance + Math.abs(tn.rouY)
    const rhythm = age * tn.rouSwaySpeed
    const y = -clearance * (1 - enter) ** 3 + age * tn.rouDrift + clearance * leave ** 2 + tn.rouY
      + 0.065 * Math.sin(rhythm + 0.35)
    g.position.set(-hw + baseRadius * 1.16 + hw * tn.rouX + baseRadius * 0.18 * Math.sin(rhythm - 0.4), hh * y, -distance + tn.rouDepth)
    g.position.applyQuaternion(camera.quaternion).add(camera.position)
    // Turn the entire tilted wheel around the upright screen Y axis. Adding
    // this to Euler Y instead would swing around an axis tilted by Euler X.
    angles.set(tn.rouTilt + 0.14 * Math.sin(rhythm * 0.85 + 0.3), tn.rouYaw,
      tn.rouBank + 0.13 * Math.sin(rhythm - 0.45))
    tilt.setFromEuler(angles)
    sway.setFromAxisAngle(upright, tn.rouSway * Math.sin(age * tn.rouSwaySpeed))
    g.quaternion.copy(camera.quaternion).multiply(sway).multiply(tilt)
    g.scale.set(tn.rouScaleX * radius, tn.rouScaleY * radius, tn.rouScaleZ * radius)
    placeFlightCallout(caption.current, g, camera, hw, hh, tn.rouTextX, tn.rouTextY, tn.rouTextSize, tn.rouTextR, age)
  })

  return (
    <><group ref={group} visible={false} name="flight-roulette" onPointerDown={event => { event.stopPropagation(); flightEditor.pick(event.object); gl.domElement.focus() }}>
      <Roulette size={1} time={time} orbit fill={0.95} shadows={false} ballSpeed={-tune.rouBall} wheelSpeed={tune.rouWheel} />
    </group>
    <FlightCallout kind="roulette" objectRef={caption} anchor={group} /></>
  )
}
