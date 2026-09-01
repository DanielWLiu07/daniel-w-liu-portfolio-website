'use client'

/**
 * /blender-scene: his projects scene, rebuilt from exported data.
 *
 * Geometry from a GLB, materials from the node-graph IR, rig and camera from the
 * same .blend. Nothing on this page was transcribed by hand.
 *
 * ?bg=<colour> paints behind the transparent film; his render is over black.
 * ?all         draws the whole frame-55 scene (moon, sign, starfield, city)
 *              instead of the spaceship on its own.
 */
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const BlenderScene = dynamic(() => import('@/components/projects/manga/blender-scene'), { ssr: false })

export default function BlenderScenePage() {
  const [q, setQ] = useState<URLSearchParams | null>(null)
  useEffect(() => {
    setQ(new URLSearchParams(window.location.search))
  }, [])
  if (!q) return null
  return <BlenderScene background={q.get('bg') ?? '#000000'} only={q.has('all') ? 'all' : 'ship'} />
}
