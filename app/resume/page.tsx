'use client'

import dynamic from 'next/dynamic'
import { usePerformanceMode } from '@/contexts/performance-mode-context'
import LegacyResumePage from './legacy'

// "Always bet on Daniel W Liu": the casino table is WebGPU + TSL through the
// node pipeline; it never renders on the server and never runs in Lite mode.
const CasinoResume = dynamic(
  () => import('@/components/resume/casino/casino-resume'),
  { ssr: false },
)

export default function ResumePage() {
  const { isLowPerformance, isHydrated } = usePerformanceMode()
  if (!isHydrated) return null
  return isLowPerformance ? <LegacyResumePage /> : <CasinoResume />
}
