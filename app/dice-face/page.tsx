'use client'

/**
 * /dice-face?v=N: one die, that face straight on, flat light, no pass.
 *
 * A test rig, not a page. The Meshy dice looked fine in a three-quarter render
 * and turned out to have every face equal to its opposite; the only way to see
 * that is to photograph all six faces square on, so ours gets the same test.
 */
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const FaceRig = dynamic(() => import('@/components/resume/casino/dice-face-rig'), { ssr: false })

export default function DiceFacePage() {
  const [v, setV] = useState<number | null>(null)
  useEffect(() => {
    setV(Number(new URLSearchParams(window.location.search).get('v') ?? 1))
  }, [])
  if (v === null) return null
  return <FaceRig value={v} />
}
