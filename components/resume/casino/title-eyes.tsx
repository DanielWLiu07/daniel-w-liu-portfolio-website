'use client'

import { useEffect, useMemo, useRef, useSyncExternalStore, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { eyeMaterial, sharedTitleEyeMaterial } from './materials'
import { EYE_PLANE, irisAt, type EyeInk } from './eye'
import { titleEyeMotion } from './title-eye-motion'
import type { ImpactFx } from './hero-chip'
import { getTitleEyes, isTitleEyeEditor, previewTitleEyes, subscribeTitleEyes, undoTitleEyes } from './title-eye-layout'
import { registerTitleEye, titleEyeEditor } from './title-eye-editor'
import { PANEL_EDIT_EVENT } from '@/components/panels/panel-events'

function createRoomPose() {
  return { placed: false, width: 0, height: 0, hw: 1, hh: 1, unit: 1, motionTime: 0, origin: new THREE.Vector3(), orientation: new THREE.Quaternion(), up: new THREE.Vector3(), right: new THREE.Vector3() }
}
type RoomPose = ReturnType<typeof createRoomPose>

/** Shared room anchor; changing the object list never resets the camera anchor. */
export default function TitleEyes({ fx }: { fx: MutableRefObject<ImpactFx> }) {
  const { gl, camera, scene } = useThree()
  const editing = isTitleEyeEditor()
  const eyes = useSyncExternalStore(subscribeTitleEyes, getTitleEyes, getTitleEyes)
  const geometry = useMemo(() => new THREE.PlaneGeometry(EYE_PLANE.w, EYE_PLANE.h), [])
  const shared = useMemo(() => {
    const separate = typeof window !== 'undefined' && window.location.hostname === 'localhost'
      && new URLSearchParams(window.location.search).has('separateEyeMaterials')
    return separate ? null : sharedTitleEyeMaterial()
  }, [])
  useEffect(() => () => shared?.dispose(), [shared])
  const room = useRef(createRoomPose())
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => {
    if (!editing) return
    const canvas = gl.domElement, previousTabIndex = canvas.getAttribute('tabindex')
    canvas.setAttribute('tabindex', '0')
    const point = new THREE.Vector3(), end = new THREE.Vector3()
    const selected = () => scene.getObjectByName(`title-eye-${titleEyeEditor.selectedId()?.split(':')[1]}`)
    const disconnect = titleEyeEditor.connect(canvas, {
      axes: ['x', 'y', 'z'], profile: 'blender',
      pivot: () => {
        selected()?.getWorldPosition(point)
        point.project(camera)
        const rect = canvas.getBoundingClientRect()
        return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 }
      },
      axisScreen: () => {
        const object = selected(), rect = canvas.getBoundingClientRect()
        const direction = (x: number, y: number, z: number) => {
          object?.getWorldPosition(point); end.copy(point).add(new THREE.Vector3(x, y, z))
          point.project(camera); end.project(camera)
          return { x: (end.x - point.x) * rect.width / 2, y: (point.y - end.y) * rect.height / 2 }
        }
        return { x: direction(1, 0, 0), y: direction(0, 1, 0), z: direction(0, 0, 1) }
      },
    })
    // Blender routes shortcuts to the editor under the pointer. A range input
    // in the dock otherwise keeps keyboard focus after the pointer returns.
    const focusViewport = () => { if (!titleEyeEditor.gesture()) canvas.focus({ preventScroll: true }) }
    canvas.addEventListener('pointerenter', focusViewport)
    const changed = titleEyeEditor.onChange(() => window.dispatchEvent(new Event(PANEL_EDIT_EVENT)))
    const undo = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest('input, textarea, select, [contenteditable="true"]')) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !titleEyeEditor.gesture()) { event.preventDefault(); undoTitleEyes(); window.dispatchEvent(new Event(PANEL_EDIT_EVENT)) }
    }
    window.addEventListener('keydown', undo)
    return () => { disconnect(); changed(); canvas.removeEventListener('pointerenter', focusViewport); window.removeEventListener('keydown', undo); if (previousTabIndex === null) canvas.removeAttribute('tabindex'); else canvas.setAttribute('tabindex', previousTabIndex) }
  }, [editing, gl, camera, scene])

  useFrame(({ camera, size }, dt) => {
    const state = room.current
    if (fx.current.impactAge < 1.02) { state.placed = false; state.motionTime = 0; return }
    // The room can hold on its final beat while the eyes keep living.
    if (!editing || previewTitleEyes()) state.motionTime += Math.min(dt, 0.05)
    if (!state.placed || state.width !== size.width || state.height !== size.height) {
      const cam = camera as THREE.PerspectiveCamera
      state.hh = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * 24
      state.hw = state.hh * cam.aspect
      state.unit = Math.min(state.hw, state.hh)
      state.origin.copy(camera.position); state.orientation.copy(camera.quaternion)
      state.up.set(0, 1, 0).applyQuaternion(camera.quaternion)
      state.right.set(1, 0, 0).applyQuaternion(camera.quaternion)
      state.width = size.width; state.height = size.height; state.placed = true
    }
  }, 0.29)

  return <group name="title-colored-eyes" dispose={null}>
    {eyes.map((eye, index) => !eye.removed && <ColoredEye key={index} index={index} ink={eye.ink} shared={shared} geometry={geometry} room={room} fx={fx} editing={editing} />)}
  </group>
}

