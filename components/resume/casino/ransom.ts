import { loadSharedFont } from '@/lib/fonts/load-font'
/**
 * Ransom-note lettering, shared.
 *
 * A letter cut from a magazine: a torn scrap of paper with one glyph on it, in its own face, ink, size and
 * angle. The paper is the point - mixed faces with no paper under them just read as broken CSS, whereas a
 * scrap says the letter was physically cut from somewhere else and pasted down.
 *
 * Lives on its own because two very different things now set type this way: the title card (jack-intro,
 * flat cut-outs flowed into words) and the table's own arcs (resume-word, letters on a curve revealed by a
 * brush wipe). They share the faces, the stocks and the rule about capitals; they share nothing else.
 */
import * as THREE from 'three'
import { JACK_FONTS } from './tune'

/**
 * Every face is fine for lowercase; only some are fine for CAPITALS.
 *
 * A swash script capital is not a letter you read, it is a monogram: Snell's T came out as something the
 * eye files as a G, and the wedding script's A as a squiggle, so TRADES read as GRADES. Lowercase in the
 * same faces is perfectly legible, because the swashes live on the capitals. So the pool is split, and an
 * uppercase scrap is only ever cut from a face whose capitals are letters. It costs six faces out of
 * twenty-six on the caps, which is no loss at all against a word nobody can read.
 */
export const RANSOM_FACES: { css: string; caps: boolean; blob?: boolean }[] = [
  { css: "'KatieRoze'", caps: false },
  { css: "'JkFredericka'", caps: true },
  { css: "'JkFastBlaze'", caps: true, blob: true },
  { css: "'JkAtop'", caps: true, blob: true },
  { css: "'JkMochibop'", caps: true, blob: true },
  { css: "'JkAncient'", caps: false },
  { css: "'JkWedding'", caps: false },
  { css: "'JkArcade'", caps: true, blob: true },
  { css: 'Impact, "Haettenschweiler", sans-serif', caps: true },
  { css: '"Arial Black", sans-serif', caps: true },
  { css: 'Georgia, serif', caps: true },
  { css: '"Times New Roman", serif', caps: true },
  { css: '"Courier New", monospace', caps: true },
  { css: '"American Typewriter", "Courier New", monospace', caps: true },
  { css: 'Copperplate, "Copperplate Gothic Light", serif', caps: true },
  { css: 'Palatino, "Palatino Linotype", serif', caps: true },
  { css: 'Didot, "Bodoni MT", serif', caps: true },
  { css: 'Baskerville, Georgia, serif', caps: true },
  { css: 'Futura, "Century Gothic", sans-serif', caps: true },
  { css: 'Optima, Candara, sans-serif', caps: true },
  { css: 'Chalkduster, "Comic Sans MS", cursive', caps: true },
  { css: '"Bradley Hand", "Segoe Script", cursive', caps: true },
  { css: '"Marker Felt", "Comic Sans MS", cursive', caps: true },
  { css: 'Herculanum, Papyrus, fantasy', caps: false },
  { css: 'Trattatello, Papyrus, fantasy', caps: false },
  { css: '"Snell Roundhand", "Brush Script MT", cursive', caps: false },
]
/** the indices legal for a capital, worked out once */
export const RANSOM_CAPS = RANSOM_FACES.map((f, i) => (f.caps ? i : -1)).filter((i) => i >= 0)

/**
 * The capitals a BLOB face may be used for.
 *
 * Rendered a W in every face at size and looked: Fast Blaze, Atop, Mochibop and Arcade all lose it. They
 * are display faces built out of thick rounded strokes, and a letter whose identity lives in an INTERNAL
 * vertex - the middle of a W, the diagonal of an N, the junction of a K - has that vertex swallowed by the
 * stroke weight. Arcade's W came out as an H. It is not a caps problem, since their A and their O are
 * perfectly good; it is a problem with the letters that need internal structure to be themselves.
 *
 * So they keep the simple skeletons and give up the rest, which loses four faces on about half the
 * alphabet rather than losing them entirely.
 */
const BLOB_OK = 'ACDEFHILOPTU'
export const RANSOM_BLOB = RANSOM_FACES.map((f) => f.blob === true)
/** and a weight or a slant on top, so one family can still cut two different-looking scraps */
export const RANSOM_STYLE: string[] = ['', 'bold ', 'italic ', 'bold italic ']

