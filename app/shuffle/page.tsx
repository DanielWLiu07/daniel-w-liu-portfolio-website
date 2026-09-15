'use client'

/**
 * /shuffle: the riffle on its own, so it can be tuned without the table.
 *
 * It is the resume's cards and the resume's lamp, just without the rest of the
 * scene. When it is right it moves into the casino page as-is.
 *
 * Query flags:
 *   ?scrub=<0..1>  freeze the cycle at a point, for looking at one phase
 *   ?paused        hold wherever it is
 *   ?n=<count>     cards in the deck
 *   ?period=<s>    seconds per cycle
 *   ?grid          a reference grid and axes
 *   ?comp=<name>   which of the resume's compositor graphs to print through
 *                  (night, watercolor, plain); default night, the resume's own
 */
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const ShuffleStage = dynamic(() => import('@/components/resume/casino/shuffle-stage'), { ssr: false })

export default function ShufflePage() {
  const [q, setQ] = useState<URLSearchParams | null>(null)
  useEffect(() => {
    setQ(new URLSearchParams(window.location.search))
  }, [])
  if (!q) return null
  const num = (k: string, d: number) => {
    const v = Number(q.get(k))
    return q.has(k) && Number.isFinite(v) ? v : d
  }
  return (
    <ShuffleStage
      scrub={q.has('scrub') ? num('scrub', 0) : undefined}
      paused={q.has('paused')}
      count={num('n', 52)}
      period={num('period', 3.6)}
      grid={q.has('grid')}
      comp={q.get('comp') ?? 'night'}
    />
  )
}