function ColoredEye({ index, ink, shared, geometry, room, fx, editing }: {
  index: number; ink: EyeInk; shared: ReturnType<typeof eyeMaterial> | null; geometry: THREE.PlaneGeometry
  room: MutableRefObject<RoomPose>; fx: MutableRefObject<ImpactFx>; editing: boolean
}) {
  const { gl, camera } = useThree()
  const mesh = useRef<THREE.Mesh>(null)
  const material = useMemo(() => shared ?? eyeMaterial(`titleEye:${index}`, ink, true, false), [shared, index, ink])
  const uniforms = useMemo(() => shared ? { eyeOpen: { value: 0 }, eyeWeight: { value: 1 }, eyeIrisX: { value: 0 }, eyeIrisY: { value: 0.01 } } : material.userData.uniforms, [shared, material])
  const gaze = useRef({ x: 0, y: 0 })
  const rotation = useMemo(() => ({ euler: new THREE.Euler(), quaternion: new THREE.Quaternion() }), [])
  useEffect(() => () => { if (!shared) material.dispose() }, [shared, material])
  useEffect(() => {
    if (!editing || !mesh.current) return
    const remove = registerTitleEye(index, mesh.current, () => ({ camera: camera.quaternion, anchor: room.current.orientation, halfWidth: room.current.hw, halfHeight: room.current.hh, height: gl.domElement.clientHeight }))
    if (titleEyeEditor.selectedId() === null) titleEyeEditor.select(`eye:${index}`)
    return remove
  }, [editing, gl, camera, room, index])

  useFrame(({ camera, pointer }, dt) => {
    const object = mesh.current, eye = getTitleEyes()[index], state = room.current
    if (!object || !eye) return
    const preview = editing && previewTitleEyes()
    const visible = state.placed && fx.current.impactAge >= 1.02 + (index % 4) * 0.14 && !eye.removed
    if (object.visible !== visible) { object.visible = visible; if (editing) titleEyeEditor.refresh() }
    if (!visible) return
    const frozen = editing && !preview
    const motion = titleEyeMotion(state.motionTime, index, frozen)
    const follow = 1 - Math.exp(-Math.min(dt, 0.05) * 7), m = gaze.current
    m.x += (THREE.MathUtils.clamp((pointer.x - eye.x) * 0.22 + motion.gazeX, -0.25, 0.25) - m.x) * follow
    m.y += (THREE.MathUtils.clamp((pointer.y - eye.y) * 0.16 + motion.gazeY, -0.15, 0.15) - m.y) * follow
    const [ix, iy] = irisAt(frozen ? [0, 0] : [m.x, m.y], motion.open)
    const u = uniforms
    u.eyeOpen.value = motion.open; u.eyeWeight.value = 1.3
    u.eyeIrisX.value = ix; u.eyeIrisY.value = iy
    object.position.set(eye.x * state.hw, eye.y * state.hh, -24 + (eye.depth ?? 0)).applyQuaternion(state.orientation).add(state.origin)
      .addScaledVector(state.up, motion.y * state.unit).addScaledVector(state.right, motion.x * state.unit)
    rotation.euler.set((eye.tilt ?? 0) + motion.tilt, (eye.yaw ?? 0) + motion.yaw, eye.roll + motion.roll)
    object.quaternion.copy(camera.quaternion).multiply(rotation.quaternion.setFromEuler(rotation.euler))
    object.scale.set(eye.sx ?? 1, eye.sy ?? 1, eye.sz ?? 1).multiplyScalar(state.unit * eye.size * motion.scale)
  }, 0.3)

  return <mesh ref={mesh} name={`title-eye-${index}`} geometry={geometry} material={material} visible={false} userData={{ compNoPosition: true, casinoTitleEye: { ink, uniforms } }}
    raycast={editing ? THREE.Mesh.prototype.raycast : () => {}}
    onPointerDown={editing ? event => { event.stopPropagation(); if (!titleEyeEditor.gesture()) titleEyeEditor.pick(event.object); gl.domElement.focus() } : undefined} />
}
