#!/usr/bin/env node
// Opens the viewer in a separate Chrome window (same machine), connects, runs
// the latency probe and quality comparison, and saves screenshots + stats.
//   node experiments/pixel-stream/selftest.mjs [codec] [bitrateKbps]
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CDP, waitForJson } from './cdp.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, 'results')
const CDP_PORT = Number(process.env.CDP_PORT ?? 9333)
const [codec = 'H264', kbps = '8000'] = process.argv.slice(2)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await mkdir(OUT, { recursive: true })

const { webSocketDebuggerUrl } = await waitForJson(`http://127.0.0.1:${CDP_PORT}/json/version`)
const browser = await CDP.connect(webSocketDebuggerUrl)
const { targetId } = await browser.send('Target.createTarget', { url: 'http://localhost:8787/?lab', newWindow: true, width: 1700, height: 1000 })
const target = (await waitForJson(`http://127.0.0.1:${CDP_PORT}/json/list`)).find((t) => t.id === targetId)
const v = await CDP.connect(target.webSocketDebuggerUrl)
await v.send('Emulation.setFocusEmulationEnabled', { enabled: true })
await sleep(1500)

const text = (id) => v.evaluate(`document.getElementById(${JSON.stringify(id)}).textContent`)
const click = (id) => v.evaluate(`document.getElementById(${JSON.stringify(id)}).click()`)

await v.evaluate(`(() => { const s = document.getElementById('codec'); s.value = ${JSON.stringify(codec)};
  const b = document.getElementById('bitrate'); b.value = ${Number(kbps)}; b.oninput() })()`)
await click('connect')
for (let i = 0; i < 100 && (await text('ttff')) === '–'; i++) await sleep(100)
await sleep(4000) // let stats settle
await click('latency')
for (let i = 0; i < 200 && (await v.evaluate(`document.getElementById('latency').disabled`)); i++) await sleep(100)
await click('quality')
await sleep(1500)

const ids = ['ttff', 'lat', 'lat95', 'rtt', 'res', 'fps', 'kbps', 'jb', 'dec', 'lost', 'codecIn', 'gpu', 'rfps', 'enc', 'encms', 'encres', 'limit', 'qp', 'psnr']
const stats = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await text(id)])))
stats.log = await text('log')
const tag = `${codec}-${kbps}`
await writeFile(path.join(OUT, `stats-${tag}.json`), JSON.stringify(stats, null, 2))

// Crops for eyeballing: native vs. streamed at 2x.
for (const id of ['nativeCanvas', 'streamCanvas']) {
  const url = await v.evaluate(`document.getElementById('${id}').toDataURL('image/png')`)
  await writeFile(path.join(OUT, `${id}-${tag}.png`), Buffer.from(url.split(',')[1], 'base64'))
}
const shot = await v.send('Page.captureScreenshot', { format: 'png' })
await writeFile(path.join(OUT, `viewer-${tag}.png`), Buffer.from(shot.data, 'base64'))
console.log(JSON.stringify(stats, null, 2))
await browser.send('Target.closeTarget', { targetId })
process.exit(0)
