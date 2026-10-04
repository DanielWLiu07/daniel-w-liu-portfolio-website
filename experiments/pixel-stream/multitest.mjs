#!/usr/bin/env node
// Many visitors at once: opens N emulated phones (in a separate client Chrome)
// against the pool, reports time-to-live, stream fps and the seat's render fps
// per visitor, then has visitor #1 leave and times how fast the queue moves.
//   node experiments/pixel-stream/multitest.mjs [visitors=5]
// BASE=https://<server> targets a remote pool. Each visitor is its own device
// (browser context), or the one-seat-per-device rule would hand seats around.
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CDP, CHROME_BIN, waitForJson } from './cdp.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const N = Number(process.argv[2] ?? 5)
const PORT = 9400
const BASE = process.env.BASE ?? 'http://localhost:8787'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const client = spawn(CHROME_BIN, [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(HERE, '.chrome-client')}`, '--remote-allow-origins=*',
  '--headless=new', '--no-first-run', '--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank',
], { stdio: 'ignore' })
process.on('exit', () => client.kill())
const browser = await CDP.connect((await waitForJson(`http://127.0.0.1:${PORT}/json/version`)).webSocketDebuggerUrl)

async function openPhone(i) {
  const { browserContextId } = await browser.send('Target.createBrowserContext')
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', newWindow: true, browserContextId })
  const t = (await waitForJson(`http://127.0.0.1:${PORT}/json/list`)).find((x) => x.id === targetId)
  const v = await CDP.connect(t.webSocketDebuggerUrl)
  await v.send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 2, mobile: true })
  await v.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  const phone = { i, targetId, v, t0: Date.now(), liveMs: null }
  await v.send('Page.navigate', { url: `${BASE}/` })
  return phone
}

const isLive = (p) => p.v.evaluate(`document.body.classList.contains('live')`).catch(() => false)
const text = (p, id) => p.v.evaluate(`document.getElementById('${id}').textContent`).catch(() => '?')

async function waitLive(p, timeoutMs = 20000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await isLive(p)) return (p.liveMs = Date.now() - p.t0)
    await sleep(50)
  }
  return null
}

const phones = []
for (let i = 0; i < N; i++) phones.push(await openPhone(i + 1))
await Promise.all(phones.map((p) => waitLive(p, 8000)))
console.log('\n== all visitors arrive at once')
for (const p of phones) console.log(`visitor ${p.i}: ${p.liveMs != null ? `live after ${p.liveMs} ms` : `not live — "${await text(p, 'gateMsg')}"`}`)

await sleep(8000) // everyone watching their intro
console.log('\n== while everyone watches (8 s in)')
for (const p of phones.filter((p) => p.liveMs != null)) {
  console.log(`visitor ${p.i}: ${await text(p, 'phase')} · seat renders ${await text(p, 'rfps')} fps · phone receives ${await text(p, 'fps')} fps · ${await text(p, 'res')} · ${await text(p, 'kbps')}`)
}
console.log('pool:', await text(phones[0], 'pool'))

const queued = phones.find((p) => p.liveMs == null)
if (queued) {
  console.log(`\n== visitor 1 leaves; visitor ${queued.i} is in line`)
  const left = Date.now()
  await browser.send('Target.closeTarget', { targetId: phones[0].targetId })
  phones.shift()
  queued.t0 = left
  const ms = await waitLive(queued, 20000)
  console.log(`visitor ${queued.i}: ${ms != null ? `got the freed seat and went live ${ms} ms after visitor 1 left` : 'still waiting'}`)
  await sleep(1500)
  console.log(`visitor ${queued.i}: ${await text(queued, 'phase')} · seat renders ${await text(queued, 'rfps')} fps`)
}

for (const p of phones) await browser.send('Target.closeTarget', { targetId: p.targetId }).catch(() => {})
await sleep(500)
process.exit(0)
