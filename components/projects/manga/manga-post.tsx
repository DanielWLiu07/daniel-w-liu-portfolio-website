'use client'

/**
 * The projects page's print pass: the manga GRAPH, run by the compositor.
 *
 * This used to call createMangaPost, the hand-written TSL primitive. It runs the
 * compositor graph instead, for the reason the library's own compositor doc
 * gives for having the domain at all: a hand-written pass "is honest but opaque
 * and not portable", while as a graph the same effect is inspectable, diffable,
 * evaluable without a GPU and able to round-trip to a .blend. Concretely that
 * bought a bug: the graph's nesting is covered by a CPU test, and running that
 * test against the old band-select found 144 pixel-steps out of 8064 where ink
 * DISAPPEARED as tone got darker.
 *
 * See it as a node diagram: `npm run graph -- comp:manga` in the library, or
 * viewer.html?graph=comp:manga.
 *
 * Nothing recompiles while you scroll. The graph is built ONCE on mount and the
 * app drives Compositor.uniforms[name].value after that, which is the rule the
 * library states plainly: "the graph itself never changes at runtime".
 */
import { useEffect, useRef, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Compositor, compGraph, mangaGraph } from 'blender-to-threejs'

export interface MangaKnobs {
  /** 0..1, heavier blacks, crosshatch and grain */
  grit: number
  /** 0..1, every pixel to ink: the page transition */
  collapse: number
}

export default function MangaPost({
  knobs,
  onReady,
}: {
  knobs: MutableRefObject<MangaKnobs>
  onReady?: () => void
}) {
  const { gl, scene, camera } = useThree()
  const comp = useRef<Compositor | null>(null)
  const ready = useRef(false)

  useEffect(() => {
    const c = compGraph()
    const out = mangaGraph(c, { dotScale: 4, hatchScale: 3.4 })
    const instance = new Compositor(gl as never, scene, camera, out)
    comp.current = instance
    return () => {
      instance.dispose()
      comp.current = null
    }
  }, [gl, scene, camera])

  // priority > 0 hands rendering over from r3f: the compositor owns the frame
  useFrame(() => {
    const c = comp.current
    if (!c) return
    const k = knobs.current
    if (c.uniforms.grit) c.uniforms.grit.value = k.grit
    if (c.uniforms.collapse) c.uniforms.collapse.value = k.collapse
    c.render()
    if (!ready.current) {
      ready.current = true
      onReady?.()
    }
  }, 1)

  return null
}
