export type OverlayState = 'hidden' | 'covering' | 'loading' | 'revealing'

export interface TransitionContextType {
  transitionStage: OverlayState
  signalReady: () => void
  isRevealed: boolean
  navigateWithTransition: (href: string, onBeforeReveal?: () => void) => void
  onIntroStart: (callback: () => void) => void
}
