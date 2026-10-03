#!/usr/bin/env node
// Measure a deployed server from this machine, over the real internet:
// connect as a phone-shaped visitor, wait through the intro (card burst), run
// the latency probe, and print the seat's per-second render/encode timeline.
//   node experiments/pixel-stream/remotetest.mjs http://35.182.211.74 <LAB_TOKEN> [codec]
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CDP, CHROME_BIN, waitForJson } from './cdp.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const [base, token = '', codec = '', kbps = ''] = process.argv.slice(2)
const PORT = 9460
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const client = spawn(CHROME_BIN, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(HERE, '.chrome-client-remote')}`, '--remote-allow-origins=*',
  '--headless=new', '--no-first-run', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' })
process.on('exit', () => client.kill())
const t = (await waitForJson(`http://127.0.0.1:${PORT}/json/list`)).find((x) => x.type === 'page')
const v = await CDP.connect(t.webSocketDebuggerUrl)
await v.send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false })
await v.send('Emulation.setFocusEmulationEnabled', { enabled: true })
const t0 = Date.now()
await v.send('Page.navigate', { url: `${base}/?lab${process.env.MODE ?? ''}` })
await sleep(1500)
const text = (id) => v.evaluate(`document.getElementById(${JSON.stringify(id)}).textContent`)
if (codec) await v.evaluate(`document.getElementById('codec').value = ${JSON.stringify(codec)}`)
if (kbps) await v.evaluate(`(() => { const b = document.getElementById('bitrate'); b.value = ${Number(kbps)}; b.oninput() })()`)
await v.evaluate(`document.getElementById('connect').click()`)
for (let i = 0; i < 100 && (await text('ttff')) === '–'; i++) await sleep(100)
console.log(`connect → first frame: ${await text('ttff')}  (page open → ${Date.now() - t0} ms)`)
// The lab viewer starts the intro itself once the stream is smooth; let it play through the cards.
await sleep(16_000)
console.log(`renderer: ${await text('renderer')}`)
console.log(`network RTT ${await text('rtt')} · received ${await text('res')} @ ${await text('fps')} fps · ${await text('kbps')} · jitter buffer ${await text('jb')} · lost/dropped ${await text('lost')}`)
console.log(`server: ${await text('gpu')} · render ${await text('rfps')} fps · encoder ${await text('enc')} ${await text('encms')} · avg QP ${await text('qp')} · limited by ${await text('limit')}`)
await v.evaluate(`document.getElementById('latency').click()`)
for (let i = 0; i < 200 && (await v.evaluate(`document.getElementById('latency').disabled`)); i++) await sleep(100)
console.log(`click-to-photon: median ${await text('lat')}, p95 ${await text('lat95')}`)
// What the visitor actually received, as an image.
const { writeFile } = await import('node:fs/promises')
const frame = await v.evaluate(`(() => { const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight; c.getContext('2d').drawImage(video, 0, 0); return c.toDataURL('image/jpeg', 0.85) })()`)
await writeFile(path.join(HERE, 'results', `remote-frame-${codec || 'default'}-${kbps || 'default'}.jpg`), Buffer.from(frame.split(',')[1], 'base64'))
const st = await (await fetch(`${base}/status?token=${token}&timeline`)).json()
const seat = st.seats.find((s) => s.owner) ?? st.seats[0]
console.log('\nseat timeline (s since intro: render fps / encode fps / encode ms):')
console.log(seat.timeline.filter((r) => r.t != null).slice(0, 20).map((r) => `${r.t}:${r.render}/${r.encode}/${r.encodeMs}`).join('  '))
process.exit(0)
