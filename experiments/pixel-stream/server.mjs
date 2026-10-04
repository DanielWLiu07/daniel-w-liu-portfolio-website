#!/usr/bin/env node
// Warm-pool pixel-streaming server.
//
// SEATS copies of the site render on this machine's GPU, each in its own Chrome.
// Every seat is kept warm (assets cached, shaders compiled, scene ready) with the
// casino intro held at frame 0 and rendering idle. A visitor claims a free seat:
// it matches their screen shape, streams over WebRTC, and releases the intro once
// their video is flowing. When they leave, the seat reloads and re-holds.
// Viewer input comes back over a data channel and is replayed through CDP.
//
// The site embeds the viewer (/?embed=1) and asks /api/seat first; whenever there
// is no seat, the server is draining (Spot interruption, shutdown) or the stream
// fails, the embed tells the site to fall back to rendering locally.
//
// See ARCHITECTURE.md for the whole picture and deploy/ for running it on EC2.
//
//   SEATS=4 HEADLESS=1 node experiments/pixel-stream/server.mjs
import http from 'node:http'
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CDP, CHROME_BIN, chromeArgs, waitForJson } from './cdp.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const env = process.env
// Seats always render locally (?stream=0), or a seat could try to stream itself.
// On Linux they also render through WebGL 2 (?renderer=webgl): headless Chrome
// there draws WebGPU but never composites it onto the page (blank canvas).
// (Windows with the GRID driver composites WebGPU fine, so it keeps WebGPU.)
const SEAT_RENDERER = env.SEAT_RENDERER ?? (process.platform === 'linux' ? 'webgl' : '')
const SITE_URL = (() => {
  const u = new URL(env.SITE_URL ?? 'http://localhost:3000/resume')
  u.searchParams.set('stream', '0')
  if (SEAT_RENDERER) u.searchParams.set('renderer', SEAT_RENDERER)
  return u.href
})()
const HOST = env.HOST ?? '0.0.0.0' // 127.0.0.1 behind Caddy on a server
const PORT = Number(env.PORT ?? 8787)
const CDP_PORT = Number(env.CDP_PORT ?? 9333)
const SEATS = Number(env.SEATS ?? 4)
// Play-mode codec. H264 uses the hardware encoder where Chrome has one (macOS
// VideoToolbox, Windows Media Foundation); Chrome on Linux encodes in software.
const PLAY_CODEC = env.CODEC ?? 'H264'
const FREEZE = env.FREEZE === '1' // minimizing doesn't pause headless rendering; the site idles held seats itself
const [W, H] = (env.SIZE ?? '1280x720').split('x').map(Number)
const HEADLESS = env.HEADLESS === '1'
// Headless: each seat's window is set once to this size (CSS px) and never
// resized; visitors' viewports (emulated) sit in its top-left corner and the seat
// crops its capture to them. Resizing a headless window doesn't reach an already
// loaded page, which clipped captures on a seat's first visitor.
const [SURFACE_W, SURFACE_H] = (env.SURFACE ?? '2600x2600').split('x').map(Number)
// Reclaim a seat from a visitor with no input for IDLE_MS, but only while the pool
// is full (someone else could use it); they get IDLE_GRACE_MS to tap first.
const IDLE_MS = Number(env.IDLE_MS ?? 120_000)
const IDLE_GRACE_MS = Number(env.IDLE_GRACE_MS ?? 20_000)
// Direct (non-embedded) viewers queue; a session is capped while others wait.
const MAX_SESSION_MS = Number(env.MAX_SESSION_MS ?? 600_000)
// One seat per device (a second tab takes the seat over); a lenient cap per IP,
// since a recruiting office shares one address.
const MAX_SEATS_PER_CLIENT = Number(env.MAX_SEATS_PER_CLIENT ?? 3)
// Wake-on-demand: with SELF_STOP=1 the machine shuts itself down (EC2 treats that
// as "stop", so billing ends) after SELF_STOP_IDLE_MIN with no visitors, except
// inside the keep-on window (e.g. weekdays 9-21 Toronto time) or on an instance
// tagged StreamAlwaysOn=true. Linux runs `sudo shutdown`; Windows asks the SYSTEM
// task pixel-stream-stop (the seats' user may not shut down). Never on a Mac.
const SELF_STOP = env.SELF_STOP === '1' && (process.platform === 'linux' || process.platform === 'win32')
const SELF_STOP_IDLE_MIN = Number(env.SELF_STOP_IDLE_MIN ?? 30)
const KEEP_ON_DAYS = env.KEEP_ON_DAYS ?? '' // e.g. 1-5 (Mon-Fri), empty = no window
const KEEP_ON_HOURS = env.KEEP_ON_HOURS ?? '9-21'
const KEEP_ON_TZ = env.KEEP_ON_TZ ?? 'America/Toronto'
const TRUST_PROXY = env.TRUST_PROXY === '1' // take the client IP from Caddy's X-Forwarded-For
// Behind Caddy (a real server) unset settings fail closed: no third-party embedding
// and no lab endpoints. A local dev pool (no proxy) stays open for convenience.
const PUBLIC = TRUST_PROXY
const EMBED_ORIGINS = (env.EMBED_ORIGINS ?? (PUBLIC ? '' : '*')).split(',').map((s) => s.trim()).filter(Boolean)
const LAB_TOKEN = env.LAB_TOKEN ?? ''
// A seat claimed but never started (tab hidden, page gone, a forged request) goes back after this.
const BEGIN_TIMEOUT_MS = Number(env.BEGIN_TIMEOUT_MS ?? 45_000)
// A viewer whose event stream drops keeps its seat this long to reconnect.
const RECONNECT_GRACE_MS = Number(env.RECONNECT_GRACE_MS ?? 8_000)
const STUN_URLS = (env.STUN_URLS ?? 'stun:stun.cloudflare.com:3478,stun:stun.l.google.com:19302').split(',').filter(Boolean)
const CF_TURN_KEY_ID = env.CF_TURN_KEY_ID ?? ''
const CF_TURN_API_TOKEN = env.CF_TURN_API_TOKEN ?? ''
const SPOT_WATCH = env.SPOT_WATCH === '1' // poll EC2 instance metadata for Spot interruption
// Most pixels this server will encode per stream. Software VP8 cost scales with
// pixels: on 4 vCPUs ~1.9 MP took 14-18 ms/frame (laggy, ~45 fps); ~1.3 MP ~8 ms.
const MAX_PIXELS = Number(env.MAX_PIXELS ?? 1_400_000)
const MARKS = ['casino:scene-ready', 'casino:intro-start', 'casino:table-landed']
const STREAMER = await readFile(path.join(HERE, 'streamer.js'), 'utf8')

