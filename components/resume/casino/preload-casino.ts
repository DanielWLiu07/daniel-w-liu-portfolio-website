import { preload } from 'react-dom'
import { CASINO_AFTER_INTRO_IMAGES, CASINO_STARTUP_IMAGES, INTRO_VIDEO, JACK_FONTS, PAPER_TEXTURE_URL, paperRecordingUrl } from './startup-assets'
import { SKELETON_DEALER_URL, FOLDER_URL } from './model-urls'
import { loadCasinoFont } from './font-loader'
import { wantsIntroVideo } from './intro-video-choice'
import { wantsStream } from '@/components/resume/stream/stream-config'

/** The scene's code. /resume's dynamic component consumes this same promise. */
export const loadCasinoResume = () => import('./casino-resume')

/** Everything the casino fetches before its intro can start. */
function startupUrls(): string[] {
  const portrait = window.innerWidth / Math.max(1, window.innerHeight) < .9
  // Desktop shapes open on the intro video and start the scene after the intro.
  const video = !wantsStream('', navigator) && wantsIntroVideo('')
  return [
    ...(video ? [INTRO_VIDEO.poster, INTRO_VIDEO.src] : []),
    SKELETON_DEALER_URL,
    ...JACK_FONTS.map(font => font.url),
    FOLDER_URL,
    ...(video ? CASINO_AFTER_INTRO_IMAGES : CASINO_STARTUP_IMAGES),
    PAPER_TEXTURE_URL,
    ...(video ? [] : [paperRecordingUrl(portrait)]),
  ]
}

/**
 * On /resume itself: start before the large scene chunk/device initializes.
 * Match TextureLoader's anonymous CORS mode so the browser consumes the
 * preload, not a second fetch. Image hints do not outrank scene JS.
 */
export function preloadCasino({ afterIntro = false }: { afterIntro?: boolean } = {}) {
  // Queue critical scene code before low-priority model/image hints compete
  // for bandwidth.
  void loadCasinoResume().catch(() => {})
  for (const url of [SKELETON_DEALER_URL, FOLDER_URL]) preload(url, { as: 'fetch', crossOrigin: 'anonymous', fetchPriority: 'low' })
  for (const url of afterIntro ? CASINO_AFTER_INTRO_IMAGES : CASINO_STARTUP_IMAGES) preload(url, { as: 'image', crossOrigin: 'anonymous', fetchPriority: 'low' })
  preload(PAPER_TEXTURE_URL, { as: 'image', crossOrigin: 'anonymous', fetchPriority: 'low' })
  for (const { key, url } of JACK_FONTS) void loadCasinoFont(key, url).catch(() => {})
}

/** The page's own videos come first: wait while any of them is still downloading. */
async function pageMediaSettled(signal: AbortSignal) {
  const loading = () => [...document.querySelectorAll('video')].some(video =>
    video.networkState === HTMLMediaElement.NETWORK_LOADING && video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA)
  while (!signal.aborted && loading()) await new Promise(resolve => setTimeout(resolve, 1000))
}

/**
 * From any other page, while the visitor reads it: pull the casino's files
 * into the HTTP cache (long-lived, see next.config headers) a few at a time at
 * low priority, then its code, so /resume later starts from cache. Fetching
 * only fills the cache: nothing here registers fonts, decodes, or touches the GPU.
 */
export async function prefetchCasinoInBackground(signal: AbortSignal) {
  const queue = startupUrls()
  const worker = async () => {
    for (let url = queue.shift(); url && !signal.aborted; url = queue.shift()) {
      await pageMediaSettled(signal)
      await fetch(url, { priority: 'low', signal }).then(r => r.arrayBuffer()).catch(() => {})
    }
  }
  await Promise.all([worker(), worker(), worker()])
  if (!signal.aborted) await loadCasinoResume().catch(() => {})
}
