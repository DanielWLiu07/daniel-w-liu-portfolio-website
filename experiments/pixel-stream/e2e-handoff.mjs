#!/usr/bin/env node
// End-to-end: stream first, hand off to local. Needs the site in "all" mode with a
// static fleet, and a 2-seat pool:
//   NEXT_PUBLIC_STREAM_MODE=all STREAM_FLEET_STATIC=http://localhost:8787 npx next dev -p 3000
//   SEATS=2 HEADLESS=1 node experiments/pixel-stream/server.mjs
//   node experiments/pixel-stream/e2e-handoff.mjs
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CDP, CHROME_BIN, waitForJson } from './cdp.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, 'results')
const SITE = process.env.SITE ?? 'http://localhost:3000/resume'
const POOL = process.env.POOL ?? 'http://localhost:8787'
const PORT = 9420
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`); if (!ok) failures++ }
await mkdir(OUT, { recursive: true })

const client = spawn(CHROME_BIN, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(HERE, '.chrome-client')}`, '--remote-allow-origins=*',
  '--headless=new', '--no-first-run', '--enable-unsafe-webgpu', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' })
process.on('exit', () => client.kill())
const browser = await CDP.connect((await waitForJson(`http://127.0.0.1:${PORT}/json/version`)).webSocketDebuggerUrl)
const pool = async () => (await fetch(`${POOL}/api/seat`)).json()

// A device = an isolated browser context (its own storage, so its own device id);
// two tabs in the same context are the same device.
const devices = new Map()
async function visitor(name, { device = name, query = '', cpuSlowdown = 1, returning = false } = {}) {
  if (!devices.has(device)) devices.set(device, (await browser.send('Target.createBrowserContext')).browserContextId)
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', newWindow: true, browserContextId: devices.get(device) })
  const t = (await waitForJson(`http://127.0.0.1:${PORT}/json/list`)).find((x) => x.id === targetId)
  const v = await CDP.connect(t.webSocketDebuggerUrl)
  const logs = []
  await v.send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 2, mobile: true })
  await v.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  if (cpuSlowdown > 1) await v.send('Emulation.setCPUThrottlingRate', { rate: cpuSlowdown })
  // A return visit: this device's local copy was ready in 1.5 s last time.
  if (returning) await v.send('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('ps-local-ready-ms', '1500') } catch {}" })
  await v.send('Runtime.enable')
  v.on('Runtime.consoleAPICalled', (e) => { const text = e.args.map((a) => a.value).join(' '); if (text.includes('[resume]')) { logs.push(text); console.log(`  ${name}: ${text}`) } })
  await v.send('Page.navigate', { url: `${SITE}${query}` })
  return { name, v, targetId, logs, t0: Date.now() }
}

const state = (p) => p.v.evaluate(`(() => ({
  iframe: !!document.querySelector('iframe[src*="embed=1"]'),
  localReady: performance.getEntriesByName('casino:scene-ready').length > 0,
  introLocal: performance.getEntriesByName('casino:intro-start').length > 0,
  landedLocal: performance.getEntriesByName('casino:table-landed').length > 0,
}))()`).catch(() => ({}))

async function until(p, pred, ms) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { const s = await state(p); if (pred(s)) return Date.now() - t0; await sleep(200) }
  return null
}
const close = (p) => browser.send('Target.closeTarget', { targetId: p.targetId }).catch(() => {})

console.log('== 0. first visit on a capable device: the stream plays the show at once (no waiting screen)')
const f = await visitor('F')
const fStream = await until(f, (s) => s.iframe, 8000)
const fShow = await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 6000) { if (f.logs.some((l) => l.includes('staying on the stream')) || (await state(f)).introLocal) return Date.now() - t0; await sleep(100) } return null })()
check(fStream != null && fShow != null && fShow < 2500, `F's show started ${fShow} ms after the stream appeared (${f.logs.at(-1) ?? 'no log'})`)
await close(f)
await sleep(4000) // let the seat re-arm

console.log('== 1. capable return visitor: starts streamed, hands off to local, seat goes back')
const a = await visitor('A', { device: 'F' }) // F's browser: warm cache + F's recorded local timing
const streamed = await until(a, (s) => s.iframe, 8000)
check(streamed != null, `A started on the stream (${streamed} ms)`)
const handed = await until(a, (s) => !s.iframe && s.localReady, 25_000)
check(handed != null, `A handed off to local ${handed} ms after landing (${a.logs.at(-1) ?? 'no log'})`)
await sleep(2500)
check((await pool()).busy === 0, 'A\'s seat is back in the pool after the handoff')
await close(a)

console.log('== 2. capable visitor whose local copy is slow: stays on the stream for the show')
await sleep(3000) // let the seat re-arm
const b = await visitor('B', { query: '?streamLocalDelay=9000', returning: true }) // local "ready" only after the show starts
const bStream = await until(b, (s) => s.iframe, 10_000)
check(bStream != null, `B started on the stream (${bStream} ms)`)
await sleep(14_000)
const bState = await state(b)
check(bState.iframe && !bState.introLocal, `B is still streamed through the show, the local copy never jumped in (${b.logs.at(-1) ?? 'no log'})`)
await writeFile(path.join(OUT, 'stream-B.png'), Buffer.from((await b.v.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
await close(b)

console.log('== 3. weak device: stays streamed')
await sleep(3000)
const c = await visitor('C', { query: '?streamDevice=weak' })
const cStream = await until(c, (s) => s.iframe, 10_000)
await sleep(15_000)
const cState = await state(c)
check(cStream != null && cState.iframe && !cState.localReady, 'C is still streamed after 15 s and never loaded the local casino')

console.log('== 4. same device, second tab: takes the seat over')
const c2 = await visitor('C2', { device: 'C', query: '?streamDevice=weak' })
const c2Stream = await until(c2, (s) => s.iframe, 10_000)
const cFell = await until(c, (s) => !s.iframe, 15_000)
await sleep(2000)
const pc = await pool()
check(c2Stream != null && cFell != null, `the new tab streams, the old one fell back (${c.logs.at(-1) ?? 'no log'})`)
check(pc.busy === 1, `still one seat for one device (busy=${pc.busy})`)

console.log('== 5. pool full: next weak visitor renders locally')
const d = await visitor('D', { query: '?streamDevice=weak' })
await until(d, (s) => s.iframe, 10_000)
await sleep(3000)
const e = await visitor('E', { query: '?streamDevice=weak' })
const eLocal = await until(e, (s) => s.localReady && !s.iframe, 25_000)
check(eLocal != null, `E got no seat and rendered locally (${e.logs.at(-1) ?? 'no log'})`)

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed')
process.exit(failures ? 1 : 0)
