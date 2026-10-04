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
 * ?stream=1 streams in every mode but off, for the whole visit (no handoff);
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

/** ?stream=1: stay on the stream for the whole visit, even on a capable device. */
export function alwaysStreamed(search: string): boolean {
  return new URLSearchParams(search).get('stream') === '1'
}

/**
 * Ask the front door for a seat: a stream URL, or null (render locally). It
 * answers in ~0.2 s warm; the allowance covers a cold serverless start.
 */
export async function requestSeat(device: string, timeoutMs = 2500): Promise<{ url: string; ticket: string } | null> {
  try {
    const res = await fetch(`/api/stream/seat?device=${encodeURIComponent(device)}`, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null
    const body = (await res.json()) as { url?: string | null; ticket?: string }
    return typeof body.url === 'string' && body.url ? { url: body.url, ticket: typeof body.ticket === 'string' ? body.ticket : '' } : null
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
    // Storage blocked: an id for this page only (a shared fallback id would make
    // every such visitor take each other's seat).
    return (pageDevice ??= crypto.randomUUID())
  }
}
let pageDevice: string | undefined

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

/** The longest the streamed show waits for a capable device's local copy. */
export const MAX_LOCAL_GRACE_MS = 4000

/**
 * How long the stream holds the show (on its live opening frame) for the local
 * copy to become ready, so it can take over and free the seat.
 *
 * Only worth it when this device's local copy was fast last time (a cached return
 * visit, ready in ~1–2 s). On a first visit there's no such evidence and the local
 * download rarely finishes in time, so holding would only add a waiting screen:
 * the stream plays at once and the visitor stays streamed.
 *
 * @param lastReadyMs  how long the local copy took to be ready on this device's
 *                     last visit (null: never)
 * @param liveAtMs     how long after arriving the stream went live
 */
export function localGraceMs(lastReadyMs: number | null, liveAtMs: number): number {
  if (lastReadyMs == null || !Number.isFinite(lastReadyMs)) return 0
  const wait = lastReadyMs * 1.25 + 500 - liveAtMs // expected readiness, with margin
  return wait > MAX_LOCAL_GRACE_MS ? 0 : Math.max(0, Math.round(wait))
}

const LAST_READY_KEY = 'ps-local-ready-ms'
export function lastLocalReadyMs(): number | null {
  try { const v = Number(localStorage.getItem(LAST_READY_KEY)); return v > 0 ? v : null } catch { return null }
}
export function rememberLocalReadyMs(ms: number) {
  try { localStorage.setItem(LAST_READY_KEY, String(Math.round(ms))) } catch {}
}
