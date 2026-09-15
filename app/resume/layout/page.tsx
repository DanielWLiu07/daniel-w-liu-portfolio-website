'use client'

import dynamic from 'next/dynamic'

const CasinoResume = dynamic(() => import('@/components/resume/casino/casino-resume'), { ssr: false })

/** A focused placement workspace; no title, flight or material tuning panels. */
export default function CasinoLayoutPage() {
  return <CasinoResume layoutTuning />
}
