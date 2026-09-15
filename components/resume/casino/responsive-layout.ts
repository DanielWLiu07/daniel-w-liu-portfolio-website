/** Crop the set; adapt only its readable/interactive subjects. Desktop is the
 * authored composition, not a stretched version of the phone layout. */
export function casinoViewport(width: number, height: number) {
  const aspect = Math.max(1, width) / Math.max(1, height)
  const titleFit = Math.min(1, aspect / (1500 / 900))
  const portrait = aspect < .9
  return {
    aspect,
    portrait,
    titleFit,
    dealerFit: Math.max(.72, titleFit),
    folderScale: Math.min(1, Math.max(.5, aspect / .78)),
    short: height < 500 && width < 1100,
    // Camera-space offsets for the flight props. Keep them large and cropped,
    // but stagger vertically so their captions don't fight over a narrow strip.
    rouletteY: portrait ? -.2 : 0,
    royalY: portrait ? .28 : 0,
  }
}

export const PORTRAIT_TITLE = [
  { text: 'ALWAYS BET ON', scale: .82, y: 3.85, word: 11, stagger: 0 },
  { text: 'DANIEL', scale: 1.35, y: 3.43, word: 12, stagger: .3 },
  { text: 'W LIU', scale: 1.35, y: 3.03, word: 13, stagger: .5 },
] as const

export const PORTRAIT_JACK_CARRIERS = [
  { x: -.2, y: .38, width: 1.65, roll: .18 },
  { x: .15, y: .26, width: 1.65, roll: -.16 },
  { x: -.18, y: .3, width: 1.65, roll: -.15 },
  { x: .08, y: .35, width: 1.65, roll: .2 },
] as const
