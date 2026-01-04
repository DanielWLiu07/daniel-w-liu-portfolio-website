'use client'

import localFont from 'next/font/local'
import { usePerformanceMode } from '@/contexts/performance-mode-context'
import Image from 'next/image'

const weddingDay = localFont({
  src: '../../public/shared/fonts/weddingday-font/ancient-wedding-font/AncientWeddingDemoRegular-MAm1n.ttf',
})

export function ModeSelector() {
  const { mode, setMode, resetMode } = usePerformanceMode()

  if (mode !== null) return null

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col items-center justify-center gap-8 p-8">
      <div className="absolute inset-0">
        <Image src="/landing/images/white_paper.png" alt="white paper background" fill className="object-cover" priority />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-8">
        <h1 className={`text-5xl sm:text-6xl text-black text-center mb-4 ${weddingDay.className}`}>
          Choose Your Experience
        </h1>

        <div className="flex flex-col sm:flex-row gap-6 w-full max-w-2xl">
          <button
            onClick={() => setMode('high')}
            className={`flex-1 bg-gradient-to-br from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white p-8 rounded-2xl transition-all duration-300 hover:scale-105 ${weddingDay.className}`}
          >
            <div className="text-4xl mb-3">High Quality</div>
            <div className="text-xl opacity-90">(Desktop, Full Animations)</div>
          </button>

          <button
            onClick={() => setMode('low')}
            className={`flex-1 bg-gradient-to-br from-green-600 to-teal-600 hover:from-green-500 hover:to-teal-500 text-white p-8 rounded-2xl transition-all duration-300 hover:scale-105 ${weddingDay.className}`}
          >
            <div className="text-4xl mb-3">Low Resource</div>
            <div className="text-xl opacity-90">(Mobile, Faster Loading)</div>
          </button>
        </div>
      </div>
    </div>
  )
}

export function ModeResetButton() {
  const { resetMode } = usePerformanceMode()

  return (
    <button
      onClick={resetMode}
      className={`text-sm text-gray-600 hover:text-gray-800 underline ${weddingDay.className}`}
    >
      Change Quality Settings
    </button>
  )
}
