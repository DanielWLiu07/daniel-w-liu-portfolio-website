'use client'

/**
 * /eye: the drawn eye opening, and watching the pointer.
 *
 * ?n=       how many eyes (default 14)
 * ?still    hold it
 * ?scrub=   hold it at a time in seconds, to look at one instant of the opening
 * ?comp=    which compositor graph to print through (night, watercolor, plain)
 */
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const EyeStage = dynamic(() => import('@/components/resume/casino/eye-stage'), { ssr: false })

export default function EyePage() {
  const [q, setQ] = useState<URLSearchParams | null>(null)
  useEffect(() => {
    setQ(new URLSearchParams(window.location.search))
  }, [])
  if (!q) return null
  const scrub = q.get('scrub')
  const n = q.get('n')
  return (
    <EyeStage
      comp={q.get('comp') ?? 'night'}
      paused={q.has('still')}
      scrub={scrub === null ? undefined : Number(scrub)}
      count={n ? Math.max(1, Math.min(60, Number(n))) : 14}
    />
  )
}
