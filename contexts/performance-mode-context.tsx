'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

type PerformanceMode = 'high' | 'low' | null

interface PerformanceModeContextType {
  mode: PerformanceMode
  setMode: (mode: 'high' | 'low') => void
  resetMode: () => void
  isLowPerformance: boolean
}

const PerformanceModeContext = createContext<PerformanceModeContextType | undefined>(undefined)

const STORAGE_KEY = 'performance-mode'

export function PerformanceModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<PerformanceMode>(null)
  const [isHydrated, setIsHydrated] = useState(false)

  // Load mode from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'high' || stored === 'low') {
      setModeState(stored)
    }
    setIsHydrated(true)
  }, [])

  const setMode = (newMode: 'high' | 'low') => {
    setModeState(newMode)
    localStorage.setItem(STORAGE_KEY, newMode)
  }

  const resetMode = () => {
    setModeState(null)
    localStorage.removeItem(STORAGE_KEY)
  }

  // Prevent flash of wrong content during hydration
  if (!isHydrated) {
    return null
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
