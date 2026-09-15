/** Loading readiness and the transition cover are separate gates. */
export function canStartCasinoIntro(sceneReady: boolean, transitionStage: string) {
  return sceneReady && (transitionStage === 'revealing' || transitionStage === 'hidden')
}