export const RANSOM_STOCK: { paper: string; ink: string }[] = [
  { paper: '#efe7d2', ink: '#141210' },
  { paper: '#f6f2e6', ink: '#1a1a1a' },
  { paper: '#141210', ink: '#f2ead6' },
  { paper: '#b8181c', ink: '#f8f2e4' },
  { paper: '#d8cfae', ink: '#141210' },
  { paper: '#1f6f43', ink: '#f2ead6' },
  { paper: '#d9b64a', ink: '#141210' },
  { paper: '#e8e2d0', ink: '#b8181c' },
  { paper: '#2b2f36', ink: '#e6e0cc' },
  { paper: '#c9ccc4', ink: '#1a1a1a' },
  { paper: '#7d1420', ink: '#e9dcb4' },
  { paper: '#f0d9a8', ink: '#2a1c10' },
  { paper: '#1a1a1a', ink: '#d9b64a' },
  { paper: '#e4dcc6', ink: '#1f6f43' },
]

/** a stable 0..1 from three integers: same note every reload, a different one per seed */
export function rnd(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2246822519) >>> 0
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/**
 * One cut-out letter.
 *
 * `cap` is the height of the LETTER, so a size means the same thing whatever face the scrap was cut from;
 * the patch around it is measured from the glyph and then given its own uneven margins, because a cut is
 * never centred on what it cut out.
 */
