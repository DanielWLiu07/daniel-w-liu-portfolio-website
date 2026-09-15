/** Native canvas artwork, baked only when the background preset changes. */
export const BACKDROP_STYLES = ['Original dark room', 'Velvet wash', 'Gilded arches', 'Ghost suits', 'Red / green ink', 'Theatre lights', 'Roulette orbit', 'Paper collage', 'Emerald salon', 'Card-back engraving', 'Printed sunburst', 'Casino crescendo']
export const BACKDROP_WIDTH = 1536
export const BACKDROP_HEIGHT = 960

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, r)
  gradient.addColorStop(0, color); gradient.addColorStop(1, 'transparent')
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, BACKDROP_WIDTH, BACKDROP_HEIGHT)
}

function suit(ctx: CanvasRenderingContext2D, kind: number, x: number, y: number, size: number, turn: number) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(turn); ctx.scale(size, size)
  ctx.beginPath()
  if (kind === 0 || kind === 2) {
    if (kind === 2) ctx.rotate(Math.PI)
    ctx.moveTo(0, 0.5)
    ctx.bezierCurveTo(-0.12, 0.28, -0.58, -0.06, -0.46, -0.32)
    ctx.bezierCurveTo(-0.34, -0.58, -0.05, -0.47, 0, -0.28)
    ctx.bezierCurveTo(0.05, -0.47, 0.34, -0.58, 0.46, -0.32)
    ctx.bezierCurveTo(0.58, -0.06, 0.12, 0.28, 0, 0.5)
  } else if (kind === 1) {
    ctx.moveTo(0, -0.55); ctx.lineTo(0.36, 0); ctx.lineTo(0, 0.55); ctx.lineTo(-0.36, 0); ctx.closePath()
  } else {
    for (const [cx, cy] of [[0, -0.24], [-0.24, 0.05], [0.24, 0.05]]) {
      ctx.moveTo(cx + 0.25, cy); ctx.arc(cx, cy, 0.25, 0, Math.PI * 2)
    }
  }
  ctx.fill()
  if (kind === 2) ctx.rotate(-Math.PI)
  if (kind >= 2) {
    ctx.beginPath(); ctx.moveTo(-0.2, 0.52); ctx.quadraticCurveTo(0, 0.22, 0, 0.06)
    ctx.quadraticCurveTo(0, 0.22, 0.2, 0.52); ctx.closePath(); ctx.fill()
  }
  ctx.restore()
}

