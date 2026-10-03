#!/usr/bin/env node
// How many concurrent visitors can one GPU render? Opens N extra copies of the
// site in the running server's Chrome (each copy = one visitor's private
// session) and reports every session's render fps. No encoding cost included.
//   node experiments/pixel-stream/bench-sessions.mjs 1 2 4 6
import { CDP, waitForJson } from './cdp.mjs'

const CDP_PORT = Number(process.env.CDP_PORT ?? 9333)
const SITE_URL = process.env.SITE_URL ?? 'http://localhost:3000/resume'
const counts = process.argv.slice(2).map(Number)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const { webSocketDebuggerUrl } = await waitForJson(`http://127.0.0.1:${CDP_PORT}/json/version`)
const browser = await CDP.connect(webSocketDebuggerUrl)
const FPS = `new Promise((resolve) => { let n = 0; const t0 = performance.now();
  const tick = () => { n++; performance.now() - t0 < 3000 ? requestAnimationFrame(tick) : resolve(n * 1000 / (performance.now() - t0)) };
  requestAnimationFrame(tick) })`

const sessions = []
for (const n of counts) {
  while (sessions.length < n) {
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', newWindow: true })
    const t = (await waitForJson(`http://127.0.0.1:${CDP_PORT}/json/list`)).find((x) => x.id === targetId)
    const s = await CDP.connect(t.webSocketDebuggerUrl)
    await s.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false })
    await s.send('Emulation.setFocusEmulationEnabled', { enabled: true })
    await s.send('Page.navigate', { url: SITE_URL })
    sessions.push({ targetId, s })
  }
  await sleep(14000) // let every copy finish its intro and settle at the table
  const extra = await Promise.all(sessions.map(({ s }) => s.evaluate(FPS).catch(() => 0)))
  const fps = extra.map((f) => f.toFixed(0))
  console.log(`${n + 1} sessions (server tab + ${n}): fps per session [${fps.join(', ')}]  min ${Math.min(...extra).toFixed(0)}`)
}
for (const { targetId } of sessions) await browser.send('Target.closeTarget', { targetId })
process.exit(0)
