'use client'

import dynamic from 'next/dynamic'
import type { ComponentType } from 'react'
import { loadCasinoResume, preloadCasino } from '@/components/resume/casino/preload-casino'
import { usePerformanceMode } from '@/contexts/performance-mode-context'
import { alwaysStreamed, isWeakDevice, wantsStream } from '@/components/resume/stream/stream-config'
import type { LocalControl } from '@/components/resume/stream/stream-session'
import IntroVideo, { wantsIntroVideo } from '@/components/resume/casino/intro-video'
// The video page's components are not needed to boot the 3D scene.
const LegacyResumePage = dynamic(() => import('./legacy'), { ssr: false })

// "Always bet on Daniel W Liu": the casino table is WebGPU + TSL through the
// node pipeline; it never renders on the server and never runs in Lite mode.
const CasinoResume = dynamic(loadCasinoResume, { ssr: false })
// The same casino streamed from a GPU render server first, handing off to the
// local one (see components/resume/stream). Off unless NEXT_PUBLIC_STREAM_MODE is set.
const StreamSession = dynamic(() => import('@/components/resume/stream/stream-session'), { ssr: false })
// Lite visitors who ask for the stream fall back to their video page, not the casino.
const LiteLocal: ComponentType<Partial<LocalControl>> = () => <LegacyResumePage />

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
  if (isLowPerformance) return <LegacyResumePage />
  // The intro plays as a video while the scene loads (it starts the scene's
  // downloads itself, once the video is playing), then the scene takes over.
  if (wantsIntroVideo(search)) return <IntroVideo Local={CasinoResume} />
  preloadCasino()
  return <CasinoResume />
}
