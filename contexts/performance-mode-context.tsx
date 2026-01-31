'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { usePathname } from 'next/navigation'

type PerformanceMode = 'high' | 'low' | null

interface PerformanceModeContextType {
  mode: PerformanceMode
  setMode: (mode: 'high' | 'low') => void
  resetMode: () => void
  isLowPerformance: boolean
  isHydrated: boolean
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
  const pathname = usePathname()

  // Always start with null to avoid hydration mismatch
  const [mode, setModeState] = useState<PerformanceMode>(null)
  const [isHydrated, setIsHydrated] = useState(false)

  // After hydration, restore mode from localStorage for non-home pages
  // Home page always shows quality selector first
  useEffect(() => {
    const stored = getStoredMode()
    const isHomePage = pathname === '/'

    // Only restore mode for non-home pages
    // This ensures home always shows quality selector, but other pages work correctly
    if (stored !== null && !isHomePage) {
      setModeState(stored)
    }

    setIsHydrated(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // Note: pathname intentionally excluded - we only check on initial mount

  // Sync to localStorage when mode changes
  useEffect(() => {
    if (!isHydrated) return
    if (mode === null) {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, mode)
    }
  }, [mode, isHydrated])

  const setMode = (newMode: 'high' | 'low') => {
    setModeState(newMode)
  }

  const resetMode = () => {
    setModeState(null)
  }

  return (
    <PerformanceModeContext.Provider value={{
      mode,
      setMode,
      resetMode,
      isLowPerformance: mode === 'low',
      isHydrated
    }}>
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
