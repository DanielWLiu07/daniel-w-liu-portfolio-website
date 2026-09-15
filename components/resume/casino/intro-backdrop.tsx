'use client'

import { useEffect, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { compileMaterial, graph, materialUniforms } from 'blender-to-threejs'
import * as THREE from 'three'
import { register } from './materials'
import { beatTime, getTune, useTune } from './tune'
import type { ImpactFx } from './hero-chip'
import { paintIntroBackdrop } from './intro-backdrop-art'
import { sampleBackdropLayer, sampleBackdropMotion } from './intro-backdrop-motion'

type Art = { style: number; base: HTMLCanvasElement; detail: HTMLCanvasElement; mask: HTMLCanvasElement; flight: HTMLCanvasElement; flightMask: HTMLCanvasElement; maps: THREE.CanvasTexture[]; materials: THREE.Material[]; geometry: THREE.PlaneGeometry }

function paintPreset(art: Art, style: number) {
  if (art.style === style) return
  paintIntroBackdrop(art.base, art.detail, art.mask, style === 11 ? 9 : style)
  if (style === 11) paintIntroBackdrop(art.base, art.flight, art.flightMask, 10)
  art.maps.forEach(map => { map.needsUpdate = true })
  art.style = style
}

/** Cached background art, animated on the shot clock; no new compositor passes. */
export default function IntroBackdrop({ clock0, fx }: { clock0: MutableRefObject<number>; fx: MutableRefObject<ImpactFx> }) {
  const root = useRef<THREE.Group>(null)
  const { bgStyle } = useTune()
  const artRef = useRef<Art | null>(null)
  const movement = useRef({ travel: 0, rush: 0, opacity: 0, dive: 0, flick: 0 })
  const layerMotion = useRef({ x: 0, y: 0, rotation: 0, sx: 1, sy: 1 })
  useEffect(() => {
    const base = document.createElement('canvas'), detail = document.createElement('canvas'), mask = document.createElement('canvas')
    const flight = document.createElement('canvas'), flightMask = document.createElement('canvas')
    const maps = [base, detail, mask, flight, flightMask].map(c => new THREE.CanvasTexture(c))
    maps[0].colorSpace = maps[1].colorSpace = maps[3].colorSpace = THREE.SRGBColorSpace
    const materials = [0, 1, 2].map(i => {
      const g = graph(), uv = g.uv()
      const alpha = i ? g.multiply(g.uniform('backdropAlpha', 0), g.separate(g.texture(maps[i === 1 ? 2 : 4], uv), 'x')) : g.uniform('backdropAlpha', 0)
      const material = compileMaterial(register(`introBackdrop:${i}`, g.multiplyColor(1, g.texture(maps[i === 2 ? 3 : i], uv), g.uniform('backdropLight', 1))), { opacity: alpha })
      material.depthWrite = false
      return material
    })
    const geometry = new THREE.PlaneGeometry(2, 2)
    const art = { style: -1, base, detail, mask, flight, flightMask, maps, materials, geometry }
    artRef.current = art
    paintPreset(art, Math.round(getTune().bgStyle))
    const group = root.current!
    const layers = materials.map((material, i) => {
      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = `intro-backdrop-${i}`; mesh.renderOrder = -10 + i
      mesh.userData.compNoPosition = true; mesh.raycast = () => {}
      group.add(mesh)
      return mesh
    })
    return () => {
      layers.forEach(mesh => group.remove(mesh))
      materials.forEach(m => m.dispose()); maps.forEach(m => m.dispose()); geometry.dispose()
      artRef.current = null
    }
  }, [])
  useEffect(() => {
    const art = artRef.current
    if (!art) return
    paintPreset(art, Math.round(bgStyle))
  }, [bgStyle])

  useFrame(({ camera, clock }) => {
    const group = root.current
    const art = artRef.current
    if (!group || !art) return
    const tn = getTune()
    const t = clock0.current < 0 ? -1 : beatTime(clock.elapsedTime - clock0.current)
    const arc = sampleBackdropMotion(movement.current, t, fx.current.impactAge)
    const fade = arc.opacity
    group.visible = t >= 0 && tn.bgStyle > 0 && fade > 0 && tn.bgStrength > 0
    if (!group.visible) return
    // Behind the camera-facing title (17 units), ahead of the distant room wall.
    const distance = 22
    const pc = camera as THREE.PerspectiveCamera
    const hh = Math.tan(THREE.MathUtils.degToRad(pc.fov) / 2) * distance
    const hw = hh * pc.aspect
    const motion = tn.bgMotion
    const flight = Math.max(0, t - tn.jkFlick)
    const crescendo = THREE.MathUtils.smoothstep(flight, 0.08, 0.95)
    const beat = Math.exp(-Math.max(0, t - tn.jkTJack) * 3) * Math.sin(Math.max(0, t - tn.jkTJack) * 8)
    group.position.set(0, 0, -distance).applyQuaternion(camera.quaternion).add(camera.position)
    group.quaternion.copy(camera.quaternion)
    group.scale.set(hw * 1.22, hh * 1.22, 1)
    for (let i = 0; i < 3; i++) {
      const layer = group.children[i] as THREE.Mesh
      layer.visible = i < 2 || (tn.bgStyle === 11 && crescendo > 0)
      if (!layer.visible) continue
      const pose = sampleBackdropLayer(layerMotion.current, arc, t, i, motion)
      layer.position.set(pose.x, pose.y, i * 0.1)
      layer.rotation.z = pose.rotation
      layer.scale.set(pose.sx, pose.sy, 1)
      const u = materialUniforms(art.materials[i])
      const detailWeight = tn.bgStyle !== 11 || i === 0 ? 1 : i === 1 ? 1 - crescendo * 0.8 : crescendo * 0.85
      u.backdropAlpha.value = fade * tn.bgStrength * (i ? tn.bgDetail : 1) * detailWeight
      u.backdropLight.value = tn.bgGlow * (1 + beat * 0.06 * motion)
    }
  })
  return <group ref={root} name="intro-backdrop" visible={false} dispose={null} />
}
