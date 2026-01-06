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
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-8">
      <div className={`relative z-10 flex flex-col gap-4 transition-all duration-700 ${isExiting ? 'translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={false}
            onChange={() => handleModeSelect('high')}
            className="w-6 h-6 cursor-pointer"
          />
          <span className={`text-2xl text-black ${weddingDay.className}`}>High Quality</span>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={false}
            onChange={() => handleModeSelect('low')}
            className="w-6 h-6 cursor-pointer"
          />
          <span className={`text-2xl text-black ${weddingDay.className}`}>Low Quality</span>
        </label>
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
