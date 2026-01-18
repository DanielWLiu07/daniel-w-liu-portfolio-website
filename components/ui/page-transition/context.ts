'use client'

import { createContext, useContext } from 'react'
import type { TransitionContextType } from './types'

export const TransitionContext = createContext<TransitionContextType>({
  transitionStage: 'hidden',
  signalReady: () => {},
  isRevealed: true,
  triggerCover: () => {},
  navigateWithTransition: () => {}
})

export function useTransitionState() {
  return useContext(TransitionContext)
}