const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const children = []
process.on('exit', () => children.forEach((c) => c.kill()))

// ---- Viewers ------------------------------------------------------------------
const viewers = new Map() // viewer id → { res, client, embed }
const waiting = [] // viewer ids queued for a seat, oldest first (direct viewers only)
let draining = null // reason string once the server stops taking visitors

function sendTo(id, msg) {
  viewers.get(id)?.res.write(`data: ${JSON.stringify(msg)}\n\n`)
}

function poolSummary() {
  return {
    seats: seats.length,
    busy: seats.filter((s) => s.owner).length,
    warm: seats.filter((s) => !s.owner && s.phase === 'hot' && !s.loading).length,
    waiting: waiting.length,
    draining,
  }
}

function statusFor(viewerId) {
  const seat = seats.find((s) => s.owner === viewerId) ?? seats[0]
  return { type: 'status', state: seat.snapshot(), pool: poolSummary(), playCodec: PLAY_CODEC }
}

function broadcastPool() {
  for (const id of viewers.keys()) sendTo(id, statusFor(id))
}

// ---- Seats --------------------------------------------------------------------
class Seat {
  constructor(index) {
    this.index = index
    this.cdpPort = CDP_PORT + index
    this.owner = null // viewer id
    this.phase = 'booting'
    this.introReleased = false
    this.frozen = false
    this.viewport = null
    this.capture = null
    this.gpu = null
    this.loads = []
    this.loading = null
    this.timeline = []
    this.releasedAt = 0
    this.claimedAt = 0
    this.lastInput = 0
    this.idleWarnedAt = 0
    this.queue = Promise.resolve() // signals for this seat run one at a time
  }

  snapshot() {
    const { index, phase, introReleased, viewport, capture, gpu, loads } = this
    return { seat: index, phase, introReleased, viewport, size: viewport ? `${viewport.width}x${viewport.height}` : `${W}x${H}`, capture, gpu, loads: loads.slice(-3), site: SITE_URL, headless: HEADLESS }
  }

