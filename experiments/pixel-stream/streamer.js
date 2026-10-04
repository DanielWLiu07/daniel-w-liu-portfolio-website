// Injected into the rendered page on the server (every navigation). Captures
// this tab and sends it to one viewer over WebRTC. Viewer input arrives on data
// channels and goes back to Node (binding __psSend), which replays it through
// CDP as trusted mouse events.
;(() => {
  if (window.top !== window || window.__ps) return
  // Warm but not started: the casino holds its intro until a visitor is watching.
  window.__casinoHoldIntro = true

  // The visitor's own page draws the real navbar over the stream, so the seat's
  // copy is hidden (clicking it would navigate this server tab, not the visitor).
  const style = document.createElement('style')
  // No scrollbar either: then a 1x capture *is* the page and needs no per-frame
  // crop (cropping runs JS on the page's main thread, competing with the scene).
  style.textContent = 'nav.casino-nav { display: none !important; } html { scrollbar-width: none !important; } ::-webkit-scrollbar { display: none !important; }'
  // This runs before the document exists; attach once there is somewhere to.
  if (document.documentElement) document.documentElement.appendChild(style)
  else new MutationObserver((_, obs) => { if (document.documentElement) { document.documentElement.appendChild(style); obs.disconnect() } }).observe(document, { childList: true })

  // Links clicked inside the stream open for the visitor, not in this server tab:
  // same-site paths navigate the visitor's page, everything else opens a new tab.
  document.addEventListener('click', (e) => {
    const a = e.target instanceof Element ? e.target.closest('a[href]') : null
    if (!a) return
    e.preventDefault()
    const url = new URL(a.href, location.href)
    send(url.origin === location.origin
      ? { to: 'viewer', type: 'navigate', path: url.pathname + url.search + url.hash }
      : { to: 'viewer', type: 'open', href: url.href })
  }, true)
  // Start the bandwidth estimate near the real link instead of ~0.3 Mbps; the
  // intro's card burst is the hardest thing to compress and comes first.
  // VP8 has no a=fmtp line of its own, so one is added for it (and any video codec
  // without one); otherwise the hint never applies and VP8 ramps up from ~0.3 Mbps.
  // Start high so the card burst isn't starved while the estimate ramps. The floor
  // is per connection (start()): a Wi-Fi hiccup at connect can drop the estimate to
  // the floor and it then needs ~10 s to climb, right through the card burst, so a
  // fast link gets a high floor; a weak or unknown link a low one, so it can still
  // adapt instead of looping on loss.
  let floorKbps = 1000
  const boost = () => `x-google-start-bitrate=10000;x-google-min-bitrate=${floorKbps};x-google-max-bitrate=16000`
  // Ours replace any hints already present (the viewer's answer carries its own).
  const boostSdp = (sdp) => {
    const out = sdp.replace(/a=fmtp:\d+ [^\r\n]*/g, (line) =>
      line.includes('apt=') || line.includes('/') ? line : `${line.replace(/;?x-google-[a-z-]+=\d+/g, '')};${boost()}`)
    return out.replace(/a=rtpmap:(\d+) (VP8|VP9|AV1|H264)\/90000\r\n/g, (line, pt) =>
      out.includes(`a=fmtp:${pt} `) ? line : `${line}a=fmtp:${pt} ${boost()}\r\n`)
  }
  // Negotiate frame descriptors so encoded frames carry frame ids/dependencies:
  // the viewer's low-latency decoder needs them to detect a lost frame (and freeze
  // until a keyframe) instead of decoding past the gap into a smeared picture.
  const FRAME_DESCRIPTORS = [
    'https://aomediacodec.github.io/av1-rtp-spec/#dependency-descriptor-rtp-header-extension',
    'http://www.webrtc.org/experiments/rtp-hdrext/generic-frame-descriptor-00',
  ]
  const addFrameDescriptors = (sdp) => {
    const sections = sdp.split(/(?=^m=)/m)
    return sections.map((sec) => {
      if (!sec.startsWith('m=video')) return sec
      const used = new Set([...sec.matchAll(/^a=extmap:(\d+)/gm)].map((m) => Number(m[1])))
      let out = sec
      for (const uri of FRAME_DESCRIPTORS) {
        if (out.includes(uri)) continue
        let id = 1
        while (used.has(id) && id < 14) id++
        if (used.has(id)) break
        used.add(id)
        out = out.replace(/(^a=mid:[^\r\n]*\r\n)/m, `$1a=extmap:${id} ${uri}\r\n`)
      }
      return out
    }).join('')
  }
  const send = (msg) => window.__psSend?.(JSON.stringify(msg))
  let track = null // the raw tab capture
  let cropped = null // track cropped to the page, when the capture comes out larger than it
  const sendTrack = () => cropped ?? track
  let pc = null
  let probeEl = null
  let statsTimer = 0
  let keepAliveEl = null

  // Page-side render rate: what the server GPU is actually producing.
  let rafFrames = 0
  const countFrame = () => { rafFrames++; requestAnimationFrame(countFrame) }
  requestAnimationFrame(countFrame)

  // One real frame's size (the track's settings can disagree with what arrives).
  async function frameSize(t) {
    const clone = t.clone()
    const reader = new MediaStreamTrackProcessor({ track: clone }).readable.getReader()
    const { value: frame } = await reader.read()
    const size = { width: frame.displayWidth, height: frame.displayHeight }
    frame.close()
    await reader.cancel().catch(() => {})
    clone.stop()
    return size
  }

  // Two marker pixels (pure magenta, 4 CSS px) at the viewport's top-left and
  // bottom-right corners, shown only while measuring.
  // They flicker between two magenta shades every frame: a still page produces
  // new capture frames only when something changes (rarely, on Linux headless).
  let markerTick = 0
  function markers(on) {
    for (const el of document.querySelectorAll('[data-ps-marker]')) el.remove()
    markerTick++
    if (!on) return
    const els = [{ left: '0', top: '0' }, { right: '0', bottom: '0' }].map((corner) => {
      const el = document.createElement('div')
      el.dataset.psMarker = ''
      Object.assign(el.style, { position: 'fixed', width: '4px', height: '4px', background: '#ff00ff', zIndex: '2147483647', pointerEvents: 'none', ...corner })
      document.documentElement.appendChild(el)
      return el
    })
    const tick = markerTick
    let flip = false
    const flicker = () => {
      if (tick !== markerTick) return
      flip = !flip
      for (const el of els) el.style.background = flip ? '#fe00fe' : '#ff00ff'
      requestAnimationFrame(flicker)
    }
    requestAnimationFrame(flicker)
  }

  // The page's rect inside the captured frame, from the two markers; null when a
  // corner is missing (the capture is clipped). A held page changes rarely, so
  // frames come slowly: scan each as it arrives and stop at the first with both.
  const timings = {}
  async function locatePage(source) {
    const t0 = performance.now()
    markers(true)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    await new Promise((r) => setTimeout(r, 60))
    const clone = source.clone()
    const reader = new MediaStreamTrackProcessor({ track: clone }).readable.getReader()
    let rect = null
    let frames = 0
    try {
      while (!rect && performance.now() - t0 < 2500) {
        const { value: frame } = await reader.read()
        if (!frame) break
        frames++
        rect = findMarkers(frame)
        frame.close()
      }
    } finally {
      await reader.cancel().catch(() => {})
      clone.stop()
      markers(false)
    }
    Object.assign(timings, { ms: Math.round(performance.now() - t0), frames })
    return rect
  }

  function findMarkers(frame) {
    const fw = frame.displayWidth
    const fh = frame.displayHeight
    const canvas = new OffscreenCanvas(fw, fh)
    const g = canvas.getContext('2d', { willReadFrequently: true })
    g.drawImage(frame, 0, 0)
    const px = g.getImageData(0, 0, fw, fh).data
    const magenta = (x, y) => { const i = (y * fw + x) * 4; return px[i] > 230 && px[i + 1] < 40 && px[i + 2] > 230 }
    // Markers are >= 4 device px, so a stride-3 scan cannot miss one; then step
    // outward to the exact edges.
    let x0 = fw, y0 = fh, x1 = -1, y1 = -1
    for (let y = 0; y < fh; y += 3) {
      for (let x = 0; x < fw; x += 3) {
        if (!magenta(x, y)) continue
        if (x + y < x0 + y0) { x0 = x; y0 = y }
        if (x + y > x1 + y1) { x1 = x; y1 = y }
      }
    }
    if (x1 < 0) return null
    while (x0 > 0 && magenta(x0 - 1, y0)) x0--
    while (y0 > 0 && magenta(x0, y0 - 1)) y0--
    while (x1 < fw - 1 && magenta(x1 + 1, y1)) x1++
    while (y1 < fh - 1 && magenta(x1, y1 + 1)) y1++
    // Both corners present: the markers span the whole viewport.
    const w = x1 - x0 + 1
    const h = y1 - y0 + 1
    if (w < 16 || h < 16) return null
    const snap = (v) => Math.max(0, Math.round(v / 2) * 2)
    return { frame: `${fw}x${fh}`, x: snap(x0), y: snap(y0), width: snap(w), height: snap(h) }
  }

  // A track that is the capture cropped to rect (zero-copy: each frame keeps its
  // buffer and only changes its visible rect).
  function cropTo(source, rect) {
    const processor = new MediaStreamTrackProcessor({ track: source })
    const generator = new MediaStreamTrackGenerator({ kind: 'video' })
    processor.readable
      .pipeThrough(new TransformStream({
        transform(frame, out) {
          const x = Math.min(rect.x, frame.displayWidth - 2)
          const y = Math.min(rect.y, frame.displayHeight - 2)
          const width = Math.min(rect.width, frame.displayWidth - x) & ~1
          const height = Math.min(rect.height, frame.displayHeight - y) & ~1
          out.enqueue(new VideoFrame(frame, { visibleRect: { x, y, width, height } }))
          frame.close()
        },
      }))
      .pipeTo(generator.writable)
      .catch(() => {})
    generator.contentHint = source.contentHint
    return generator
  }

  let scaleDown = 1 // the page may be captured larger than its pixel grid (e.g. 2x)

  async function useCrop(rect, want, attempts) {
    const whole = rect && rect.x === 0 && rect.y === 0 && `${rect.width}x${rect.height}` === rect.frame
    const next = rect && !whole ? cropTo(track, rect) : null
    cropped?.stop()
    cropped = next
    scaleDown = rect ? Math.max(1, rect.width / want.width) : 1
    const sender = pc?.getSenders()[0]
    if (sender) {
      await sender.replaceTrack(sendTrack())
      await applyParams({})
    }
    return { frame: rect?.frame, page: rect && `${rect.width}x${rect.height}@${rect.x},${rect.y}`, sent: `${want.width}x${want.height}`, scaleDown: +scaleDown.toFixed(3), cropped: !!cropped, attempts }
  }

  const ps = (window.__ps = {
    // New screen shape: capture again at the new pixel size (a live capture won't
    // grow past the size it started at) and hot-swap it into the connection.
    async resize() {
      const hint = sendTrack()?.contentHint || 'detail'
      ps.stopCapture({ keepPeer: true }) // a tab can't be captured twice at once
      await ps.capture()
      track.contentHint = hint
      await pc?.getSenders()[0]?.replaceTrack(track)
      return ps.ensureSize()
    },

    // Headless tab capture doesn't reliably match the page: depending on timing
    // and platform the frame is the page scaled (e.g. 2x), or the whole window with
    // the page in a corner, or clipped. So measure instead of assuming: flash a
    // marker pixel at two opposite corners of the viewport, find them in a raw
    // frame, crop to that rect, and let the encoder scale it to the page's size.
    async ensureSize() {
      const even = (v) => Math.max(2, Math.round(v / 2) * 2)
      const want = { width: even(innerWidth * devicePixelRatio), height: even(innerHeight * devicePixelRatio) }
      let found = null
      const t0 = performance.now()
      for (let attempt = 0; attempt < 4; attempt++) {
        if (!track) {
          await ps.capture()
          await pc?.getSenders()[0]?.replaceTrack(track)
        }
        found = await locatePage(track)
        // Windowed on an X display, Chrome scales the tab up to the screen's size
        // (e.g. a 1280x720 page captured as 2560x1440): ask for 1x instead, which
        // halves capture/crop/encode work, then measure again.
        if (found && found.width > want.width * 1.15) {
          const k = found.width / want.width
          const [fw, fh] = found.frame.split('x').map(Number)
          await track.applyConstraints({ width: { ideal: Math.round(fw / k) }, height: { ideal: Math.round(fh / k) }, frameRate: { ideal: 60, max: 60 } }).catch(() => {})
          found = (await locatePage(track)) ?? found
        }
        if (found) return { ...(await useCrop(found, want, attempt)), ms: Math.round(performance.now() - t0), timings }
        ps.stopCapture({ keepPeer: true }) // a corner is missing (clipped): capture again
      }
      if (!track) await ps.capture()
      return useCrop(null, want, 4)
    },

    async capture() {
      if (track?.readyState === 'live') { const s = track.getSettings(); return { width: s.width, height: s.height } }
      {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          // No size constraints: Chrome would scale the whole surface to fit them,
          // moving the page. Native size, then crop to the page (ensureSize).
          video: { frameRate: { ideal: 60, max: 60 } },
          audio: false,
          preferCurrentTab: true,
          selfBrowserSurface: 'include',
          surfaceSwitching: 'exclude',
        })
        track = stream.getVideoTracks()[0]
      }
      const s = track.getSettings()
      return { width: s.width, height: s.height, frameRate: s.frameRate }
    },

    // Latency probe: a 24px square in the top-left corner flips black/white.
    probe(value) {
      if (!probeEl?.isConnected) {
        probeEl = document.createElement('div')
        Object.assign(probeEl.style, {
          position: 'fixed', left: '0', top: '0', width: '24px', height: '24px',
          zIndex: '2147483647', pointerEvents: 'none', background: '#000',
        })
        document.documentElement.appendChild(probeEl)
      }
      probeEl.style.background = value ? '#fff' : '#000'
    },


    // Spin up the video encoder before any visitor arrives (the macOS hardware
    // H.264 encoder takes ~1.4 s to start the first time in a process): encode a
    // few frames over a loopback connection inside the page, then tear it down.
    async warmEncoder(codec = 'H264') {
      const cv = document.createElement('canvas')
      cv.width = 640
      cv.height = 360
      const g = cv.getContext('2d')
      const tr = cv.captureStream(30).getVideoTracks()[0]
      const a = new RTCPeerConnection()
      const b = new RTCPeerConnection()
      a.onicecandidate = (e) => e.candidate && b.addIceCandidate(e.candidate)
      b.onicecandidate = (e) => e.candidate && a.addIceCandidate(e.candidate)
      const tx = a.addTransceiver(tr, { direction: 'sendonly' })
      const all = RTCRtpSender.getCapabilities('video').codecs
      const want = all.filter((c) => c.mimeType === `video/${codec}`)
      if (want.length) tx.setCodecPreferences([...want, ...all.filter((c) => !want.includes(c))])
      await a.setLocalDescription()
      await b.setRemoteDescription(a.localDescription)
      await b.setLocalDescription()
      await a.setRemoteDescription(b.localDescription)
      const t0 = performance.now()
      let encoder = null
      for (let i = 0; performance.now() - t0 < 4000; i++) {
        g.fillStyle = `hsl(${i * 23}, 60%, 50%)`
        g.fillRect(0, 0, 640, 360)
        await new Promise((r) => setTimeout(r, 33))
        const stats = await a.getStats()
        stats.forEach((s) => { if (s.type === 'outbound-rtp' && s.framesEncoded > 3) encoder = s.encoderImplementation })
        if (encoder) break
      }
      a.close()
      b.close()
      tr.stop()
      return { ms: Math.round(performance.now() - t0), encoder }
    },

    // Real delivered frame size of what is being sent.
    async captureInfo() {
      const t = sendTrack()
      if (!t) return null
      const size = await frameSize(t)
      return { ...size, viewport: `${innerWidth}x${innerHeight}@${devicePixelRatio}`, cropped: !!cropped }
    },

    // Idle seats hold no capture (a live capture can't survive a page freeze).
    stopCapture({ keepPeer = false } = {}) {
      if (!keepPeer) stop()
      cropped?.stop()
      cropped = null
      track?.stop()
      track = null
    },

    // The viewer's low-latency decoder lost the chain and needs a keyframe now.
    // Briefly deactivating the encoding restarts the encoder, which starts with one.
    async keyframe() {
      const sender = pc?.getSenders()[0]
      if (!sender) return
      const off = sender.getParameters()
      if (!off.encodings?.length) return
      off.encodings[0].active = false
      await sender.setParameters(off).catch(() => {})
      const on = sender.getParameters()
      on.encodings[0].active = true
      await sender.setParameters(on).catch(() => {})
    },

    releaseIntro() {
      document.documentElement.dataset.introReleased = '1'
      window.dispatchEvent(new Event('casino:release-intro'))
      ps.keepAlive(false)
    },

    // A held scene doesn't redraw, and tab capture only emits frames on change.
    // Until the intro starts, flicker one near-invisible pixel every frame so the
    // visitor's video keeps flowing (and the encoder warms up on the real frame).
    keepAlive(on) {
      if (!on) { if (keepAliveEl) keepAliveEl.remove(); keepAliveEl = null; return }
      if (keepAliveEl) return
      const el = (keepAliveEl = document.createElement('div'))
      // Full opacity: a near-transparent change doesn't count as damage for Linux's
      // software compositor, so no frames would flow. Two almost identical darks.
      Object.assign(el.style, { position: 'fixed', right: '0', bottom: '0', width: '2px', height: '2px', zIndex: '2147483647', pointerEvents: 'none', background: '#0b0b0b' })
      document.documentElement.appendChild(el)
      let flip = false
      const tick = () => { if (keepAliveEl !== el) return; flip = !flip; el.style.background = flip ? '#0b0b0b' : '#0d0d0d'; requestAnimationFrame(tick) }
      requestAnimationFrame(tick)
    },

    async onSignal(m) {
      if (m.type === 'start') return start(m)
      // An answer to an older offer (the viewer reconnected meanwhile) would fail the new connection.
      if (m.type === 'answer') return m.conn && m.conn !== conn ? undefined : pc?.setRemoteDescription({ type: 'answer', sdp: boostSdp(m.sdp.sdp) })
      if (m.type === 'params') return applyParams(m)
      if (m.type === 'stop') stop()
    },
  })

  const INPUT_KINDS = new Set(['move', 'down', 'up', 'wheel', 'probe', 'keyframe'])
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  // The viewer's current connection attempt (offers and answers carry it).
  let conn = null

  function stop() {
    clearInterval(statsTimer)
    pc?.close()
    pc = null
  }

  async function start({ codec, maxBitrateKbps, contentHint, iceServers, conn: id, downlinkMbps }) {
    stop()
    conn = id ?? null
    adaptive = 1
    fpsCap = 60
    // The viewer's own link estimate (Chrome's navigator.connection.downlink, capped at 10).
    floorKbps = downlinkMbps >= 9 ? 6000 : downlinkMbps >= 4 ? 3000 : 1000
    await ps.capture()
    if (window.__casinoHoldIntro && !document.documentElement.dataset.introReleased) ps.keepAlive(true)
    track.contentHint = contentHint || 'detail'
    if (cropped) cropped.contentHint = track.contentHint
    pc = new RTCPeerConnection({ iceServers: iceServers ?? [] })
    const transceiver = pc.addTransceiver(sendTrack(), { direction: 'sendonly' })
    if (codec) {
      const all = RTCRtpSender.getCapabilities('video').codecs
      // H.264: prefer High profile (profile-level-id 64xxxx), ~10-20% fewer bits
      // than Constrained Baseline at the same quality; the GPU encoder supports it.
      const rank = (c) => (/profile-level-id=64/i.test(c.sdpFmtpLine ?? '') ? 0 : /profile-level-id=4d/i.test(c.sdpFmtpLine ?? '') ? 1 : 2)
      const preferred = all.filter((c) => c.mimeType.toLowerCase() === `video/${codec.toLowerCase()}`).sort((a, b) => rank(a) - rank(b))
      if (preferred.length) transceiver.setCodecPreferences([...preferred, ...all.filter((c) => !preferred.includes(c))])
    }
    // Unordered/unreliable for pointer moves (never block on a lost packet),
    // reliable for presses, wheel and latency probes.
    for (const [label, init] of [['fast', { ordered: false, maxRetransmits: 0 }], ['rel', {}]]) {
      pc.createDataChannel(label, init).onmessage = (e) => {
        // Only input, rebuilt field by field: the visitor must not be able to send
        // any other message type (or non-numeric values) to the pool.
        let m
        try { m = JSON.parse(e.data) } catch { return }
        if (!m || !INPUT_KINDS.has(m.kind)) return
        send({ type: 'input', kind: m.kind, x: num(m.x), y: num(m.y), dx: num(m.dx), dy: num(m.dy), buttons: m.buttons ? 1 : 0, value: m.value ? 1 : 0 })
      }
    }
    const thisPc = pc
    const offer = await pc.createOffer()
    await pc.setLocalDescription({ type: 'offer', sdp: addFrameDescriptors(boostSdp(offer.sdp)) })
    await new Promise((resolve) => {
      if (thisPc.iceGatheringState === 'complete') return resolve()
      thisPc.addEventListener('icegatheringstatechange', () => thisPc.iceGatheringState === 'complete' && resolve())
      setTimeout(resolve, 2000)
    })
    await applyParams({ maxBitrateKbps })
    send({ to: 'viewer', type: 'offer', conn, sdp: pc.localDescription.toJSON() })
    startStats(thisPc)
  }

  // Bandwidth-adaptive resolution. The estimate sometimes starts low or collapses
  // (a Wi-Fi hiccup while the intro is held) and needs ~10 s to climb back; the GPU
  // encoder then drops frames rather than shrinking (2-30 fps through the card
  // burst). Shrinking the picture while the estimate is low keeps motion at 60 fps:
  // down at once, back up only once the estimate has clearly recovered.
  // The GPU encoder skips frames rather than coarsening them when the budget is
  // tight, so below ~6 Mbps the card burst stuttered at 5-39 fps even at a quarter
  // of the pixels. A steady 30 fps cap there gave 26-32 fps: smooth, if less fluid.
  let adaptive = 1
  let fpsCap = 60
  const ADAPT = [[1800, 2.5], [3500, 2], [6000, 1.5]] // below kbps → scale
  function adaptTo(targetKbps) {
    if (!(targetKbps > 0)) return
    const want = ADAPT.find(([below]) => targetKbps < below)?.[1] ?? 1
    // Going up a level needs 40% headroom over that level's threshold.
    const up = want < adaptive && targetKbps >= 1.4 * (ADAPT.find(([, sc]) => sc === adaptive)?.[0] ?? 0)
    const fps = targetKbps < 6000 ? 30 : targetKbps >= 8400 ? 60 : fpsCap
    if (want > adaptive || up || fps !== fpsCap) {
      if (want > adaptive || up) adaptive = want
      fpsCap = fps
      applyParams({})
    }
  }

  async function applyParams({ maxBitrateKbps, maxFramerate }) {
    const sender = pc?.getSenders()[0]
    if (!sender) return
    const p = sender.getParameters()
    if (!p.encodings?.length) p.encodings = [{}]
    if (maxBitrateKbps) p.encodings[0].maxBitrate = maxBitrateKbps * 1000
    p.encodings[0].maxFramerate = maxFramerate || fpsCap
    p.encodings[0].scaleResolutionDownBy = scaleDown * adaptive
    // Under a bandwidth squeeze (the card burst makes huge frames and the estimate
    // drops), 'maintain-resolution' made the encoder drop frames (choppy). Balanced
    // lowers resolution for a moment instead, keeping motion smooth.
    p.degradationPreference = 'balanced'
    await sender.setParameters(p).catch((err) => send({ to: 'viewer', type: 'log', text: `setParameters: ${err.message}` }))
  }

  function startStats(thisPc) {
    let prev = null
    let prevRaf = rafFrames
    let prevT = performance.now(), prevNet = {}
    statsTimer = setInterval(async () => {
      if (thisPc !== pc) return
      const now = performance.now()
      const renderFps = ((rafFrames - prevRaf) * 1000) / (now - prevT)
      prevRaf = rafFrames
      prevT = now
      const report = await thisPc.getStats()
      let out = null, pair = null, remote = null
      report.forEach((s) => {
        if (s.type === 'outbound-rtp' && s.kind === 'video') out = s
        else if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') pair = s
        else if (s.type === 'remote-inbound-rtp' && s.kind === 'video') remote = s
      })
      if (!out) return
      const encodeMs = prev && out.framesEncoded > prev.framesEncoded
        ? ((out.totalEncodeTime - prev.totalEncodeTime) / (out.framesEncoded - prev.framesEncoded)) * 1000
        : null
      // Network health for the timeline: what the bandwidth estimator sees.
      const lost = remote ? remote.packetsLost - (prevNet.lost ?? remote.packetsLost) : null
      const nacks = out.nackCount - (prevNet.nacks ?? out.nackCount)
      const plis = out.pliCount - (prevNet.plis ?? out.pliCount)
      prevNet = { lost: remote?.packetsLost, nacks: out.nackCount, plis: out.pliCount }
      prev = out
      adaptTo(out.targetBitrate / 1000)
      // Viewers behind strict networks reach us through Cloudflare's TURN relay;
      // the pool meters those bytes against a monthly cap.
      const remoteCandidate = pair && report.get(pair.remoteCandidateId)
      send({
        adaptScale: adaptive,
        fpsCap,
        floorKbps,
        relay: remoteCandidate?.candidateType === 'relay',
        pairBytes: pair ? (pair.bytesSent ?? 0) + (pair.bytesReceived ?? 0) : 0,
        bweKbps: pair?.availableOutgoingBitrate ? pair.availableOutgoingBitrate / 1000 : null,
        rttMs: remote?.roundTripTime != null ? remote.roundTripTime * 1000 : pair?.currentRoundTripTime != null ? pair.currentRoundTripTime * 1000 : null,
        lost, nacks, plis,
        to: 'viewer',
        type: 'senderStats',
        renderFps,
        encoder: out.encoderImplementation,
        powerEfficient: out.powerEfficientEncoder,
        encodeFps: out.framesPerSecond,
        encodeMs,
        width: out.frameWidth,
        height: out.frameHeight,
        targetKbps: out.targetBitrate ? out.targetBitrate / 1000 : null,
        limitation: out.qualityLimitationReason,
        qp: out.qpSum && out.framesEncoded ? out.qpSum / out.framesEncoded : null,
      })
    }, 1000)
  }
})()
