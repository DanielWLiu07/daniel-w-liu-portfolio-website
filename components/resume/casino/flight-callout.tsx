'use client'

import { useEffect, useState, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import { CASINO_PALETTE, compileMaterial, graph, materialUniforms } from 'blender-to-threejs'
import * as THREE from 'three'
import { register } from './materials'
import { flightEditor } from './flight-editor'

type Callout = 'roulette' | 'royal-flush'
type Artwork = { material: THREE.Material; geometry: THREE.PlaneGeometry }
const cache = new Map<string, Artwork>()
const offset = new THREE.Vector3()
let fontLoad: Promise<void> | null = null

function ensureCaptionFont(): Promise<void> {
  if (!fontLoad) fontLoad = (async () => {
    const face = await new FontFace('CasinoFlightDisplay', "url('/fonts/FAST%20BLAZE.woff2')").load()
    document.fonts.add(face)
  })()
  return fontLoad
}

/** Bold, naturally irregular display type with a clean cream keyline. */
function paintLine(ctx: CanvasRenderingContext2D, text: string, y: number, height: number, color: string) {
  ctx.save()
  ctx.textBaseline = 'alphabetic'
  ctx.font = '200px CasinoFlightDisplay'
  const capHeight = ctx.measureText('H').actualBoundingBoxAscent
  ctx.font = `${200 * height / Math.max(1, capHeight)}px CasinoFlightDisplay`
  const metrics = ctx.measureText(text)
  const width = metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight
  const fit = Math.min(1, (ctx.canvas.width - 100) / width)
  const baseline = (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2
  const x = -width / 2 + metrics.actualBoundingBoxLeft
  ctx.translate(ctx.canvas.width / 2, y)
  ctx.scale(fit, fit)
  ctx.lineJoin = 'round'
  // A small offset shadow gives the word weight without a rectangular label.
  ctx.strokeStyle = new THREE.Color(...CASINO_PALETTE.inks[0]).getStyle()
  ctx.lineWidth = height * 0.11
  ctx.strokeText(text, x + height * 0.025, baseline + height * 0.045)
  ctx.strokeStyle = new THREE.Color(...CASINO_PALETTE.paper).getStyle()
  ctx.lineWidth = height * 0.055
  ctx.strokeText(text, x, baseline)
  ctx.fillStyle = color
  ctx.fillText(text, x, baseline)
  ctx.restore()
}
function artwork(kind: Callout, line: number): Artwork {
  const key = `${kind}:${line}`
  const cached = cache.get(key)
  if (cached) return cached
  const lines = kind === 'roulette' ? ['ALL ON', 'GREEN'] : ['ROYAL', 'FLUSH']
  const canvas = document.createElement('canvas')
  canvas.width = 1024; canvas.height = 260
  const ctx = canvas.getContext('2d')!
  const ink = CASINO_PALETTE.inks[kind === 'roulette' ? 2 : 1]
  const paper = new THREE.Color(...CASINO_PALETTE.paper)
  const color = new THREE.Color(...ink).multiplyScalar(2.2).lerp(paper, 0.28).getStyle()
  paintLine(ctx, lines[line], 130, line === 0 ? 98 : 166, line === 0 ? paper.getStyle() : color)
  const mask = document.createElement('canvas')
  mask.width = canvas.width; mask.height = canvas.height
  const mx = mask.getContext('2d')!
  mx.drawImage(canvas, 0, 0)
  mx.globalCompositeOperation = 'source-in'; mx.fillStyle = '#fff'; mx.fillRect(0, 0, mask.width, mask.height)
  mx.globalCompositeOperation = 'destination-over'; mx.fillStyle = '#000'; mx.fillRect(0, 0, mask.width, mask.height)
  const map = new THREE.CanvasTexture(canvas), alpha = new THREE.CanvasTexture(mask)
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4
  const g = graph(), uv = g.uv()
  const material = compileMaterial(register(`flightCallout:${key}`, g.texture(map, uv)), {
    opacity: g.multiply(g.uniform('captionInk', 0), g.separate(g.texture(alpha, uv), 'x')),
  })
  material.depthWrite = false
  const result = { material, geometry: new THREE.PlaneGeometry(canvas.width / 520, canvas.height / 520) }
  cache.set(key, result)
  return result
}

/** Follow the prop's screen position while keeping the lettering camera-facing. */
export function placeFlightCallout(mesh: THREE.Group | null, anchor: THREE.Group, camera: THREE.Camera,
  hw: number, hh: number, x: number, y: number, size: number, bank: number, age: number) {
  if (!mesh) return
  mesh.visible = anchor.visible && size > 0
  if (!mesh.visible) return
  // Move toward the camera along the same ray, then apply frame-relative offsets.
  // This keeps the text in front of the prop without changing its apparent scale.
  const near = 0.8
  mesh.position.copy(anchor.position).sub(camera.position).multiplyScalar(near).add(camera.position)
  // Smaller, phase-offset arcs give the lettering follow-through while the
  // prop carries the broad motion. Analytic timing also keeps scrubbing exact.
  const phase = age * 3.4 + (x > 0 ? 0.6 : -0.6)
  offset.set(hw * (x + 0.024 * Math.sin(phase)) * near,
    hh * (y + 0.048 * Math.sin(phase - 0.65)) * near, 0).applyQuaternion(camera.quaternion)
  mesh.position.add(offset)
  mesh.quaternion.copy(camera.quaternion).slerp(anchor.quaternion, 0.18)
  mesh.rotateZ(bank + 0.085 * Math.sin(phase - 0.9))
  // The props already fit to width in portrait; keep their captions within
  // the same frame instead of sizing a tall phone's text from height alone.
  mesh.scale.setScalar(Math.min(hh * 0.36, hw * 0.48) * near * size)
  for (let i = 0; i < mesh.children.length; i++) {
    const word = mesh.children[i] as THREE.Mesh
    const t = age - 0.1 - i * 0.14
    word.visible = t >= 0
    if (!word.visible) continue
    // Analytic spring: overshoot on arrival, no integrated state to drift when
    // scrubbing/replaying. A continuing wave carries the motion after settling.
    const decay = Math.exp(-7 * t)
    const pop = Math.max(0.001, 1 - decay * (Math.cos(13 * t) + 7 / 13 * Math.sin(13 * t)))
    const wave = phase * 1.35 - i * 1.1
    const squash = 0.055 * Math.sin(wave) + 0.12 * decay * Math.sin(13 * t)
    word.position.set(0.035 * Math.sin(wave - 0.4) + (i ? 0.12 : -0.12) * decay,
      (i === 0 ? 0.204 : -0.156) + 0.042 * Math.sin(wave) - 0.09 * decay,
      0.02 * Math.sin(wave - 0.7))
    word.rotation.set(0.1 * Math.sin(wave - 0.5), 0.14 * Math.sin(wave * 0.8),
      0.07 * Math.sin(wave - 0.8) + (i ? -0.2 : 0.2) * decay)
    word.scale.set(pop * (1 - squash * 0.5), pop * (1 + squash), 1)
    materialUniforms(word.material as THREE.Material).captionInk.value = Math.min(1, t / 0.1)
  }
}

/** Four cached word textures; independent motion without canvas redraws. */
export default function FlightCallout({ kind, objectRef, anchor }: {
  kind: Callout; objectRef: RefObject<THREE.Group | null>; anchor: RefObject<THREE.Group | null>
}) {
  const [art, setArt] = useState<Artwork[] | null>(null)
  const { gl } = useThree()
  useEffect(() => {
    let active = true
    void ensureCaptionFont().then(() => { if (active) setArt([artwork(kind, 0), artwork(kind, 1)]) }).catch(error => {
      console.warn('Flight caption font failed to load', error)
    })
    return () => { active = false }
  }, [kind])
  if (!art) return null
  // Render with the props through the existing paint compositor. Transparent
  // stock is excluded only from its world-position pass, never from the paint.
  return <group ref={objectRef} name={`${kind}-caption`} renderOrder={40} visible={false} dispose={null}
    onPointerDown={event => {
      event.stopPropagation(); flightEditor.pick(anchor.current); gl.domElement.focus()
    }}>
    {art.map((word, i) => <mesh key={i} name={`${kind}-caption-${i}`} renderOrder={40} material={word.material} geometry={word.geometry}
      userData={{ compNoPosition: true }} />)}
  </group>
}
