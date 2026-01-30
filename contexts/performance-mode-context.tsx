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

const STORAGE_KEY = 'portfolio-quality-mode'

function getStoredMode(): PerformanceMode {
  if (typeof window === 'undefined') return null
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'high' || stored === 'low') return stored
  return null
}

export function PerformanceModeProvider({ children }: { children: ReactNode }) {
  // Initialize from localStorage to survive page reloads
  const [mode, setModeState] = useState<PerformanceMode>(() => getStoredMode())

  // Sync to localStorage when mode changes
  useEffect(() => {
    if (mode === null) {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, mode)
    }
  }, [mode])

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
