// The front door for cloud-rendered visits (see experiments/pixel-stream/ARCHITECTURE.md).
//   GET /api/stream/seat         → { url, reason }: stream from url, or render locally (url null)
//   GET /api/stream/seat?wake=1  → same bookkeeping, no seat: the site-entry heartbeat that
//                                   starts a server early so it is warm by the time a visitor
//                                   reaches /resume
// Either way, servers are started when warm seats run low. Never throws at the visitor:
// any failure answers "render locally".
import { decide, fleetFromEnv, readPool } from '@/lib/stream/fleet'

export async function GET(request: Request) {
  const wake = new URL(request.url).searchParams.has('wake')
  const configured = fleetFromEnv()
  if (!configured) return Response.json({ url: null, reason: 'off' }, { headers: { 'cache-control': 'no-store' } })
  try {
    const { fleet, opts } = configured
    const listed = await fleet.list()
    const servers = await Promise.all(listed.map(async (s) => ({ ...s, pool: s.state === 'running' && s.url ? await readPool(s.url) : null })))
    const decision = decide(servers, opts, { claiming: !wake })
    if (decision.start.length) {
      console.info(`[stream] starting ${decision.start.join(', ')} (${decision.reason})`)
      // A Spot server AWS stopped for capacity can refuse to start; the visitor
      // still renders locally, and the next request tries again.
      await fleet.start(decision.start).catch((err) => console.warn('[stream] start failed:', err?.message ?? err))
    }
    return Response.json(wake ? { reason: decision.reason } : { url: decision.url, reason: decision.reason }, { headers: { 'cache-control': 'no-store' } })
  } catch (err) {
    console.warn('[stream] front door error:', err instanceof Error ? err.message : err)
    return Response.json({ url: null, reason: 'error' }, { headers: { 'cache-control': 'no-store' } })
  }
}
