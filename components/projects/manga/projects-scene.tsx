'use client'

/**
 * The projects scene: one Three scene holding every project, with scroll moving
 * the camera through it.
 *
 * ONE scene rather than a scene per project, deliberately. The print pass works
 * on the frame, so anything sharing the frame shares the look for free, and a
 * transition between two projects becomes a camera move plus a uniform instead
 * of tearing down and rebuilding a renderer. It also means a project entering
 * and the one leaving are lit, shaded and printed by exactly the same thing,
 * which is what makes a section read as continuous rather than as slides.
 */
import { useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { projects } from '@/data/projects'
import { cardMaterial, edgeMaterial, groundMaterial } from './materials'
import { hatchMaterial } from './hatch-material'
import { ease, slice, type ScrollState } from './scroll'
import type { MangaKnobs } from './manga-post'

/** how far apart the projects sit along the track, in world units */
const GAP = 4.6
/** the card's own proportions: chunky, with real thickness, because sobel needs a silhouette */
const CARD = { w: 2.1, h: 2.8, d: 0.22 }
/** how far the camera sits in front of the card it is looking at (see the fit note in useFrame) */
const STAND_OFF = 5.2

/**
 * A project as a solid: a slab with a recessed face, not a plane. Flat geometry
 * gives the ink pass nothing but its own border, so the cards carry real
 * thickness and a lip, and the pass finds edges to draw.
 */
function ProjectCard({
  index,
  stock,
  edge,
}: {
  index: number
  stock: THREE.Material
  edge: THREE.Material
}) {
  const geo = useMemo(() => new THREE.BoxGeometry(CARD.w, CARD.h, CARD.d), [])
  const faceGeo = useMemo(() => new THREE.BoxGeometry(CARD.w * 0.86, CARD.h * 0.86, CARD.d * 0.5), [])
  // A CURVED subject in front of the card. A hatching shader is a function of
  // how a surface turns, so a flat panel facing the key is the one shape that
  // shows none of it: the card's face came out at tone 0.81, above every hatch
  // window, and printed blank. A sphere sweeps the whole tonal range in one
  // object, which is why Blender's own shader scenes are balls and busts.
  const subject = useMemo(() => new THREE.SphereGeometry(CARD.w * 0.34, 48, 32), [])
  return (
    <group position={[0, 0, -index * GAP]} name={`project-${index}`}>
      <mesh geometry={geo} material={edge} />
      <mesh geometry={faceGeo} material={stock} position={[0, 0, CARD.d * 0.42]} />
      <mesh geometry={subject} material={stock} position={[0, 0, CARD.d * 0.42 + CARD.w * 0.34]} />
    </group>
  )
}

export default function ProjectsScene({
  scroll,
  knobs,
}: {
  scroll: MutableRefObject<ScrollState>
  knobs: MutableRefObject<MangaKnobs>
}) {
  // ?hatch swaps the flat card stock for his Blender cross-hatching shader,
  // rebuilt through the ported nodes. Behind a switch because the two hatch
  // frequencies (this one, glued to the surface, and the print pass's, locked to
  // the screen) can beat against each other and that is worth SEEING rather
  // than being argued about.
  const useHatch = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('hatch')
  const stock = useMemo(() => (useHatch ? hatchMaterial() : cardMaterial()), [useHatch])
  const edge = useMemo(() => (useHatch ? hatchMaterial({ hatchA: 8, hatchB: 8 }) : edgeMaterial()), [useHatch])
  const ground = useMemo(() => groundMaterial(), [])
  const rig = useRef<THREE.Group>(null)
  const n = projects.length

  useFrame(({ camera }) => {
    const p = scroll.current.progress
    // Where on the track we are, then the camera sits a fixed distance IN FRONT
    // of that and looks back at it. Solved rather than picked: a card is 2.8
    // tall, so at fov 42 it needs 1.4 / tan(21 deg) = 3.65 units to fit at all,
    // and STAND_OFF leaves margin around it.
    const track = -ease(p) * (n - 1) * GAP
    camera.position.set(0, 0.45, track + STAND_OFF)
    camera.lookAt(0, 0, track)

    // The section wipe is OFF while the shader is being judged.
    //
    // It was on, and it opened the page fully collapsed to ink: at scroll 0 the
    // local position within a section is exactly 0, which the boundary measure
    // reads as "on a boundary", so collapse came out at 1 before you had
    // scrolled anything. Every capture I took scrolled first, so I never saw it
    // and went hunting through WebGPU flags and MSAA instead. If this comes
    // back, the boundary has to exclude the page's own start and end, which are
    // not transitions between anything.
    knobs.current.collapse = 0
    knobs.current.grit = 0.26 + 0.28 * ease(slice(p, [0, 0.6]))
    if (rig.current) rig.current.rotation.y = Math.sin(p * Math.PI * 2) * 0.05
  })

  return (
    <group ref={rig}>
      {/* the ground reads as halftone rather than blank paper, which gives the
          cards something to sit against in the print */}
      <mesh material={ground} rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.1, -((n - 1) * GAP) / 2]}>
        <planeGeometry args={[24, (n + 2) * GAP]} />
      </mesh>
      {projects.map((proj, i) => (
        <ProjectCard key={proj.id} index={i} stock={stock} edge={edge} />
      ))}
    </group>
  )
}
