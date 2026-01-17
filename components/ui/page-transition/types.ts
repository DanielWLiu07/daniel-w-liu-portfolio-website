export type OverlayState = 'hidden' | 'covering' | 'loading' | 'revealing'

export interface TransitionContextType {
  transitionStage: OverlayState
  signalReady: () => void
  isRevealed: boolean
  triggerCover: () => void
  navigateWithTransition: (href: string, onBeforeReveal?: () => void) => void
  onRevealSvgReady: (callback: () => void) => void
}
