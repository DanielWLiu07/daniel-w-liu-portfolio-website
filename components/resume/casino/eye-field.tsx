'use client'

/**
 * The field of drawn eyes, standing in the WORLD.
 *
 * They are objects in the room, not an overlay on the lens. That distinction is
 * the whole character of the thing: as the beat's camera swings, the eyes
 * PARALLAX against each other and against the title card, the near ones swell
 * and the far ones shrink, and anything the scene puts in front of them hides
 * them. A field pinned to the camera does none of that and reads as a sticker on
 * the glass.
 *
 * Two decisions make that work.
 *
 * POSITIONS ARE FROZEN. They are worked out once, by projecting the same view
 * space layout /eye uses out along the camera's basis, so the field is
 * guaranteed to start in frame rather than needing world coordinates guessed at
 * by hand. After that they are ordinary world positions and the camera is free
 * to leave them behind.
 *
 * ORIENTATION IS NOT. Each card turns to face the camera every frame. A drawn
 * eye is a flat thing: frozen upright it goes edge on the moment the camera
 * moves off axis and the field disappears. Position in the world, facing the
 * viewer, is what a sprite is and it is what this wants.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { eyeMaterial } from './materials'
import { EYE_PLANE, gazeFor, inkFor, irisAt, openAt, scatterEyes, type EyeInstance } from './eye'
import { beatTime, useTune } from './tune'

/** an eye once it has been given a place in the world */
interface PlacedEye extends EyeInstance {
  world: THREE.Vector3
  aspect: number
}

/** the pointer in normalised device coordinates */
function usePointer() {
  const p = useRef<[number, number]>([0, 0])
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      p.current = [(e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1)]
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])
  return p
}

function OneEye({
  eye,
  index,
  cursor,
  time,
  visible,
}: {
  eye: PlacedEye
  index: number
  cursor: React.RefObject<[number, number]>
  time: React.RefObject<number>
  visible: boolean
}) {
  const t = useTune()
  const { camera } = useThree()
  const mesh = useRef<THREE.Mesh>(null)
  const mat = useMemo(() => {
    // flat: the table's lamp is a spot over the felt and these are all over the
    // room, so anything wearing it goes dark as soon as it leaves that pool
    const m = eyeMaterial(`fieldEye${index}`, inkFor(index), true)
    return m
  }, [index])

  useFrame(() => {
    const local = (time.current ?? -1) - t.eyAt - eye.delay * (t.eyStagger / 0.75)
    const open = openAt(local, { wake: t.eyWake, every: eye.every * (t.eyEvery / 3.6), phase: eye.phase, delay: 0 })
    const target = gazeFor(eye, (cursor.current?.[0] ?? 0) * eye.aspect, cursor.current?.[1] ?? 0)
    const [ix, iy] = irisAt([target[0] * t.eyGaze, target[1] * t.eyGaze], open)
    const u = (mat.userData.uniforms ?? {}) as Record<string, { value: number }>
    if (u.eyeOpen) u.eyeOpen.value = open * t.eyFade
    if (u.eyeIrisX) u.eyeIrisX.value = ix
    if (u.eyeIrisY) u.eyeIrisY.value = iy
    if (u.eyeWeight) u.eyeWeight.value = t.eyWeight
    if (u.eyePaper) u.eyePaper.value = t.eyPaper
    // face the viewer, but keep its own roll: the tilt is what stops a field of
    // them reading as a printed pattern, and a plain lookAt would flatten it out
    const m = mesh.current
    if (m) {
      m.quaternion.copy(camera.quaternion)
      m.rotateZ(eye.roll)
    }
  })

  return (
    <mesh ref={mesh} material={mat} position={eye.world} scale={eye.scale} renderOrder={40 + index} visible={visible}>
      <planeGeometry args={[EYE_PLANE.w, EYE_PLANE.h]} />
    </mesh>
  )
}

/**
 * Driven off the SAME clock0 the rest of the beat uses, and through the same
 * beatTime, so the eyes arrive on the sequence's timeline rather than on one of
 * their own.
 */