  async boot() {
    const profile = path.join(HERE, this.index === 0 ? '.chrome-profile' : `.chrome-profile-${this.index}`)
    const chrome = (this.chrome = spawn(CHROME_BIN, chromeArgs({ cdpPort: this.cdpPort, profile, width: W, height: H, headless: HEADLESS }), { stdio: 'ignore' }))
    children.push(chrome)
    // A seat whose Chrome dies is rebuilt with a fresh Chrome after a pause.
    chrome.on('exit', (code) => {
      log(`seat ${this.index} chrome exited (${code})`)
      if (this.chrome !== chrome) return
      this.phase = 'dead'
      this.page?.close?.()
      if (this.owner) { sendTo(this.owner, { type: 'fallback', reason: 'seat-crashed' }); this.owner = null }
      broadcastPool()
      if (!draining) setTimeout(() => this.reboot('chrome exited'), 3000)
    })
    await waitForJson(`http://127.0.0.1:${this.cdpPort}/json/version`)
    const target = (await waitForJson(`http://127.0.0.1:${this.cdpPort}/json/list`)).find((t) => t.type === 'page')
    const page = (this.page = await CDP.connect(target.webSocketDebuggerUrl))
    await page.send('Page.enable')
    await page.send('Runtime.enable')
    await page.send('Runtime.addBinding', { name: '__psSend' })
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: STREAMER })
    this.windowId = (await page.send('Browser.getWindowForTarget')).windowId
    // Headless, or windowed on a virtual X display: one fixed, roomy window per seat.
    if (HEADLESS || env.DISPLAY || process.platform === 'win32') await page.send('Browser.setWindowBounds', { windowId: this.windowId, bounds: { left: 0, top: 0, width: SURFACE_W, height: SURFACE_H } })
    await this.resize({ width: W, height: H, dpr: 1 })
    await page.send('Emulation.setFocusEmulationEnabled', { enabled: true })
    page.on('Runtime.consoleAPICalled', (e) => {
      if (e.type === 'error') log(`[seat ${this.index} page error]`, e.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300))
    })
    page.on('Runtime.bindingCalled', ({ name, payload }) => {
      if (name !== '__psSend') return
      // A throw here would escape the CDP socket listener and take the pool down.
      try { this.onSeatMessage(JSON.parse(payload)) } catch (err) { log(`seat ${this.index} message`, err.message) }
    })
    page.on('Inspector.targetCrashed', () => this.recover('renderer crashed'))
    await page.send('Inspector.enable').catch(() => {})
    await this.load('first')
  }

  onSeatMessage(msg) {
      const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
      if (msg.type === 'senderStats') {
        // Per-second timeline of what the seat renders/encodes, from intro release.
        const t = this.releasedAt ? Math.round((Date.now() - this.releasedAt) / 1000) : null
        this.timeline.push({ t, render: Math.round(n(msg.renderFps) ?? 0), encode: n(msg.encodeFps), encodeMs: n(msg.encodeMs) != null ? +n(msg.encodeMs).toFixed(1) : null, size: `${n(msg.width)}x${n(msg.height)}`, kbps: Math.round(n(msg.targetKbps) ?? 0), limit: typeof msg.limitation === 'string' ? msg.limitation : null, bwe: n(msg.bweKbps) != null ? Math.round(msg.bweKbps) : null, rtt: n(msg.rttMs) != null ? Math.round(msg.rttMs) : null, lost: n(msg.lost), nacks: n(msg.nacks), plis: n(msg.plis) })
        if (this.timeline.length > 120) this.timeline.shift()
        // Meter relayed bytes (a new connection restarts the pair's counter).
        const pairBytes = Math.max(0, n(msg.pairBytes) ?? 0)
        const delta = pairBytes >= (this.lastPairBytes ?? 0) ? pairBytes - (this.lastPairBytes ?? 0) : pairBytes
        this.lastPairBytes = pairBytes
        // A stats tick covers ~1 s; anything beyond ~40 MB (320 Mbps) is not real traffic.
        if (msg.relay === true && delta > 0) addTurnBytes(Math.min(delta, 40e6))
      }
      if (msg.to === 'viewer') return this.owner && sendTo(this.owner, msg)
      if (msg.type === 'input') {
        if (msg.kind !== 'probe' && msg.kind !== 'keyframe') this.touch()
        this.input(msg).catch((err) => log('input', err.message))
      }
  }

  // The page crashed or stopped answering: hand its visitor to local rendering and
  // rebuild the seat (a fresh load, or a fresh Chrome if even that fails).
  async recover(reason) {
    if (this.recovering) return
    this.recovering = true
    log(`seat ${this.index} unhealthy: ${reason}`)
    if (this.owner) { sendTo(this.owner, { type: 'fallback', reason: 'seat-crashed' }); this.owner = null }
    this.phase = 'failed'
    broadcastPool()
    try {
      await this.load('first')
    } catch (err) {
      log(`seat ${this.index} reload after ${reason} failed: ${err.message}; restarting its Chrome`)
      this.chrome?.kill()
    } finally {
      this.recovering = false
    }
  }

  // Boot (or re-boot) this seat; a failure leaves it 'failed' for housekeeping to retry.
  async reboot(reason) {
    if (this.booting || draining) return
    this.booting = true
    try {
      await this.boot()
    } catch (err) {
      log(`seat ${this.index} boot failed (${reason}): ${err.message}`)
      this.phase = 'failed'
      try { this.chrome?.kill() } catch {}
    } finally {
      this.booting = false
      broadcastPool()
    }
  }

  // Any input from the visitor counts as activity.
  touch() {
    this.lastInput = Date.now()
    if (this.idleWarnedAt) {
      this.idleWarnedAt = 0
      if (this.owner) sendTo(this.owner, { type: 'idle-cleared' })
    }
  }

  load(kind) {
    // Only once loading is cleared does the seat count as free for the queue.
    this.loading = this.loadInner(kind).finally(() => { this.loading = null; seatFreed() })
    return this.loading
  }

  // Warm = assets downloaded, shaders compiled, scene ready, intro held at frame 0.
  async loadInner(kind) {
    const page = this.page
    await this.thaw()
    this.phase = 'loading'
    this.introReleased = false
    broadcastPool()
    const wallStart = Date.now()
    const loaded = page.once('Page.loadEventFired', 60_000)
    await (kind === 'first' ? page.send('Page.navigate', { url: SITE_URL }) : page.send('Page.reload', { ignoreCache: false }))
    await loaded.catch(() => log(`seat ${this.index} load event not seen in 60 s; checking the scene anyway`))
    let marks = {}
    do {
      await sleep(100)
      marks = JSON.parse(await page.evaluate(`JSON.stringify(Object.fromEntries(${JSON.stringify(MARKS)}.map((n) => [n, performance.getEntriesByName(n)[0]?.startTime ?? null])))`))
    } while (!marks['casino:scene-ready'] && Date.now() - wallStart < 90_000)
    const warm = await page.evaluate(`__ps.warmEncoder(${JSON.stringify(PLAY_CODEC)})`).catch((err) => ({ error: err.message }))
    this.gpu ??= await page.evaluate(`(async () => { const a = await navigator.gpu?.requestAdapter(); return a ? [a.info?.vendor, a.info?.architecture, a.info?.description].filter(Boolean).join(' ') || 'webgpu' : 'no webgpu' })()`)
    const entry = { kind, at: new Date().toISOString(), sceneReadyMs: marks['casino:scene-ready'] && Math.round(marks['casino:scene-ready']), encoderWarm: warm }
    this.loads.push(entry)
    this.phase = marks['casino:scene-ready'] ? 'hot' : 'failed'
    log(`seat ${this.index} ${kind} load`, entry, this.phase === 'failed' ? '(scene never became ready)' : '')
    if (!this.owner) await this.freeze()
    broadcastPool()
  }

  // Optional: minimize idle seats. Headless rendering doesn't pause for this (the
  // site idles held seats itself with frameloop="demand"), and a page that has
  // been lifecycle-frozen can never start a tab capture again.
  async freeze() {
    if (!FREEZE || this.frozen) return
    await this.page.send('Browser.setWindowBounds', { windowId: this.windowId, bounds: { windowState: 'minimized' } })
    this.frozen = true
  }

  async thaw() {
    if (!this.frozen) return
    await this.page.send('Browser.setWindowBounds', { windowId: this.windowId, bounds: { windowState: 'normal' } })
    this.frozen = false
    if (this.viewport) await this.resize(this.viewport, true)
    await this.page.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  }

  // Match the visitor's screen shape so a phone gets the portrait layout at
  // phone resolution instead of a letterboxed 16:9 frame.
  async resize(req, force = false) {
    if (!req) return false
    const width = Math.max(320, Math.min(2560, Math.round(req.width)))
    const height = Math.max(320, Math.min(2560, Math.round(req.height)))
    const dpr = Math.max(1, Math.min(2, req.dpr || 1, Math.sqrt(MAX_PIXELS / (width * height))))
    const v = this.viewport
    if (!force && v && v.width === width && v.height === height && v.dpr === dpr) return false
    await this.page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: false })
    this.viewport = { width, height, dpr }
    return true
  }

  // A visitor's start/resize/answer messages can arrive together; interleaving
  // them would mix viewport changes with an in-progress capture.
  signal(msg, from) {
    const run = this.queue.then(() => this.signalNow(msg, from))
    this.queue = run.catch(() => {})
    return run
  }

  async signalNow(msg, from) {
    const page = this.page
    if (this.loading) await this.loading
    await this.thaw()
    // A *different* visitor already watched this seat's intro: reload and hold it
    // again. The same visitor reconnecting (e.g. after rotating) keeps their show.
    if (msg.type === 'start' && this.introReleased && this.releasedFor !== this.ownerDevice) await this.load('rearm')
    if (msg.type === 'begin') {
      if (!this.introReleased) {
        this.introReleased = true
        this.releasedFor = this.ownerDevice
        this.releasedAt = Date.now()
        this.timeline = []
        this.touch()
        await page.send('Runtime.evaluate', { expression: '__ps.releaseIntro()' })
        if (this.owner) sendTo(this.owner, { type: 'intro-started', at: this.releasedAt })
        log(`seat ${this.index} intro released for ${from}`)
      }
      return
    }
    const changed = await this.resize(msg.viewport ?? (msg.type === 'start' ? { width: W, height: H, dpr: 1 } : null)) // lab viewers measure at the fixed size
    if (msg.type === 'resize' && !changed) return // same shape: keep the stream as is
    // A new stream captures fresh at the visitor's exact size; a rotation re-captures
    // and hot-swaps the track into the live connection.
    if (msg.type === 'start') await page.send('Runtime.evaluate', { expression: '__ps.stopCapture()' })
    // The seat needs STUN to learn its public address (EC2 sits behind 1:1 NAT).
    if (msg.type === 'start') msg.iceServers = [{ urls: STUN_URLS }]
    const expression = msg.type === 'resize' ? '__ps.resize()' : `__ps.onSignal(${JSON.stringify(msg)})`  // resize() also runs ensureSize
    const r = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })
    if (r.exceptionDetails) log(`seat ${this.index} ${msg.type} failed:`, r.exceptionDetails.exception?.description?.split('\n')[0])
    if (msg.type === 'start' || msg.type === 'resize') {
      // Starting a tab capture makes headless Chrome resize the page to its own
      // preferred size, undoing the visitor's shape: put the shape back, then make
      // the seat verify (crop or re-capture) that frames match the page exactly.
      await this.resize(this.viewport, true)
      const fit = await page.evaluate('__ps.ensureSize()').catch((err) => ({ error: err.message }))
      this.capture = await page.evaluate('__ps.captureInfo()').catch(() => null)
      log(`seat ${this.index} streaming`, this.capture, fit)
    }
  }

  async input(m) {
    const x = m.x * (this.viewport?.width ?? W)
    const y = m.y * (this.viewport?.height ?? H)
    const page = this.page
    switch (m.kind) {
      case 'move':
        return page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: m.buttons, button: m.buttons ? 'left' : 'none' })
      case 'down':
        return page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
      case 'up':
        return page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 })
      case 'wheel':
        return page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: m.dx, deltaY: m.dy })
      case 'probe':
        return page.send('Runtime.evaluate', { expression: `__ps.probe(${m.value ? 1 : 0})` })
      case 'keyframe':
        // Restarting the encoder costs a large frame; a stalled decoder asks
        // repeatedly, and a burst of keyframes on a weak link only loses more.
        if (Date.now() - (this.lastKeyframe ?? 0) < 1000) return
        this.lastKeyframe = Date.now()
        return page.send('Runtime.evaluate', { expression: '__ps.keyframe()', awaitPromise: true })
    }
  }

  // Visitor gone: stop streaming, reload so the next visitor gets a fresh intro.
  async release(reason = 'left') {
    const who = this.owner
    this.owner = null
    this.ownerDevice = null
    this.idleWarnedAt = 0
    log(`seat ${this.index} released (${reason}) by ${who}`)
    await this.page.send('Runtime.evaluate', { expression: '__ps.stopCapture()' }).catch(() => {})
    if (this.introReleased && !this.loading && !draining) await this.load('rearm')
    else { await this.freeze(); broadcastPool(); seatFreed() }
  }
}