export function paintIntroBackdrop(base: HTMLCanvasElement, detail: HTMLCanvasElement, mask: HTMLCanvasElement, style: number) {
  const b = base.getContext('2d')!, d = detail.getContext('2d')!, m = mask.getContext('2d')!
  for (const c of [base, detail, mask]) { c.width = BACKDROP_WIDTH; c.height = BACKDROP_HEIGHT }
  const w = BACKDROP_WIDTH, h = BACKDROP_HEIGHT
  b.fillStyle = '#263c35'; b.fillRect(0, 0, w, h)
  glow(b, w * 0.48, h * 0.5, w * 0.64, '#6a8870')
  glow(b, w * 0.1, h * 0.15, h * 0.7, '#365d51')
  if (style === 2) {
    glow(b, w * 0.52, h * 0.18, h * 0.8, '#8b7b4f')
    d.strokeStyle = '#b9a879'; d.lineWidth = 3
    for (let i = 0; i < 5; i++) {
      d.beginPath(); d.ellipse(w * 0.5, h * 1.15, w * (0.38 + i * 0.055), h * (0.95 + i * 0.13), 0, Math.PI, Math.PI * 2); d.stroke()
    }
    d.lineWidth = 2
    for (let i = 0; i < 8; i++) {
      const x = 60 + i * 40
      d.beginPath(); d.moveTo(x, h); d.lineTo(x, h * 0.25 + i * 25); d.stroke()
      d.beginPath(); d.moveTo(w - x, h); d.lineTo(w - x, h * 0.25 + i * 25); d.stroke()
    }
  } else if (style === 3) {
    d.fillStyle = '#91aa81'
    suit(d, 2, w * 0.12, h * 0.2, 410, -0.25)
    suit(d, 1, w * 0.8, h * 0.15, 370, 0.2)
    suit(d, 0, w * 0.86, h * 0.77, 470, -0.25)
    suit(d, 3, w * 0.24, h * 0.92, 430, 0.3)
  } else if (style === 4) {
    b.fillStyle = '#382e37'; b.fillRect(0, 0, w, h)
    glow(b, w * 0.07, h * 0.5, w * 0.8, '#42765d')
    glow(b, w * 0.93, h * 0.35, w * 0.65, '#954e4a')
    glow(b, w * 0.48, h * 0.65, h * 0.6, '#8b7958')
    d.strokeStyle = '#b39b71'; d.lineWidth = 3
    for (let i = 0; i < 7; i++) {
      d.beginPath(); d.moveTo(-80, h * (0.2 + i * 0.1))
      d.bezierCurveTo(w * 0.3, -h * 0.2, w * 0.7, h * 1.1, w + 80, h * (0.25 + i * 0.1)); d.stroke()
    }
  } else if (style === 5) {
    b.fillStyle = '#30352e'; b.fillRect(0, 0, w, h)
    glow(b, w * 0.5, h * 0.55, h * 0.8, '#8c8964')
    for (let i = 0; i < 4; i++) {
      const x = w * (i % 2 ? 0.86 : 0.14)
      const gr = d.createLinearGradient(x, -50, w / 2, h)
      gr.addColorStop(0, '#d0c895'); gr.addColorStop(1, 'transparent')
      d.fillStyle = gr; d.beginPath(); d.moveTo(x, -80)
      d.lineTo(w * (0.05 + i * 0.19), h + 100); d.lineTo(w * (0.46 + i * 0.17), h + 100); d.closePath(); d.fill()
    }
  } else if (style === 6) {
    glow(b, w * 0.22, h * 0.5, h * 0.9, '#89835c')
    d.strokeStyle = '#c3ab70'; d.lineWidth = 3
    const cx = w * 0.48, cy = h * 0.6, r = h * 0.7
    for (const k of [0.66, 0.78, 0.83, 1, 1.08, 1.15]) {
      d.beginPath(); d.arc(cx, cy, r * k, 0, Math.PI * 2); d.stroke()
    }
    for (let i = 0; i < 37; i++) {
      const angle = i / 37 * Math.PI * 2
      d.beginPath(); d.moveTo(cx + Math.cos(angle) * r * 0.83, cy + Math.sin(angle) * r * 0.83)
      d.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r); d.stroke()
    }
  } else if (style === 7) {
    b.fillStyle = '#394f41'; b.fillRect(0, 0, w, h)
    glow(b, w * 0.5, h * 0.42, w * 0.65, '#838066')
    const shapes = [
      { color: '#bdad80', p: [[-50, -50], [600, -50], [450, 90], [470, 120], [310, 160], [350, 185], [-50, 350]] },
      { color: '#69917a', p: [[w + 50, 50], [w - 160, 200], [w - 170, 230], [w - 340, 280], [w - 290, 340], [w - 500, 580], [w + 50, 750]] },
      { color: '#a66a57', p: [[-50, h - 270], [150, h - 180], [160, h - 150], [340, h - 90], [360, h - 45], [650, h + 50], [-50, h + 50]] },
    ]
    for (const { color, p } of shapes) {
      d.fillStyle = color; d.beginPath(); p.forEach(([x, y], i) => i ? d.lineTo(x, y) : d.moveTo(x, y)); d.closePath(); d.fill()
    }
  } else if (style >= 8) {
    b.fillStyle = '#375d50'; b.fillRect(0, 0, w, h)
    glow(b, w * 0.4, h * 0.45, w * 0.8, '#7a9c7e')
    glow(b, w * 0.68, h * 0.15, h * 0.65, '#ada174')
    if (style === 8) {
      // Broken nested arches suggest a larger salon beyond the props.
      d.strokeStyle = '#ccbc89'; d.lineWidth = 4
      for (let i = 0; i < 4; i++) {
        d.beginPath(); d.ellipse(w * 0.5, h * 0.66, w * (0.22 + i * 0.065), h * (0.4 + i * 0.1), -0.15, Math.PI * 1.05, Math.PI * 1.92); d.stroke()
        d.beginPath(); d.ellipse(w * 0.5, h * 0.66, w * (0.22 + i * 0.065), h * (0.4 + i * 0.1), -0.15, Math.PI * 0.1, Math.PI * 0.8); d.stroke()
      }
      d.fillStyle = '#91ad79'
      suit(d, 2, w * 0.22, h * 0.24, 170, -0.2)
      suit(d, 1, w * 0.76, h * 0.75, 140, 0.2)
    } else if (style === 9) {
      d.strokeStyle = '#a9ba8b'; d.lineWidth = 2
      for (let y = -240; y < h + 240; y += 180) for (let x = -160; x < w + 160; x += 180) {
        d.beginPath(); d.moveTo(x, y - 90); d.quadraticCurveTo(x + 25, y - 25, x + 90, y)
        d.quadraticCurveTo(x + 25, y + 25, x, y + 90); d.quadraticCurveTo(x - 25, y + 25, x - 90, y)
        d.quadraticCurveTo(x - 25, y - 25, x, y - 90); d.stroke()
        d.beginPath(); d.arc(x, y, 6, 0, Math.PI * 2); d.fillStyle = '#afae80'; d.fill()
      }
    } else {
      const cx = w * 0.48, cy = h * 0.52
      for (let i = 0; i < 19; i++) {
        const angle = i / 19 * Math.PI * 2
        d.fillStyle = i % 3 ? '#acc092' : '#ceb983'
        d.beginPath(); d.moveTo(cx, cy)
        d.lineTo(cx + Math.cos(angle) * w, cy + Math.sin(angle) * w)
        d.lineTo(cx + Math.cos(angle + 0.075) * w, cy + Math.sin(angle + 0.075) * w)
        d.closePath(); d.fill()
      }
      // Leave the focal point soft instead of nineteen sharp lines meeting at
      // the hero chip. Rays emerge farther out into the negative space.
      d.globalCompositeOperation = 'destination-out'
      glow(d, cx, cy, h * 0.36, '#ffffff')
      d.globalCompositeOperation = 'source-over'
    }
  }
  // A handful of baked pigment flecks, deterministic across reloads; the
  // existing compositor supplies the fine paper texture and moving bleed.
  let seed = 731
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  for (let i = 0; i < 1000; i++) {
    b.fillStyle = i % 2 ? '#dfd4a70b' : '#0e21180e'
    b.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 4, 1 + rnd() * 3)
  }
  const vignette = b.createRadialGradient(w / 2, h * 0.46, h * 0.13, w / 2, h / 2, w * 0.63)
  vignette.addColorStop(0, 'transparent'); vignette.addColorStop(1, '#111a20ad')
  b.fillStyle = vignette; b.fillRect(0, 0, w, h)
  m.drawImage(detail, 0, 0)
  m.globalCompositeOperation = 'source-in'; m.fillStyle = '#fff'; m.fillRect(0, 0, w, h)
  m.globalCompositeOperation = 'destination-over'; m.fillStyle = '#000'; m.fillRect(0, 0, w, h)
  m.globalCompositeOperation = 'source-over'
}
