// Cloud-rendered résumé: whether a visitor starts on the casino streamed from a GPU
// render server (experiments/pixel-stream) and when they hand off to local
// rendering. With NEXT_PUBLIC_STREAM_MODE unset ('off'), /resume is unchanged.

export type StreamMode = 'off' | 'opt-in' | 'weak' | 'all'

const MODES: StreamMode[] = ['off', 'opt-in', 'weak', 'all']

/**
 * - off: never stream
 * - opt-in: only with ?stream=1 (testing on the live site)
 * - weak: devices unlikely to render the casino well, plus ?stream=1
 * - all: everyone starts streamed while a seat is free; capable devices then
 *   hand off to local rendering, weak ones stay streamed
 * ?stream=0 always forces local rendering.
 */
export const STREAM_MODE: StreamMode = MODES.find((m) => m === process.env.NEXT_PUBLIC_STREAM_MODE) ?? 'off'

type DeviceHints = Pick<Navigator, 'hardwareConcurrency'> & { gpu?: unknown; deviceMemory?: number }

/** No WebGPU, little memory, or few cores: the local casino would struggle. */
export function isWeakDevice(nav: DeviceHints, search = ''): boolean {
  const forced = new URLSearchParams(search).get('streamDevice') // testing: weak | strong
  if (forced === 'weak' || forced === 'strong') return forced === 'weak'
  if (!nav.gpu) return true
  if (nav.deviceMemory !== undefined && nav.deviceMemory <= 4) return true
  return nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 4
}

export function wantsStream(search: string, nav: DeviceHints, mode: StreamMode = STREAM_MODE): boolean {
  if (mode === 'off') return false
  const forced = new URLSearchParams(search).get('stream')
  if (forced === '0') return false
  if (forced === '1') return true
  if (mode === 'all') return true
  return mode === 'weak' && isWeakDevice(nav, search)
}

/** Ask the front door for a seat: a stream URL, or null (render locally). */
export async function requestSeat(timeoutMs = 1500): Promise<string | null> {
  try {
    const res = await fetch('/api/stream/seat', { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null
    const body = (await res.json()) as { url?: string | null }
    return typeof body.url === 'string' && body.url ? body.url : null
  } catch {
    return null
  }
}

/** Stable per-browser id: one seat per device (a second tab takes the seat over). */
export function deviceId(): string {
  try {
    let id = localStorage.getItem('ps-device')
    if (!id) localStorage.setItem('ps-device', (id = crypto.randomUUID()))
    return id
  } catch {
    return 'anonymous'
  }
}

export interface HandoffInput {
  /** the local copy has loaded and compiled (held at frame 0) */
  localReady: boolean
  /** whether the streamed intro has started */
  introStarted: boolean
}

/**
 * When a capable device can swap the stream for its own render without anyone
 * noticing: only while the show hasn't started, so local plays it from the top.
 *
 * Not mid-show: the intro's actors are not all pure functions of its clock (some
 * advance frame by frame), so a local scene started N seconds in renders without
 * the table, dealer and title (measured: it never recovers). A device whose local
 * copy isn't ready before the stream's intro begins stays streamed.
 */
export function canHandOff(s: HandoffInput): boolean {
  return s.localReady && !s.introStarted
}