// Hand the next queued visitor a seat as soon as one is warm and free.
function seatFreed() {
  broadcastPool()
  while (waiting.length && !draining) {
    const free = seats.find((s) => !s.owner && s.phase === 'hot' && !s.loading)
    if (!free) return
    const id = waiting.shift()
    if (viewers.has(id)) sendTo(id, { type: 'ready' })
  }
}

function claimSeat(viewerId) {
  const mine = seats.find((s) => s.owner === viewerId)
  if (mine) return mine
  // Only a viewer page with an open event stream can hold a seat: it's how the
  // seat comes back when they leave (and the per-device/per-IP limits need it).
  if (draining || !viewers.has(viewerId)) return null
  // Same device, new tab or reload: take over its seat (and its show) rather than
  // holding two. The old tab is told and falls back to local rendering.
  const device = viewers.get(viewerId)?.device
  const held = device && seats.find((s) => s.owner && viewers.get(s.owner)?.device === device)
  if (held) {
    const previous = held.owner
    held.owner = viewerId
    held.ownerDevice = device
    held.ownerGoneAt = 0
    held.claimedAt = Date.now()
    held.lastInput = Date.now()
    sendTo(previous, { type: 'fallback', reason: 'replaced' })
    log(`seat ${held.index} taken over by the same device (${viewerId})`)
    return held
  }
  // One client (IP) may not hold the whole pool.
  const client = viewers.get(viewerId)?.client
  if (client && seats.filter((s) => s.owner && viewers.get(s.owner)?.client === client).length >= MAX_SEATS_PER_CLIENT) return null
  // Prefer a seat that is already warm; fall back to one still re-arming.
  const free = seats.find((s) => !s.owner && s.phase === 'hot' && !s.loading) ?? seats.find((s) => !s.owner && s.phase !== 'dead' && s.phase !== 'failed')
  if (!free) return null
  free.owner = viewerId
  free.ownerDevice = device
  free.ownerGoneAt = 0
  free.claimedAt = Date.now()
  free.lastInput = Date.now()
  broadcastPool()
  return free
}

