'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

type PerformanceMode = 'high' | 'low' | null

interface PerformanceModeContextType {
  mode: PerformanceMode
  setMode: (mode: 'high' | 'low') => void
  resetMode: () => void
  isLowPerformance: boolean
}

const PerformanceModeContext = createContext<PerformanceModeContextType | undefined>(undefined)

export function PerformanceModeProvider({ children }: { children: ReactNode }) {
  // Mode starts as null on every fresh page load (quality selector shows)
  // Mode persists during session via React state (navigation doesn't reset it)
  const [mode, setModeState] = useState<PerformanceMode>(null)

  const setMode = (newMode: 'high' | 'low') => {
    setModeState(newMode)
  }

  const resetMode = () => {
    setModeState(null)
  }

  return (
    <PerformanceModeContext.Provider value={{ mode, setMode, resetMode, isLowPerformance: mode === 'low' }}>
      {children}
    </PerformanceModeContext.Provider>
  )
}

export function usePerformanceMode() {
  const context = useContext(PerformanceModeContext)
  if (context === undefined) {
    throw new Error('usePerformanceMode must be used within a PerformanceModeProvider')
  }
  return context
}
