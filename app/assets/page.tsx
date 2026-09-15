'use client'

/**
 * /assets: the casino pieces on one sheet, so a new one can be judged next to
 * the ones already there.
 *
 * ?still   stop the turntable
 * ?comp=   which compositor graph to print through (night, watercolor, plain)
 * ?mesh    use the Meshy-generated chip geometry instead of the UV-drawn cylinder
 */
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const AssetsStage = dynamic(() => import('@/components/resume/casino/assets-stage'), { ssr: false })

export default function AssetsPage() {
  const [q, setQ] = useState<URLSearchParams | null>(null)
  useEffect(() => {
    setQ(new URLSearchParams(window.location.search))
  }, [])
  if (!q) return null
  return <AssetsStage comp={q.get('comp') ?? 'night'} spin={!q.has('still')} mesh={q.has('mesh')} />
}