const seats = Array.from({ length: SEATS }, (_, i) => new Seat(i))

// ---- Housekeeping: idle reclaim, session cap ------------------------------------
setInterval(() => {
  const now = Date.now()
  const full = poolSummary().warm === 0
  for (const seat of seats) {
    // The viewer's page is gone (its event stream closed and didn't come back).
    if (seat.owner && !viewers.has(seat.owner)) {
      seat.ownerGoneAt ||= now
      if (now - seat.ownerGoneAt > RECONNECT_GRACE_MS) seat.release('viewer gone').catch((err) => log('release', err.message))
      continue
    }
    if (seat.owner) seat.ownerGoneAt = 0
    // Claimed but never started: a hidden tab, a page that died, or a forged request.
    if (seat.owner && !seat.introReleased && now - seat.claimedAt > BEGIN_TIMEOUT_MS) {
      sendTo(seat.owner, { type: 'fallback', reason: 'never-started' })
      seat.release('never started').catch((err) => log('release', err.message))
      continue
    }
    if (!seat.owner || !seat.introReleased) continue
    if (seat.idleWarnedAt && now - seat.idleWarnedAt > IDLE_GRACE_MS) {
      sendTo(seat.owner, { type: 'paused', reason: 'idle' })
      seat.release('idle').catch((err) => log('release', err.message))
    } else if (!seat.idleWarnedAt && full && now - seat.lastInput > IDLE_MS) {
      seat.idleWarnedAt = now
      sendTo(seat.owner, { type: 'idle-warning', seconds: Math.round(IDLE_GRACE_MS / 1000) })
    } else if (waiting.length && now - seat.claimedAt > MAX_SESSION_MS) {
      sendTo(seat.owner, { type: 'paused', reason: 'time' })
      seat.release('session cap').catch((err) => log('release', err.message))
    }
  }
}, 2000)

// Failed or dead seats are retried; a seat that stops answering is rebuilt. If
// every seat stays broken (the site itself is down, say), exit so the service
// restarts the site and the pool together.
let allBrokenSince = 0
setInterval(async () => {
  if (draining) return
  for (const seat of seats) {
    if (seat.loading || seat.booting || seat.recovering) continue
    if (seat.phase === 'failed' && seat.page && !seat.page.closed) seat.recover('retrying a failed load').catch(() => {})
    else if ((seat.phase === 'dead' || seat.phase === 'failed') && !seat.booting) seat.reboot('retry').catch(() => {})
    else if (seat.phase === 'hot') {
      try { await seat.page.send('Runtime.evaluate', { expression: '1' }, 5000) } catch (err) { seat.recover(`health check: ${err.message}`).catch(() => {}) }
    }
  }
  const broken = seats.every((s) => s.phase === 'failed' || s.phase === 'dead')
  allBrokenSince = broken ? allBrokenSince || Date.now() : 0
  if (allBrokenSince && Date.now() - allBrokenSince > 180_000) { log('every seat broken for 3 min: exiting so the service restarts the site and pool'); process.exit(1) }
}, 20_000)