export function ransomScrap(ch: string, seed: number, w: number, i: number, forced: number, faceI: number, stockI: number) {
  const S = 190
  const r = (n: number) => rnd(seed * 977 + w * 31, i, n)
  // `forced` is the word's own font picker: 0 means cut from anywhere, anything else pins the whole word
  const fam = forced > 0 ? `'${JACK_FONTS[Math.min(JACK_FONTS.length - 1, forced - 1)].key}'` : RANSOM_FACES[faceI].css
  const style = RANSOM_STYLE[Math.floor(r(7) * RANSOM_STYLE.length) % RANSOM_STYLE.length]
  const stock = RANSOM_STOCK[stockI]
  const font = `${style}${S}px ${fam}, Georgia, serif`
  const probe = document.createElement('canvas').getContext('2d')!
  probe.font = font
  const m = probe.measureText(ch)
  const cap = probe.measureText('H').actualBoundingBoxAscent || S * 0.7
  const asc = m.actualBoundingBoxAscent || S * 0.72
  const desc = m.actualBoundingBoxDescent || S * 0.2
  /**
   * The scrap is cut around the glyph's INK, not around its advance.
   *
   * `m.width` is the ADVANCE - how far the pen travels - and a display serif's ink is routinely wider on
   * both sides: a T carries its left serif back past the pen origin, and at fillText(ch, padL, ...) that
   * overhang landed left of the canvas and was sliced off at the texture edge. It read as the letter
   * being cut in half. The vertical case was always correct here, because asc/desc are actualBoundingBox
   * values and those are real ink; the horizontal pair was simply never read.
   *
   * actualBoundingBoxLeft is positive when ink sits LEFT of the origin, so the ink box spans
   * [-inkL, +inkR] and its width is inkL + inkR. Placing the pen at padL + inkL puts the ink's left edge
   * exactly on padL, which is what the uneven margins below are measured against.
   */
  const inkL = m.actualBoundingBoxLeft ?? 0
  const inkR = m.actualBoundingBoxRight ?? m.width
  const gw = Math.max(6, inkL + inkR)
  const gh = Math.max(6, asc + desc)
  /**
   * Uneven margins, because scissors do not measure - but measured off the GLYPH, not off the font size.
   * Padding proportional to S gave a narrow letter like L a scrap nearly twice its own width, so the line
   * came out as a row of coloured blocks with something small in the middle of each. A scrap is cut close.
   */
  const padL = gh * (0.08 + r(3) * 0.1)
  const padR = gh * (0.08 + r(4) * 0.1)
  const padT = gh * (0.06 + r(5) * 0.09)
  const padB = gh * (0.06 + r(6) * 0.09)
  const W = Math.ceil(gw + padL + padR)
  const H = Math.ceil(gh + padT + padB)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const x = c.getContext('2d')!

  /**
   * HOW IT WAS CUT, which is variety the colour cannot give.
   *
   * Three ways, because a real note is assembled from whatever was to hand: TORN, with edges walked in
   * short irregular steps; CUT, straight-edged and slightly out of square, which is what scissors give;
   * Fifteen scraps that were all torn the same way stop reading as fifteen separate acts.
   *
   * There was a third variant, a corner folded back to show the paper's blank reverse. It came out as a
   * bright triangle sitting on the letter rather than as a fold, at this size and against these papers, so
   * it is gone: the tear and the clean cut carry the variety on their own.
   */
  const cut = r(50)
  const torn = cut < 0.55
  const wob = torn ? gh * 0.07 : gh * 0.012
  const tear = (n: number) => (r(20 + n) - 0.5) * wob
  x.beginPath()
  const steps = torn ? 5 : 1
  for (let k = 0; k <= steps; k++) x.lineTo((k / steps) * W, 2 + tear(k))
  for (let k = 0; k <= steps; k++) x.lineTo(W - 2 + tear(10 + k), (k / steps) * H)
  for (let k = steps; k >= 0; k--) x.lineTo((k / steps) * W, H - 2 + tear(20 + k))
  for (let k = steps; k >= 0; k--) x.lineTo(2 + tear(30 + k), (k / steps) * H)
  x.closePath()
  x.fillStyle = stock.paper
  x.fill()

  /**
   * WHAT THE SCRAP WAS CUT OUT OF, as a surface rather than a colour.
   *
   * A ransom note is assembled from whatever was in the bin, and the give-away is the stock itself: a
   * halftone screen means it came out of something PRINTED, ruled lines mean a notebook, a faint grid
   * means graph paper, flecks mean kraft or recycled card. Five surfaces drawn per scrap at random, all of
   * them things paper actually is - which is the difference between texture and noise.
   *
   * They are drawn INSIDE the scrap's own clip, so the surface stops at the torn edge like a real cut.
   * They also survive the painterly pass, which breaks a flat fill up but leaves regular structure legible.
   */
  x.save()
  x.clip()
  const surf = Math.floor(r(51) * 5)
  x.globalAlpha = 0.16
  x.fillStyle = stock.ink
  x.strokeStyle = stock.ink
  if (surf === 1) {
    // newsprint: a dot screen on the 45 degree angle print actually uses
    const step = 7
    for (let py = 0; py < H + step; py += step) {
      for (let px = 0; px < W + step; px += step) {
        const ox = (py / step) % 2 ? step / 2 : 0
        x.beginPath()
        x.arc(px + ox, py, 1.5, 0, Math.PI * 2)
        x.fill()
      }
    }
  } else if (surf === 2) {
    // ruled, out of a notebook: feint lines and a margin rule if the cut happened to take one
    x.globalAlpha = 0.22
    x.lineWidth = 1.6
    const gap = 16 + r(55) * 8
    for (let py = (r(56) * gap) | 0; py < H; py += gap) {
      x.beginPath()
      x.moveTo(0, py)
      x.lineTo(W, py)
      x.stroke()
    }
    if (r(57) < 0.4) {
      x.globalAlpha = 0.3
      x.strokeStyle = '#b8181c'
      x.beginPath()
      const mx = W * (0.18 + r(58) * 0.2)
      x.moveTo(mx, 0)
      x.lineTo(mx, H)
      x.stroke()
    }
  } else if (surf === 3) {
    // graph paper
    x.globalAlpha = 0.15
    x.lineWidth = 1.1
    const g = 11 + r(59) * 5
    for (let py = 0; py < H; py += g) {
      x.beginPath()
      x.moveTo(0, py)
      x.lineTo(W, py)
      x.stroke()
    }
    for (let px = 0; px < W; px += g) {
      x.beginPath()
      x.moveTo(px, 0)
      x.lineTo(px, H)
      x.stroke()
    }
  } else if (surf === 4) {
    // kraft or recycled: flecks of the pulp that did not bleach out
    for (let n = 0; n < 90; n++) {
      x.globalAlpha = 0.1 + r(60 + (n % 7)) * 0.22
      const fx = r(70 + (n % 11)) * W + ((n * 37) % W)
      const fy = r(80 + (n % 13)) * H + ((n * 53) % H)
      x.fillRect(fx % W, fy % H, 1 + (n % 3), 1)
    }
  }
  // and a stain on some of them, whatever the surface: paper out of a bin is not clean
  if (r(61) < 0.3) {
    const sx2 = r(62) * W
    const sy2 = r(63) * H
    const sr = Math.min(W, H) * (0.25 + r(64) * 0.35)
    const st = x.createRadialGradient(sx2, sy2, 0, sx2, sy2, sr)
    st.addColorStop(0, 'rgba(96,64,28,0.18)')
    st.addColorStop(1, 'rgba(96,64,28,0)')
    x.globalAlpha = 1
    x.fillStyle = st
    x.fillRect(0, 0, W, H)
  }
  x.restore()

  /**
   * A LIFT: the scrap shaded across itself, darker on one side.
   *
   * Paper that is pasted down at an angle is not evenly lit, and this is what turns a flat rectangle into
   * something with a near edge and a far one. The direction is per scrap, so the pile does not look like a
   * single sheet with a gradient on it.
   */
  x.save()
  x.beginPath()
  x.rect(0, 0, W, H)
  x.clip()
  const ga = r(52) * Math.PI * 2
  const gr = x.createLinearGradient(W / 2 - Math.cos(ga) * W, H / 2 - Math.sin(ga) * H, W / 2 + Math.cos(ga) * W, H / 2 + Math.sin(ga) * H)
  gr.addColorStop(0, 'rgba(0,0,0,0.26)')
  gr.addColorStop(0.55, 'rgba(0,0,0,0)')
  gr.addColorStop(1, 'rgba(255,255,255,0.12)')
  x.fillStyle = gr
  x.fillRect(0, 0, W, H)
  x.restore()

  // one darker edge, so the scrap reads as lying ON something rather than being a coloured rectangle
  x.strokeStyle = 'rgba(0,0,0,0.3)'
  x.lineWidth = torn ? 2.5 : 1.6
  x.stroke()

  /**
   * The glyph, RECOLOURED THROUGH ITS OWN SILHOUETTE rather than filled.
   *
   * fillStyle is ignored by a colour font - the browser draws the face's own artwork - and one of the
   * faces in the pool is KatieRoze, which is a watercolour COLOUR font. Any scrap that landed on it came
   * out in pale washes instead of the ink this stock was paired with, which on a light paper is a letter
   * you cannot read. Drawing the glyph, keeping it as a mask and filling the ink through it forces every
   * face to the chosen colour, colour font or not, so paper and ink are always the matched pair.
   */
  const gl = document.createElement('canvas')
  gl.width = W
  gl.height = H
  const gx = gl.getContext('2d')!
  gx.font = font
  gx.textBaseline = 'alphabetic'
  gx.fillText(ch, padL + inkL, padT + asc)
  gx.globalCompositeOperation = 'source-in'
  gx.fillStyle = stock.ink
  gx.fillRect(0, 0, W, H)
  x.drawImage(gl, 0, 0)

  // the paper colour goes back with it, so a caller building a solid can match the scrap's own edges
  return { canvas: c, W, H, cap, paper: stock.paper }
}

