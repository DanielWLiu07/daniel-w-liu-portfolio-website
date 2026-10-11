// Kept tiny and dependency-free: the intro video player loads it long before the scene.

/**
 * The beat's clock is anchored: whenever it starts, the first armed frame sets
 * the render clock to INTRO_CLOCK0 + the skip, so every actor (beat-relative
 * or absolute, like the paper boil) draws the same thing at the same beat time
 * on every run. That is what lets /resume open on a pre-rendered video of the
 * beat (intro-video.tsx) and cut to the live scene on a matching frame.
 */
export const INTRO_CLOCK0 = 1000
/** by this beat time the intro-only actors (title card, streaks, roulette, card wall) are gone for good */
export const INTRO_ACTORS_DONE = 7.3
let introSkip = 0
let introPinned = false
/** start the beat this many seconds in (where the intro video ends) */
export function setIntroSkip(seconds: number) {
  introSkip = Math.max(0, seconds)
}
export const getIntroSkip = () => introSkip
/**
 * Hold the beat at the skip (render clock pinned, pointer centred, as in the
 * capture) while the scene warms behind the video, so every eased or settling
 * actor arrives where the video's last frame has it. Releasing it lets the
 * beat run on from exactly there.
 */
export function setIntroPinned(pinned: boolean) {
  if (introPinned === pinned) return
  introPinned = pinned
  if (pinned) holdIntroLook()
  else releaseIntroLook()
}
export const introPinnedAt = (): number | null => (introPinned ? INTRO_CLOCK0 + introSkip : null)

/** no intro video: the cursor is followed from the start */
let lookFrom = 0
let looking = true
/**
 * For the intro video's whole life, nothing in the scene turns toward the
 * cursor: the scene is up and drawing behind the video for seconds before the
 * handover, and the video's frames have the dealer and the eyes on their own
 * idle. Anything already aimed at the mouse would jump at the cut.
 */
export function holdIntroLook() {
  looking = false
  lookFrom = Infinity
}
/** Handed over: attention fades in from the cursor's next move, not from wherever it sat. */
export function releaseIntroLook() {
  if (looking) return
  looking = true
  if (typeof window === 'undefined') { lookFrom = 0; return }
  window.addEventListener('pointermove', () => { if (looking) lookFrom = performance.now() }, { once: true, passive: true })
}
/** how long attention to the cursor takes to fade in after the handover */
const LOOK_RAMP_MS = 1400
/**
 * 0..1, how much the cursor may steer the dealer's head and the title eyes:
 * 0 behind the video and after the cut until the mouse moves, then eased in.
 */
export function introLookGain(): number {
  if (introPinned) return 0
  const t = Math.min(1, Math.max(0, (performance.now() - lookFrom) / LOOK_RAMP_MS))
  return t * t * (3 - 2 * t)
}