// ---- Wake-on-demand: stop the machine when nobody needs it ------------------------
let lastActivity = Date.now()

function inKeepOnWindow(now = new Date()) {
  if (!KEEP_ON_DAYS) return false
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: KEEP_ON_TZ, weekday: 'short', hour: 'numeric', hourCycle: 'h23' })
    .formatToParts(now).map((p) => [p.type, p.value]))
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday)
  const [d0, d1] = KEEP_ON_DAYS.split('-').map(Number)
  const [h0, h1] = KEEP_ON_HOURS.split('-').map(Number)
  const hour = Number(parts.hour)
  return day >= d0 && day <= (d1 ?? d0) && hour >= h0 && hour < h1
}

// An instance tagged StreamAlwaysOn=true never stops itself. If the tag can't be
// read, stay on: a wrongly stopped server is worse than one left running.
const alwaysOn = SELF_STOP
  ? imds('tags/instance/StreamAlwaysOn').then((v) => v?.trim() === 'true').catch(() => true) // no tag (404): may stop
  : Promise.resolve(true)
if (SELF_STOP) {
  setInterval(async () => {
    if (await alwaysOn) return
    if (seats.some((s) => s.owner) || waiting.length || viewers.size) { lastActivity = Date.now(); return }
    const idleMin = (Date.now() - lastActivity) / 60_000
    if (idleMin < SELF_STOP_IDLE_MIN || inKeepOnWindow()) return
    log(`no visitors for ${Math.round(idleMin)} min, outside the keep-on window: stopping the machine`)
    drain('idle shutdown')
    // EC2 treats an OS shutdown as "stop" (InstanceInitiatedShutdownBehavior=stop):
    // compute billing ends, the disk with everything predownloaded stays.
    setTimeout(() => {
      if (process.platform === 'win32') writeFileSync(path.join(HERE, 'stop-requested'), new Date().toISOString())
      else spawn('sudo', ['-n', '/usr/sbin/shutdown', '-h', 'now'], { stdio: 'inherit' })
    }, 2000)
  }, 60_000)
}

// ---- Draining: Spot interruption or shutdown ---------------------------------------
// Stop taking visitors and move everyone watching onto local rendering.
function drain(reason) {
  if (draining) return
  draining = reason
  log('draining:', reason)
  for (const id of waiting.splice(0)) sendTo(id, { type: 'fallback', reason: 'server-ending' })
  for (const seat of seats) if (seat.owner) sendTo(seat.owner, { type: 'fallback', reason: 'server-ending' })
  broadcastPool()
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    drain(sig)
    setTimeout(() => process.exit(0), 1500) // let the fallback messages go out
  })
}

// EC2 posts a Spot interruption notice ~2 minutes ahead; a rebalance
// recommendation comes earlier and only means "risk is rising".
async function imds(pathname) {
  const token = await fetch('http://169.254.169.254/latest/api/token', { method: 'PUT', headers: { 'X-aws-ec2-metadata-token-ttl-seconds': '60' }, signal: AbortSignal.timeout(1000) }).then((r) => r.text())
  const res = await fetch(`http://169.254.169.254/latest/meta-data/${pathname}`, { headers: { 'X-aws-ec2-metadata-token': token }, signal: AbortSignal.timeout(1000) })
  return res.ok ? res.text() : null
}

if (SPOT_WATCH) {
  let rebalanceLogged = false
  setInterval(async () => {
    try {
      const action = await imds('spot/instance-action')
      if (action) drain(`spot interruption ${action}`)
      if (!rebalanceLogged && (await imds('events/recommendations/rebalance'))) {
        rebalanceLogged = true
        log('spot rebalance recommendation: interruption risk is elevated')
      }
    } catch (err) {
      log('spot watch', err.message)
    }
  }, 5000)
}

// ---- ICE servers for viewers -----------------------------------------------------
// STUN always; TURN (relay for networks that block direct UDP) when Cloudflare
// credentials are configured. TURN credentials are minted per viewer, short-lived.
// Monthly relay budget: bytes of viewer connections that go through the relay
// (both directions), persisted so restarts don't reset it. Past the cap no new
// relay credentials are minted: direct viewers are unaffected, relay-only viewers
// fall back to rendering locally. Per server, so set it to the account's budget
// divided by STREAM_MAX_SERVERS (Cloudflare includes 1000 GB/month).
const TURN_MONTHLY_GB = Number(env.TURN_MONTHLY_GB ?? 400)
const TURN_USAGE_FILE = new URL('./turn-usage.json', import.meta.url)
const month = () => new Date().toISOString().slice(0, 7)
let turnUsage = { month: month(), bytes: 0 }
try { const saved = JSON.parse(readFileSync(TURN_USAGE_FILE, 'utf8')); if (saved.month === month()) turnUsage = saved } catch {}
let turnUsageDirty = false
function addTurnBytes(bytes) {
  if (turnUsage.month !== month()) turnUsage = { month: month(), bytes: 0 }
  turnUsage.bytes += bytes
  turnUsageDirty = true
}
const turnBudgetLeft = () => turnUsage.month !== month() || turnUsage.bytes < TURN_MONTHLY_GB * 1e9
setInterval(() => {
  if (!turnUsageDirty) return
  turnUsageDirty = false
  try { writeFileSync(TURN_USAGE_FILE, JSON.stringify(turnUsage)) } catch (err) { log('turn usage save', err.message) }
}, 30_000).unref()

