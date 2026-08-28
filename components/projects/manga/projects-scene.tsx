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
import { Suspense, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { projects } from '@/data/projects'
import { cardMaterial, edgeMaterial, groundMaterial } from './materials'
import { hatchMaterial } from './hatch-material'
import { Spaceship } from './spaceship'
import { ease, slice, type ScrollState } from './scroll'
import type { MangaKnobs } from './manga-post'

/** how far apart the projects sit along the track, in world units */
const GAP = 4.6
/** the card's own proportions: chunky, with real thickness, because sobel needs a silhouette */
const CARD = { w: 2.1, h: 2.8, d: 0.22 }
/** how far the camera sits in front of the card it is looking at (see the fit note in useFrame) */
const STAND_OFF = 5.2
/**
 * The subject's diameter, and where it floats.
 *
 * Both solved rather than picked. At z = 1.5 the camera is 3.7 away, and fov 42
 * gives 2 * 3.7 * tan(21 deg) = 2.84 of view height there, so 2.2 leaves margin
 * at every angle of the spin. It also puts the subject's own back at z = 0.4,
 * clear of the card face at 0.15: a subject that turns THROUGH the card it
 * belongs to is the sort of thing a still frame hides and the first scroll finds.
 */
const SUBJECT_SIZE = 2.2
const SUBJECT_Z = 1.5
/** radians per second the subject turns, so the hatch is seen to sweep and not just sit */
const SPIN = 0.22

/**
 * A project as a solid: a slab with a recessed face, not a plane. Flat geometry
 * gives the ink pass nothing but its own border, so the cards carry real
 * thickness and a lip, and the pass finds edges to draw.
 */
function ProjectCard({
  index,
  stock,
  edge,
  ball,
}: {
  index: number
  stock: THREE.Material
  edge: THREE.Material
  ball: boolean
}) {
  const geo = useMemo(() => new THREE.BoxGeometry(CARD.w, CARD.h, CARD.d), [])
  const faceGeo = useMemo(() => new THREE.BoxGeometry(CARD.w * 0.86, CARD.h * 0.86, CARD.d * 0.5), [])
  // The fallback subject, and the reason a curved one is needed at all: a
  // hatching shader is a function of how a surface turns, so a flat panel facing
  // the key is the one shape that shows none of it. The card's own face came out
  // at tone 0.81, above every hatch window, and printed blank.
  const sphere = useMemo(() => new THREE.SphereGeometry(SUBJECT_SIZE * 0.42, 48, 32), [])
  const spin = useRef<THREE.Group>(null)

  // Turning, because a still frame cannot tell you whether the hatch is GLUED to
  // the surface or swimming across it, and that is the single thing most likely
  // to be wrong in a ported hatching shader. Offset per card so two ships in
  // frame are never at the same angle.
  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.y += dt * SPIN
  })

  return (
    <group position={[0, 0, -index * GAP]} name={`project-${index}`}>
      <mesh geometry={geo} material={edge} />
      <mesh geometry={faceGeo} material={stock} position={[0, 0, CARD.d * 0.42]} />
      {/* tilted so the deck faces the camera: the ship is wide and flat, and
          edge on it is a line with nowhere for the hatch to land */}
      <group ref={spin} position={[0, 0, SUBJECT_Z]} rotation={[-0.3, index * 0.7, 0]}>
        {ball ? (
          <mesh geometry={sphere} material={stock} />
        ) : (
          // its OWN boundary: when a loader suspends inside a shared one, r3f
          // hides the whole subtree, and the print pass is a sibling
          <Suspense fallback={<mesh geometry={sphere} material={stock} />}>
            <Spaceship size={SUBJECT_SIZE} material={stock} />
          </Suspense>
        )}
      </group>
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
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
  const useHatch = params.has('hatch')
  // ?ball puts the sphere back. Comparing two shaders means holding the subject
  // fixed, and sometimes the fixed subject should be the boring one.
  const ball = params.has('ball')
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
        <ProjectCard key={proj.id} index={i} stock={stock} edge={edge} ball={ball} />
      ))}
    </group>
  )
}
