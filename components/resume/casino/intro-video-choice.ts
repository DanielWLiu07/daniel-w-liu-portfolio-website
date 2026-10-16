import { INTRO_VIDEOS, type IntroVideoCut } from './startup-assets'
import { casinoViewport } from './responsive-layout'

/**
 * The take for this window: the closest shape. The scene is cropped to the
 * take's aspect until the window changes (see frameAspect), so beyond 1.2x
 * either way that crop would lose too much of the table. Never across the
 * scene's portrait switch, and not for short (landscape phone) windows, which
 * lay the title out differently.
 */
export function introVideoFor(width: number, height: number): IntroVideoCut | null {
  const view = casinoViewport(width, height)
  if (view.short) return null
  let best: IntroVideoCut | null = null
  for (const take of INTRO_VIDEOS) {
    if (casinoViewport(take.aspect * 1000, 1000).portrait !== view.portrait) continue
    const off = Math.abs(Math.log(view.aspect / take.aspect))
    if (off <= Math.log(1.2) && (!best || off < Math.abs(Math.log(view.aspect / best.aspect)))) best = take
  }
  return best
}

export const introVideoForWindow = () => introVideoFor(window.innerWidth, window.innerHeight)

/** The take to play: this window's, or with ?introVideo=1 on an unlisted shape, the desktop one. */
export const introVideoTake = () => introVideoForWindow() ?? INTRO_VIDEOS[0]

/** Whether /resume opens on the intro video (see intro-video.tsx). */
export function wantsIntroVideo(search: string) {
  const q = new URLSearchParams(search).get('introVideo')
  if (q === '0') return false
  if (q === '1') return true
  return introVideoForWindow() !== null
}
