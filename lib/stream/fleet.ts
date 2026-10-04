// The front door's view of the render servers (experiments/pixel-stream): which
// one a visitor should stream from, and which stopped servers to start so seats
// are warm before they run out. Server-only (AWS credentials).
//
// Every request re-reads the truth (EC2 state + each server's /api/seat), so
// there is no database to keep in sync; the decision itself is a pure function.


export type ServerState = 'running' | 'starting' | 'stopping' | 'stopped'

export interface Pool {
  seats: number
  busy: number
  warm: number
  draining: string | null
}

export interface ServerView {
  id: string
  url: string | null
  state: ServerState
  /** live seat counts; null when not running or not answering */
  pool: Pool | null
}

export interface FleetOptions {
  /** keep at least this many warm seats free; start another server below it */
  minFreeSeats: number
  /** never run more than this many servers at once */
  maxServers: number
  /** seats a server brings once it has started (it can't report while booting) */
  seatsPerServer: number
}

export interface Decision {
  /** stream from here, or null: the visitor renders locally */
  url: string | null
  reason: 'ok' | 'waking' | 'full' | 'none'
  /** stopped servers to start now */
  start: string[]
}

/**
 * Pick the healthy server with the most warm seats; then, if the free seats left
 * (counting servers already booting) fall below minFreeSeats, start one more
 * stopped server, up to maxServers. With nothing running, that is the wake-up.
 */
export function decide(servers: ServerView[], opts: FleetOptions): Decision {
  const healthy = servers.filter((s) => s.state === 'running' && s.pool && !s.pool.draining && s.url)
  const pick = healthy
    .filter((s) => s.pool!.warm > 0)
    .sort((a, b) => b.pool!.warm - a.pool!.warm || a.id.localeCompare(b.id))[0]
  const booting = servers.filter((s) => s.state === 'starting' || (s.state === 'running' && !s.pool))
  const free = healthy.reduce((n, s) => n + s.pool!.warm, 0) - (pick ? 1 : 0) + booting.length * opts.seatsPerServer
  const active = healthy.length + booting.length
  const start: string[] = []
  if (free < opts.minFreeSeats && active < opts.maxServers) {
    const next = servers.filter((s) => s.state === 'stopped').sort((a, b) => a.id.localeCompare(b.id))[0]
    if (next) start.push(next.id)
  }
  const reason = pick ? 'ok' : booting.length || start.length ? 'waking' : healthy.length ? 'full' : 'none'
  return { url: pick?.url ?? null, reason, start }
}

export interface Fleet {
  list(): Promise<Omit<ServerView, 'pool'>[]>
  start(ids: string[]): Promise<void>
}

/** Fixed servers that are always up (local development: STREAM_FLEET_STATIC=http://localhost:8787). */
export function staticFleet(urls: string[]): Fleet {
  return {
    list: async () => urls.map((url, i) => ({ id: `static-${i}`, url, state: 'running' as const })),
    start: async () => {},
  }
}

const EC2_STATES: Record<string, ServerState> = { pending: 'starting', running: 'running', stopping: 'stopping', stopped: 'stopped' }

/**
 * EC2 instances tagged StreamFleet=<fleet>. Each instance's public address comes
 * from its StreamHost tag (https, required to embed in the HTTPS site), else its
 * public IP over http (fine for testing the viewer directly).
 */
export interface Ec2Config { region: string; accessKeyId: string; secretAccessKey: string }
export function ec2Fleet(fleet: string, config: Ec2Config): Fleet {
  // Loaded on first use: a static fleet's cold starts never pay for the AWS SDK.
  let sdk: ReturnType<typeof load> | null = null
  const load = () => import('@aws-sdk/client-ec2').then((mod) => ({
    mod,
    client: new mod.EC2Client({ region: config.region, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } }),
  }))
  const ec2 = () => (sdk ??= load())
  return {
    async list() {
      const { client, mod } = await ec2()
      const out = await client.send(new mod.DescribeInstancesCommand({
        Filters: [
          { Name: 'tag:StreamFleet', Values: [fleet] },
          { Name: 'instance-state-name', Values: Object.keys(EC2_STATES) },
        ],
      }))
      return (out.Reservations ?? []).flatMap((r) => r.Instances ?? []).map((i) => {
        const host = i.Tags?.find((t) => t.Key === 'StreamHost')?.Value
        return {
          id: i.InstanceId!,
          state: EC2_STATES[i.State?.Name ?? ''] ?? 'stopping',
          url: host ? `https://${host}` : i.PublicIpAddress ? `http://${i.PublicIpAddress}` : null,
        }
      })
    },
    async start(ids) {
      if (!ids.length) return
      const { client, mod } = await ec2()
      await client.send(new mod.StartInstancesCommand({ InstanceIds: ids }))
    },
  }
}

export async function readPool(url: string, timeoutMs = 700): Promise<Pool | null> {
  try {
    const res = await fetch(`${url}/api/seat`, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null
    const p = (await res.json()) as Partial<Pool>
    return { seats: Number(p.seats ?? 0), busy: Number(p.busy ?? 0), warm: Number(p.warm ?? 0), draining: p.draining ?? null }
  } catch {
    return null
  }
}

/** The configured fleet, or null when streaming isn't set up on this deployment. */
export function fleetFromEnv(env: NodeJS.ProcessEnv = process.env): { fleet: Fleet; opts: FleetOptions } | null {
  const opts: FleetOptions = {
    minFreeSeats: Number(env.STREAM_MIN_FREE_SEATS ?? 2),
    maxServers: Number(env.STREAM_MAX_SERVERS ?? 1),
    seatsPerServer: Number(env.STREAM_SEATS_PER_SERVER ?? 2),
  }
  if (env.STREAM_FLEET_STATIC) return { fleet: staticFleet(env.STREAM_FLEET_STATIC.split(',').map((u) => u.trim().replace(/\/$/, ''))), opts }
  if (!env.STREAM_AWS_ACCESS_KEY_ID || !env.STREAM_AWS_SECRET_ACCESS_KEY) return null
  return {
    fleet: ec2Fleet(env.STREAM_FLEET ?? 'portfolio-stream', {
      region: env.STREAM_AWS_REGION ?? 'ca-central-1',
      accessKeyId: env.STREAM_AWS_ACCESS_KEY_ID,
      secretAccessKey: env.STREAM_AWS_SECRET_ACCESS_KEY,
    }),
    opts,
  }
}
