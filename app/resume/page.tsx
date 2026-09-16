'use client'

import dynamic from 'next/dynamic'
import { preload } from 'react-dom'
import { CASINO_STARTUP_IMAGES, JACK_FONTS } from '@/components/resume/casino/startup-assets'
import { SKELETON_DEALER_URL, FOLDER_URL } from '@/components/resume/casino/model-urls'
import { loadCasinoFont } from '@/components/resume/casino/font-loader'
import { usePerformanceMode } from '@/contexts/performance-mode-context'
// The video page's components are not needed to boot the 3D scene.
const LegacyResumePage = dynamic(() => import('./legacy'), { ssr: false })

// "Always bet on Daniel W Liu": the casino table is WebGPU + TSL through the
// node pipeline; it never renders on the server and never runs in Lite mode.
const loadCasinoResume = () => import('@/components/resume/casino/casino-resume')
const CasinoResume = dynamic(loadCasinoResume, { ssr: false })

export default function ResumePage() {
  const { isLowPerformance, isHydrated } = usePerformanceMode()
  if (!isHydrated) return null
  // Start before the large scene chunk/device initializes. Match TextureLoader's
  // anonymous CORS mode so the browser consumes the preload, not a second fetch.
  // Lite users download none of this, and image hints do not outrank scene JS.
  if (!isLowPerformance) {
    // Queue critical scene code before low-priority model/image hints compete
    // for bandwidth. The dynamic component consumes this same import promise.
    void loadCasinoResume().catch(() => {})
    for (const url of [SKELETON_DEALER_URL, FOLDER_URL]) preload(url, { as: 'fetch', crossOrigin: 'anonymous', fetchPriority: 'low' })
    for (const url of CASINO_STARTUP_IMAGES) preload(url, { as: 'image', crossOrigin: 'anonymous', fetchPriority: 'low' })
    for (const { key, url } of JACK_FONTS) void loadCasinoFont(key, url).catch(() => {})
  }
  return isLowPerformance ? <LegacyResumePage /> : <CasinoResume />
}