/**
 * Pick a face and a stock for letter `i`, never repeating the one before it.
 *
 * Offsetting the index by the letter's position guarantees no repeat and guarantees something worse:
 * ADJACENT entries in a palette are the ones that look alike, so a word came out gold, gold, red. Redrawing
 * until it differs is what actually gives the spread the randomness was meant to give.
 */
export function ransomPick(ch: string, seed: number, w: number, i: number, prevFace: number, prevStock: number) {
  const isCap = ch === ch.toUpperCase() && ch !== ch.toLowerCase()
  const risky = isCap && !BLOB_OK.includes(ch)
  const pool = (isCap ? RANSOM_CAPS : RANSOM_FACES.map((_, n) => n)).filter((n) => !(risky && RANSOM_BLOB[n]))
  let faceI = pool[0]
  let stockI = 0
  for (let a = 0; a < 8; a++) {
    faceI = pool[Math.floor(rnd(seed * 977 + w * 31, i, 100 + a) * pool.length) % pool.length]
    if (faceI !== prevFace) break
  }
  for (let a = 0; a < 8; a++) {
    stockI = Math.floor(rnd(seed * 977 + w * 31, i, 200 + a) * RANSOM_STOCK.length) % RANSOM_STOCK.length
    if (stockI !== prevStock) break
  }
  return { faceI, stockI }
}

/**
 * Every face loaded once, up front, so a picker switches instantly and a scrap is never measured against a
 * fallback that is about to be replaced.
 */
let facesLoad: Promise<void> | null = null
export function loadRansomFaces(): Promise<void> {
  if (!facesLoad) {
    facesLoad = (async () => {
      await Promise.all(
        JACK_FONTS.map(async (f) => {
          try {
            await loadSharedFont(f.key, f.url)
          } catch {
            /* that one falls back; the others still load */
          }
        }),
      )
    })()
  }
  return facesLoad
}