export default function EyeField({ clock0 }: { clock0: React.RefObject<number> }) {
  const t = useTune()
  const { camera, gl, size } = useThree()
  const cursor = usePointer()
  const time = useRef(-1)

  /**
   * Placed once, from the camera as it is WHEN THE BEAT STARTS.
   *
   * Not at mount, which is the obvious place for it and is wrong: the casino
   * camera is somewhere else entirely before the sequence arms, so a field
   * placed then is left behind in the room and never appears in the shot at
   * all. That is exactly what happened.
   *
   * The view space layout is projected out along the camera's own right, up and
   * forward at eyDist, which is what guarantees the field starts in frame
   * without world coordinates having to be guessed at by hand. From there they
   * are plain world positions and the camera is free to leave them behind, which
   * is what gives the parallax.
   */
  const [eyes, setEyes] = useState<PlacedEye[]>([])
  const [live, setLive] = useState(false)
  const layout = `${t.eyN}|${t.eySize}|${t.eyDist}|${t.eyCover}|${size.width}|${size.height}`
  const placedFor = useRef('')
  const place = () => {
    const n = Math.max(0, Math.round(t.eyN))
    if (!n) return [] as PlacedEye[]
    const cam = camera as THREE.PerspectiveCamera
    const aspect = size.width / Math.max(1, size.height)
    const h = Math.tan(((cam.fov ?? 40) * Math.PI) / 360) * t.eyDist * t.eyCover
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion)
    const fwd = new THREE.Vector3()
    cam.getWorldDirection(fwd)
    const origin = cam.position.clone().addScaledVector(fwd, t.eyDist)
    return scatterEyes(n, aspect).map((e) => ({
      ...e,
      aspect,
      scale: e.scale * h * t.eySize,
      // scattered in DEPTH as well, so it is a field standing in the room rather
      // than a set of stickers on one pane of glass. This is what parallaxes.
      world: origin
        .clone()
        .addScaledVector(right, e.x * h * aspect)
        .addScaledVector(up, e.y * h)
        .addScaledVector(fwd, (e.phase - 0.5) * t.eyDist * 0.5),
    }))
  }

  /**
   * Built at MOUNT, hidden, and the shaders warmed then.
   *
   * The eye is a big shader and there are fourteen of them, and a material is
   * not compiled when it is created, it is compiled the first time it is drawn.
   * Building the field only when the beat starts therefore put fourteen
   * compilations into one frame, and the beat's clock starts at the chip's
   * landing, so the whole stall landed exactly on the impact. Measured: the
   * worst frame was near a second, while the steady state is a flat 60 at any
   * number of eyes, which is what says compile rather than fill.
   *
   * So they are built now, at a provisional placement, kept invisible, and
   * handed to compileAsync. The beat then only moves them.
   */
  useEffect(() => {
    if (!eyes.length) setEyes(place())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout])

  const warmed = useRef('')
  useFrame((state) => {
    // warm the shaders off the critical path, once the meshes exist
    if (eyes.length && warmed.current !== layout) {
      warmed.current = layout
      const r = gl as unknown as { compileAsync?: (s: THREE.Object3D, c: THREE.Camera) => Promise<unknown> }
      r.compileAsync?.(state.scene, camera)
    }
    // the beat's own clock: -1 until the sequence is armed, so the eyes stay shut
    const c0 = clock0.current
    time.current = c0 > 0 ? beatTime(state.clock.elapsedTime - c0) : -1
    if (time.current < 0) return
    // the field is placed for real the first frame the beat is live, using the
    // camera as it is THEN, and again if a knob moved it
    if (placedFor.current !== layout) {
      placedFor.current = layout
      setEyes(place())
    }
    if (!live) setLive(true)
  })

  if (!eyes.length || t.eyFade <= 0) return null
  return (
    <>
      {eyes.map((e, i) => (
        <OneEye key={i} eye={e} index={i} cursor={cursor} time={time} visible={live} />
      ))}
    </>
  )
}
