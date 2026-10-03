#!/usr/bin/env node
// End-to-end: the real /resume page deciding between stream and local render.
// Needs the site (next dev with NEXT_PUBLIC_STREAM_URL=http://localhost:8787) and
// the pool (SEATS=2) running. Opens visitors in a separate client Chrome:
//   1. visitor A with ?stream=1 → streamed (iframe live, no local casino)
//   2. visitors B, C → B streams, C finds no seat → renders locally
//   3. pool gets SIGTERM (like a Spot interruption) → A falls back to local
//   4. pool gone → a new visitor renders locally right away
//   node experiments/pixel-stream/e2e-fallback.mjs <pool pid>
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CDP, CHROME_BIN, waitForJson } from './cdp.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const poolPid = Number(process.argv[2])
const SITE = process.env.SITE ?? 'http://localhost:3000/resume?streamDevice=weak' // weak devices stay streamed
const PORT = 9410
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`); if (!ok) failures++ }

const client = spawn(CHROME_BIN, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(HERE, '.chrome-client')}`, '--remote-allow-origins=*',
  '--headless=new', '--no-first-run', '--enable-unsafe-webgpu', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' })
process.on('exit', () => client.kill())
const browser = await CDP.connect((await waitForJson(`http://127.0.0.1:${PORT}/json/version`)).webSocketDebuggerUrl)

// Each visitor is its own device (isolated browser context = its own storage and
// device id); one seat per device would otherwise make them replace each other.
async function visitor(name) {
  const { browserContextId } = await browser.send('Target.createBrowserContext')
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', newWindow: true, browserContextId })
  const t = (await waitForJson(`http://127.0.0.1:${PORT}/json/list`)).find((x) => x.id === targetId)
  const v = await CDP.connect(t.webSocketDebuggerUrl)
  await v.send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 2, mobile: true })
  await v.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await v.send('Runtime.enable')
  v.on('Runtime.consoleAPICalled', (e) => { const text = e.args.map((a) => a.value).join(' '); if (text.includes('[resume]')) console.log(`  ${name}: ${text}`) })
  await v.send('Page.navigate', { url: SITE })
  return { name, v, targetId }
}

// What is this visitor's page doing right now?
const mode = (p) => p.v.evaluate(`(() => {
  const local = performance.getEntriesByName('casino:scene-ready').length > 0
  const frame = document.querySelector('iframe[src*="embed=1"]')
  return local ? 'local' : frame ? 'stream' : 'deciding'
})()`).catch(() => 'error')

async function waitMode(p, want, ms) {
  const t0 = Date.now()
  let m
  while (Date.now() - t0 < ms) { if ((m = await mode(p)) === want) return Date.now() - t0; await sleep(200) }
  console.log(`  ${p.name} still ${m}`)
  return null
}

// A stream is live once the embed reported it (the page transition revealed).
const streamLive = async (p, ms) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await p.v.evaluate(`!!document.querySelector('iframe[src*="embed=1"]') && document.readyState === 'complete'`).catch(() => false)) {
      const seat = await (await fetch('http://localhost:8787/api/seat')).json()
      if (seat.busy > 0) return Date.now() - t0
    }
    await sleep(200)
  }
  return null
}

console.log('== 1. one visitor')
const a = await visitor('A')
const aMs = await streamLive(a, 15000)
check(aMs != null && (await mode(a)) === 'stream', `A is streamed (${aMs} ms), no local casino loaded`)

console.log('== 2. two more visitors, 2 seats')
const b = await visitor('B')
await streamLive(b, 15000)
await sleep(3000)
const c = await visitor('C')
const cMs = await waitMode(c, 'local', 20000)
check((await mode(b)) === 'stream', 'B is streamed')
check(cMs != null, `C found no seat and rendered locally (${cMs} ms)`)

console.log('== 3. pool shuts down (SIGTERM, like a Spot interruption)')
process.kill(poolPid, 'SIGTERM')
const fbMs = await waitMode(a, 'local', 20000)
check(fbMs != null, `A fell back to local rendering ${fbMs} ms after the shutdown`)

console.log('== 4. pool gone, new visitor')
await sleep(2000)
const d = await visitor('D')
const dMs = await waitMode(d, 'local', 20000)
check(dMs != null, `D rendered locally right away (${dMs} ms)`)

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed')
process.exit(failures ? 1 : 0)
