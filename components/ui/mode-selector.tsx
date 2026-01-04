'use client'

import localFont from 'next/font/local'
import { usePerformanceMode } from '@/contexts/performance-mode-context'
import Image from 'next/image'

const weddingDay = localFont({
  src: '../../public/shared/fonts/weddingday-font/ancient-wedding-font/AncientWeddingDemoRegular-MAm1n.ttf',
})

import { useState } from 'react'

export function ModeSelector() {
  const { mode, setMode } = usePerformanceMode()
  const [isExiting, setIsExiting] = useState(false)

  const handleModeSelect = (selectedMode: 'high' | 'low') => {
    setIsExiting(true)
    setTimeout(() => {
      setMode(selectedMode)
    }, 800)
  }

  if (mode !== null) return null

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col items-center justify-center gap-8 p-8">
      <div className={`relative z-10 flex flex-col items-center gap-8 transition-all duration-700 ${isExiting ? 'translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}>
        <h1 className={`text-6xl sm:text-7xl text-black text-center mb-4 ${weddingDay.className}`}>
          Choose Your Experience
        </h1>

        <div className="flex flex-col sm:flex-row gap-6 w-full max-w-2xl">
          <button
            onClick={() => handleModeSelect('high')}
            className={`flex-1 bg-black hover:bg-gray-800 text-white p-8 border-4 border-black transition-all duration-300 hover:scale-105 ${weddingDay.className}`}
          >
            <div className="text-4xl mb-3">High Quality</div>
            <div className="text-xl opacity-90">(Desktop, Full Animations)</div>
          </button>

          <button
            onClick={() => handleModeSelect('low')}
            className={`flex-1 bg-white hover:bg-gray-100 text-black p-8 border-4 border-black transition-all duration-300 hover:scale-105 ${weddingDay.className}`}
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
