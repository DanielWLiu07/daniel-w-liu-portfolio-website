#!/usr/bin/env node
// Opens the play-mode viewer as an emulated phone (iPhone-sized, portrait),
// waits for the stream, and saves what the phone would see.
//   node experiments/pixel-stream/phonetest.mjs [width] [height]
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { CDP, CHROME_BIN, waitForJson } from './cdp.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// A separate client browser: opening the viewer inside a seat's own Chrome
// disturbs that seat's window and capture.
const CDP_PORT = 9440
const [w = 393, h = 852] = process.argv.slice(2).map(Number)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await mkdir(path.join(HERE, 'results'), { recursive: true })

const client = spawn(CHROME_BIN, [`--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${path.join(HERE, '.chrome-client-phone')}`, '--remote-allow-origins=*',
  '--headless=new', '--no-first-run', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' })
process.on('exit', () => client.kill())
const { webSocketDebuggerUrl } = await waitForJson(`http://127.0.0.1:${CDP_PORT}/json/version`)
const browser = await CDP.connect(webSocketDebuggerUrl)
const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', newWindow: true })
const t = (await waitForJson(`http://127.0.0.1:${CDP_PORT}/json/list`)).find((x) => x.id === targetId)
const v = await CDP.connect(t.webSocketDebuggerUrl)
await v.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 3, mobile: true })
await v.send('Emulation.setFocusEmulationEnabled', { enabled: true })
const t0 = Date.now()
await v.send('Page.navigate', { url: 'http://localhost:8787/' })
let shown = ''
for (let i = 0; i < 150; i++) {
  shown = await v.evaluate(`document.getElementById('overlay').textContent + '|' + document.getElementById('video').videoWidth + 'x' + document.getElementById('video').videoHeight`).catch(() => '')
  if (/^\|[1-9]/.test(shown)) break
  await sleep(100)
}
console.log('page open → picture on screen', Date.now() - t0, 'ms; video', shown.split('|')[1])
await sleep(2500)
const shot = await v.send('Page.captureScreenshot', { format: 'png' })
await writeFile(path.join(HERE, 'results', `phone-${w}x${h}.png`), Buffer.from(shot.data, 'base64'))
await browser.send('Target.closeTarget', { targetId })
process.exit(0)
