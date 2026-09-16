'use client'

import dynamic from 'next/dynamic'
import { preload } from 'react-dom'
import { CASINO_STARTUP_IMAGES, JACK_FONTS } from '@/components/resume/casino/startup-assets'
import { loadCasinoFont } from '@/components/resume/casino/font-loader'
import { usePerformanceMode } from '@/contexts/performance-mode-context'
// The video page's components are not needed to boot the 3D scene.
const LegacyResumePage = dynamic(() => import('./legacy'), { ssr: false })

// "Always bet on Daniel W Liu": the casino table is WebGPU + TSL through the
// node pipeline; it never renders on the server and never runs in Lite mode.
const CasinoResume = dynamic(
  () => import('@/components/resume/casino/casino-resume'),
  { ssr: false },
)

export default function ResumePage() {
  const { isLowPerformance, isHydrated } = usePerformanceMode()
  if (!isHydrated) return null
  // Start before the large scene chunk/device initializes. Match TextureLoader's
  // anonymous CORS mode so the browser consumes the preload, not a second fetch.
  // Lite users download none of this, and image hints do not outrank scene JS.
  if (!isLowPerformance) {
    for (const url of CASINO_STARTUP_IMAGES) preload(url, { as: 'image', crossOrigin: 'anonymous', fetchPriority: 'low' })
    for (const { key, url } of JACK_FONTS) void loadCasinoFont(key, url).catch(() => {})
  }
  return isLowPerformance ? <LegacyResumePage /> : <CasinoResume />
}
