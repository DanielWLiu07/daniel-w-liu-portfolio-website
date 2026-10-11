import { INTRO_VIDEO } from './startup-assets'

/** Whether /resume opens on the intro video (desktop shapes; see intro-video.tsx). */
export function wantsIntroVideo(search: string) {
  const q = new URLSearchParams(search).get('introVideo')
  if (q === '0') return false
  if (q === '1') return true
  // The scene is cropped to the video's aspect until the window changes (see
  // frameAspect); outside this range that crop would lose too much of the table.
  const aspect = window.innerWidth / Math.max(1, window.innerHeight)
  return aspect >= INTRO_VIDEO.aspect / 1.2 && aspect <= INTRO_VIDEO.aspect * 1.3
}
