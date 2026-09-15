'use client'

/**
 * /roulette: the wheel, the ball and the spin.
 *
 * ?table    stand the wheel in its felt table; by default it is the wheel alone
 * ?mesh     use the Meshy generated wheel instead of the drawn one
 * ?still    hold the wheel
 * ?scrub=   hold it at a point in the cycle, 0 to 1, to look at one instant
 * ?comp=    which compositor graph to print through (night, watercolor, plain)
 */
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const RouletteStage = dynamic(() => import('@/components/resume/casino/roulette-stage'), { ssr: false })

export default function RoulettePage() {
  const [q, setQ] = useState<URLSearchParams | null>(null)
  useEffect(() => {
    setQ(new URLSearchParams(window.location.search))
  }, [])
  if (!q) return null
  const scrub = q.get('scrub')
  return (
    <RouletteStage
      comp={q.get('comp') ?? 'night'}
      mesh={q.has('mesh')}
      table={q.has('table')}
      paused={q.has('still')}
      scrub={scrub === null ? undefined : Number(scrub)}
    />
  )
}
