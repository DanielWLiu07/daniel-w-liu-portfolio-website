// Minimal Chrome DevTools Protocol client over Node's built-in WebSocket.
export class CDP {
  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl)
    await new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = () => reject(new Error(`CDP connect failed: ${wsUrl}`))
    })
    return new CDP(ws)
  }

  constructor(ws) {
    this.ws = ws
    this.nextId = 0
    this.pending = new Map()
    this.handlers = new Map()
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id) {
        const p = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) p?.reject(new Error(`${p.method}: ${msg.error.message}`))
        else p?.resolve(msg.result)
      } else {
        for (const fn of this.handlers.get(msg.method) ?? []) fn(msg.params)
      }
    }
  }

  send(method, params = {}) {
    const id = ++this.nextId
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject, method }))
  }

  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, [])
    this.handlers.get(method).push(fn)
  }

  async evaluate(expression, opts = {}) {
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, ...opts })
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text)
    return res.result.value
  }
}

export async function waitForJson(url, timeoutMs = 15000) {
  const start = Date.now()
  for (;;) {
    try {
      return await (await fetch(url)).json()
    } catch (err) {
      if (Date.now() - start > timeoutMs) throw err
      await new Promise((r) => setTimeout(r, 150))
    }
  }
}

export const CHROME_BIN = process.env.CHROME ?? ({
  linux: '/usr/bin/google-chrome',
  win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
}[process.platform] ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')

// Linux + NVIDIA (EC2 g4dn): WebGPU through Vulkan with no display. Google's
// headless GPU guide was tested on a T4 with these; --disable-vulkan-surface means
// no X server/Xvfb is needed. Verify with navigator.gpu.requestAdapter().info.
// Windowed on an NVIDIA X display (DISPLAY=:0, see deploy/bootstrap.sh): Chrome
// composites on the GPU there (headless composites on the CPU, ~2-3x slower and
// laggier). WebGPU canvases still don't show on Linux X11, so seats use WebGL.
const LINUX_DISPLAY_FLAGS = ['--no-sandbox', '--ignore-gpu-blocklist', '--enable-features=Vulkan', '--force-device-scale-factor=1']

const LINUX_GPU_FLAGS = [
  '--no-sandbox',
  '--use-angle=vulkan',
  '--enable-features=Vulkan,VulkanFromANGLE',
  '--disable-vulkan-surface',
  '--ignore-gpu-blocklist',
]

// Flags a render server needs: keep rendering when the window is covered, allow
// tab capture without a picker, and expose LAN host candidates for phones.
export function chromeArgs({ cdpPort, profile, width, height, headless }) {
  return [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profile}`,
    '--remote-allow-origins=*',
    '--no-first-run',
    '--no-default-browser-check',
    '--enable-unsafe-webgpu',
    '--auto-accept-this-tab-capture',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=WebRtcHideLocalIpsWithMdns,CalculateNativeWinOcclusion,Translate',
    `--window-size=${width},${height + (headless ? 200 : 120)}`,
    ...(headless ? [`--screen-info={0,0 3840x2880}`] : []),
    '--window-position=40,40',
    ...(headless ? ['--headless=new'] : []),
    ...(process.platform === 'linux' ? (headless ? LINUX_GPU_FLAGS : LINUX_DISPLAY_FLAGS) : []),
    // Windows (GRID driver, auto-logon desktop): GPU compositing, WebGPU and the
    // NVIDIA hardware H.264 encoder (Media Foundation) are all on by default.
    ...(process.platform === 'win32' ? ['--ignore-gpu-blocklist', '--force-device-scale-factor=1'] : []),
    ...(process.env.CHROME_FLAGS ?? '').split(' ').filter(Boolean),
    'about:blank',
  ]
}