// Minting relay credentials spends Cloudflare TURN bandwidth, so each client IP
// gets a few per window (a viewer needs one per connect); beyond that, STUN only.
const TURN_MINTS_PER_IP = Number(env.TURN_MINTS_PER_IP ?? 12)
const turnMints = new Map() // ip -> { count, since }
function mayMintTurn(ip) {
  const now = Date.now(), m = turnMints.get(ip)
  if (!m || now - m.since > 10 * 60_000) { turnMints.set(ip, { count: 1, since: now }); return true }
  return ++m.count <= TURN_MINTS_PER_IP
}
setInterval(() => { const now = Date.now(); for (const [ip, m] of turnMints) if (now - m.since > 10 * 60_000) turnMints.delete(ip) }, 60_000).unref()

async function iceServers(ip) {
  const list = [{ urls: STUN_URLS }]
  if (!CF_TURN_KEY_ID || !CF_TURN_API_TOKEN) return list
  if (!turnBudgetLeft()) { log('turn credentials: monthly relay budget used', `${(turnUsage.bytes / 1e9).toFixed(1)} GB`); return list }
  if (!mayMintTurn(ip)) { log('turn credentials: rate limited', ip); return list }
  try {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${CF_TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { authorization: `Bearer ${CF_TURN_API_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ttl: 900 }),
      signal: AbortSignal.timeout(2000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const { iceServers: turn } = await res.json()
    return [...list, ...(Array.isArray(turn) ? turn : [turn])]
  } catch (err) {
    log('turn credentials', err.message)
    return list
  }
}

// ---- HTTP -----------------------------------------------------------------------
async function readBody(req) {
  let body = ''
  for await (const chunk of req) body += chunk
  return body ? JSON.parse(body) : {}
}

function clientOf(req) {
  const forwarded = TRUST_PROXY && req.headers['x-forwarded-for']?.split(',')[0].trim()
  return forwarded || req.socket.remoteAddress
}

function cors(req, res) {
  const origin = req.headers.origin
  if (!origin) return
  if (EMBED_ORIGINS.includes('*') || EMBED_ORIGINS.includes(origin)) {
    res.setHeader('access-control-allow-origin', origin)
    res.setHeader('vary', 'origin')
  }
}

let backdrop = null // { at, data }: the cached start-screen backdrop
const isLab = (url) => (LAB_TOKEN ? url.searchParams.get('token') === LAB_TOKEN : !PUBLIC)

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  try {
    cors(req, res)
    if (url.pathname === '/') {
      // Only the listed origins may frame the viewer.
      const ancestors = EMBED_ORIGINS.includes('*') ? '*' : `'self' ${EMBED_ORIGINS.join(' ')}`
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': `frame-ancestors ${ancestors}` })
      return res.end(await readFile(path.join(HERE, 'viewer.html')))
    }
    if (url.pathname === '/api/seat') {
      // The site's quick "should I stream?" check before it embeds the viewer.
      const p = poolSummary()
      // (Not activity: the front door polls every running server on each visit, which
      // would keep an unused standby server awake for as long as the site has traffic.)
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      return res.end(JSON.stringify({ available: !p.draining && p.warm > 0, ...p }))
    }
    if (url.pathname === '/healthz') {
      const ok = !draining && seats.some((s) => s.phase === 'hot')
      res.writeHead(ok ? 200 : 503, { 'content-type': 'text/plain' })
      return res.end(ok ? 'ok' : draining ? `draining: ${draining}` : 'warming')
    }
    if (url.pathname === '/ice') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      // Relay credentials only for a viewer page that is actually connected here.
      const viewer = viewers.get(url.searchParams.get('id') ?? '')
      return res.end(JSON.stringify({ iceServers: viewer ? await iceServers(clientOf(req)) : [{ urls: STUN_URLS }] }))
    }
    if (url.pathname === '/events') {
      const id = url.searchParams.get('id') || String(Math.random())
      const existing = viewers.get(id)
      // A reconnect of the same page is fine; another address taking over an id is not.
      if (existing && existing.client !== clientOf(req)) return res.writeHead(409).end()
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' })
      viewers.set(id, { res, client: clientOf(req), embed: url.searchParams.has('embed'), device: url.searchParams.get('device') || id })
      lastActivity = Date.now()
      const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 20_000) // proxies drop silent streams
      req.on('close', () => {
        clearInterval(keepAlive)
        if (viewers.get(id)?.res === res) viewers.delete(id)
        const q = waiting.indexOf(id)
        if (q >= 0) waiting.splice(q, 1)
        // Its seat waits RECONNECT_GRACE_MS for the page's EventSource to reconnect
        // (housekeeping releases it otherwise).
        const seat = seats.find((s) => s.owner === id)
        if (seat) seat.ownerGoneAt = Date.now()
        else broadcastPool()
      })
      sendTo(id, statusFor(id))
      if (draining) sendTo(id, { type: 'fallback', reason: 'server-ending' })
      // Always invite a seat request: it is either seated, queued or told to fall back.
      // A seat still re-warming counts: the visitor's start waits for it.
      else if (seats.some((s) => s.phase === 'hot' || (!s.owner && s.loading))) sendTo(id, { type: 'ready' })
      return
    }
    if ((url.pathname === '/signal' || url.pathname === '/reload') && req.method === 'POST' && !String(req.headers['content-type']).startsWith('application/json')) {
      // A "simple" cross-site POST (no preflight) can't set this header.
      return res.writeHead(415).end('application/json only')
    }
    if (url.pathname === '/signal' && req.method === 'POST') {
      const msg = await readBody(req)
      if (typeof msg.from !== 'string' || !msg.from) return res.end('stale viewer page: reload it') // tabs opened before this version
      // The page is leaving on purpose (handoff, fallback, tab closed): free the seat
      // now rather than after the reconnect grace.
      if (msg.type === 'leave') {
        const seat = seats.find((s) => s.owner === msg.from)
        if (seat) seat.release('left').catch((err) => log('release', err.message))
        return res.end('ok')
      }
      if (msg.type === 'resume' || msg.type === 'ping') {
        seats.find((s) => s.owner === msg.from)?.touch()
        return res.end('ok')
      }
      const seat = msg.type === 'start' ? claimSeat(msg.from) : seats.find((s) => s.owner === msg.from)
      if (!seat) {
        const viewer = viewers.get(msg.from)
        if (msg.type === 'start') {
          // Embedded viewers never queue: the site renders locally instead.
          if (viewer?.embed || draining) sendTo(msg.from, { type: 'fallback', reason: draining ? 'server-ending' : 'full' })
          else {
            if (!waiting.includes(msg.from)) waiting.push(msg.from)
            sendTo(msg.from, { type: 'full', pool: poolSummary(), position: waiting.indexOf(msg.from) + 1 })
          }
        }
        return res.end('no seat')
      }
      if (msg.type === 'start') log(`seat ${seat.index} → ${clientOf(req)} (${msg.from})`)
      await seat.signal(msg, clientOf(req))
      sendTo(msg.from, statusFor(msg.from))
      return res.end('ok')
    }
    if (url.pathname === '/reload' && req.method === 'POST') {
      // Lab "replay intro": only ever your own seat.
      const body = await readBody(req)
      const seat = seats.find((s) => s.owner === body.from)
      if (!seat || seat.loading) return res.end(seat ? 'busy' : 'no seat')
      res.end('ok')
      await seat.load('warm-reload').catch((err) => log(`seat ${seat.index} reload`, err.message))
      return
    }
    if (url.pathname === '/screenshot') {
      // Blurred backdrop for the start screen (any warm seat), or your own seat for
      // the lab quality comparison. Native CSS resolution, the stream's pixel grid.
      const own = seats.find((s) => s.owner && s.owner === url.searchParams.get('id'))
      // The shared start-screen backdrop is the same for everyone: capture it at
      // most every 5 s rather than once per request.
      if (!own && !isLab(url) && backdrop && Date.now() - backdrop.at < 5000) {
        res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store' })
        return res.end(backdrop.data)
      }
      const seat = own ?? seats.find((s) => s.phase === 'hot' && (!s.owner || isLab(url)))
      if (!seat?.viewport) return res.writeHead(404).end()
      const { width, height, dpr } = seat.viewport
      const { data } = await seat.page.send('Page.captureScreenshot', { format: own ? 'png' : 'jpeg', quality: 60, clip: { x: 0, y: 0, width, height, scale: own ? 1 / dpr : 0.5 / dpr } })
      const image = Buffer.from(data, 'base64')
      if (!own && !isLab(url)) backdrop = { at: Date.now(), data: image }
      res.writeHead(200, { 'content-type': own ? 'image/png' : 'image/jpeg', 'cache-control': 'no-store' })
      return res.end(image)
    }
    if (url.pathname === '/status') {
      if (!isLab(url)) return res.writeHead(403).end()
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ pool: poolSummary(), turn: { month: turnUsage.month, gb: +(turnUsage.bytes / 1e9).toFixed(3), capGb: TURN_MONTHLY_GB, minting: turnBudgetLeft() && !!CF_TURN_KEY_ID }, seats: seats.map((s) => ({ ...s.snapshot(), owner: s.owner, frozen: s.frozen, timeline: url.searchParams.has('timeline') ? s.timeline : undefined })) }, null, 2))
    }
    res.writeHead(404).end()
  } catch (err) {
    log('http', url.pathname, err.message)
    if (!res.headersSent) res.writeHead(500)
    res.end(err.message)
  }
})

server.listen(PORT, HOST, () => {
  log(`viewer: http://localhost:${PORT}  (${SEATS} seats, site ${SITE_URL})`)
  if (HOST === '0.0.0.0') {
    const ips = Object.values(networkInterfaces()).flat().filter((i) => i?.family === 'IPv4' && !i.internal).map((i) => i.address)
    for (const ip of ips) log(`  also: http://${ip}:${PORT}${ip.startsWith('100.') ? '  (Tailscale: works off Wi-Fi too)' : '  (same Wi-Fi)'}`)
  }
})

// Warm seats one at a time so they don't fight over the CPU while compiling.
for (const seat of seats) await seat.reboot('startup')
log('seats started', poolSummary())
