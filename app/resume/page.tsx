'use client'

import dynamic from 'next/dynamic'
import type { ComponentType } from 'react'
import { preload } from 'react-dom'
import { CASINO_STARTUP_IMAGES, JACK_FONTS } from '@/components/resume/casino/startup-assets'
import { SKELETON_DEALER_URL, FOLDER_URL } from '@/components/resume/casino/model-urls'
import { loadCasinoFont } from '@/components/resume/casino/font-loader'
import { usePerformanceMode } from '@/contexts/performance-mode-context'
import { alwaysStreamed, isWeakDevice, wantsStream } from '@/components/resume/stream/stream-config'
import type { LocalControl } from '@/components/resume/stream/stream-session'
// The video page's components are not needed to boot the 3D scene.
const LegacyResumePage = dynamic(() => import('./legacy'), { ssr: false })

// "Always bet on Daniel W Liu": the casino table is WebGPU + TSL through the
// node pipeline; it never renders on the server and never runs in Lite mode.
const loadCasinoResume = () => import('@/components/resume/casino/casino-resume')
const CasinoResume = dynamic(loadCasinoResume, { ssr: false })
// The same casino streamed from a GPU render server first, handing off to the
// local one (see components/resume/stream). Off unless NEXT_PUBLIC_STREAM_MODE is set.
const StreamSession = dynamic(() => import('@/components/resume/stream/stream-session'), { ssr: false })
// Lite visitors who ask for the stream fall back to their video page, not the casino.
const LiteLocal: ComponentType<Partial<LocalControl>> = () => <LegacyResumePage />

// Start before the large scene chunk/device initializes. Match TextureLoader's
// anonymous CORS mode so the browser consumes the preload, not a second fetch.
// Image hints do not outrank scene JS.
function preloadCasino() {
  // Queue critical scene code before low-priority model/image hints compete
  // for bandwidth. The dynamic component consumes this same import promise.
  void loadCasinoResume().catch(() => {})
  for (const url of [SKELETON_DEALER_URL, FOLDER_URL]) preload(url, { as: 'fetch', crossOrigin: 'anonymous', fetchPriority: 'low' })
  for (const url of CASINO_STARTUP_IMAGES) preload(url, { as: 'image', crossOrigin: 'anonymous', fetchPriority: 'low' })
  for (const { key, url } of JACK_FONTS) void loadCasinoFont(key, url).catch(() => {})
}

export default function ResumePage() {
  const { isLowPerformance, isHydrated } = usePerformanceMode()
  if (!isHydrated) return null
  const search = window.location.search
  // Lite visitors keep the video page unless they explicitly ask for the stream.
  const streamed = wantsStream(search, navigator) && (!isLowPerformance || new URLSearchParams(search).get('stream') === '1')
  if (streamed) {
    // Capable devices download the local casino in parallel and hand off to it;
    // weak ones stay streamed and only load it if the stream can't continue.
    // ?stream=1 keeps any device on the stream, like a weak one.
    const capable = !isLowPerformance && !isWeakDevice(navigator, search) && !alwaysStreamed(search)
    if (capable) preloadCasino()
    return <StreamSession capable={capable} Local={isLowPerformance ? LiteLocal : CasinoResume} />
  }
  // Lite users download none of this.
  if (!isLowPerformance) preloadCasino()
  return isLowPerformance ? <LegacyResumePage /> : <CasinoResume />
}
