'use client'

/**
 * "RESUME" written under the tumbling chip (caps like pomme's LOADING, every glyph
 * fitted to one measured height so a script face reads uniform), exactly pomme's LOADING lettering
 * (natureScene.js updateLoading + drawWipe): one KatieRoze canvas per letter,
 * ink recoloured with a multiply grain, revealed by a slanted brush wipe with a
 * 0.12 s stagger, laid on a bottom arc that sways as a ring, un-written by the
 * same wipe backwards the instant the drop begins.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { MutableRefObject } from 'react'
import type { ChipWordState } from './hero-chip'

const KFONT = "'KatieRoze', 'Marker Felt', 'Bradley Hand', 'Comic Sans MS', cursive"
const FONT_URL = '/shared/fonts/Katie%20Roze%20Watercolour%20Font%20-%20By%20Lef/KatieRoze.woff2'
const cl = (x: number) => Math.min(1, Math.max(0, x))

interface Letter {
  mesh: THREE.Mesh
  mat: THREE.MeshBasicMaterial
  cnv: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  art: HTMLCanvasElement
  tex: THREE.CanvasTexture
  wip: number
  o: number
  /** when this letter first reached the felt, so its bounce runs on its own clock (-1 before) */
  tg: number
}

let fontLoad: Promise<void> | null = null
function ensureFont(): Promise<void> {
  if (!fontLoad) {
    fontLoad = (async () => {
      try {
        const ff = new FontFace('KatieRoze', `url('${FONT_URL}')`)
        await ff.load()
        document.fonts.add(ff)
      } catch {
        /* falls back to the cursive stack */
      }
    })()
  }
  return fontLoad
}

/** font size that gives this glyph a fixed measured height, so a script face's letters come out uniform */
/** capitals and tall lowercase (ascenders) fit the cap height; other lowercase the x-height */
function targetHeightFor(ch: string): number {
  if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) return 118
  return /[bdfhklt]/.test(ch) ? 118 : 84
}
function fitFont(ch: string, targetH: number, probe: CanvasRenderingContext2D): number {
  probe.font = `130px ${KFONT}`
  probe.textBaseline = 'middle'
  const m = probe.measureText(ch)
  const h = (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0)
  return h > 1 ? Math.min(190, (130 * targetH) / h) : 130
}

function makeLetter(ch: string, ink: string, size: number, probe: CanvasRenderingContext2D, weight = 2, outline = 0): Letter {
  const W = 200, H = 240
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const x = c.getContext('2d')!
  x.font = `${fitFont(ch, targetHeightFor(ch), probe).toFixed(1)}px ${KFONT}`
  x.textBaseline = 'middle'
  const mm = x.measureText(ch)
  const ax = W / 2 - ((mm.actualBoundingBoxRight || 0) - (mm.actualBoundingBoxLeft || 0)) / 2
  // weight: dilate the glyph by drawing it around a ring of offsets and stroking it (a script face at
  // this size is hairline otherwise); pomme's 5 taps at 2 px is weight 2
  const taps: [number, number][] = [[0, 0]]
  const ring = weight <= 2 ? 4 : 12
  for (let k = 0; k < ring; k++) taps.push([Math.cos((k / ring) * Math.PI * 2) * weight, Math.sin((k / ring) * Math.PI * 2) * weight])
  for (const [dx, dy] of taps) x.fillText(ch, ax + dx, H / 2 + dy)
  if (weight > 2) {
    x.lineWidth = weight * 0.9
    x.lineJoin = 'round'
    x.strokeText(ch, ax, H / 2)
  }
  const mask = document.createElement('canvas')
  mask.width = W
  mask.height = H
  mask.getContext('2d')!.drawImage(c, 0, 0)
  x.globalCompositeOperation = 'source-in'
  x.fillStyle = ink
  x.fillRect(0, 0, W, H)
  x.globalCompositeOperation = 'multiply'
  x.globalAlpha = 0.15
  x.drawImage(mask, 0, 0)
  x.globalAlpha = 1
  x.globalCompositeOperation = 'destination-in'
  x.drawImage(mask, 0, 0)
  x.globalCompositeOperation = 'source-over'
  // the watercolour colour font is largely semi-transparent; on dark paper that reads as dim ink, so
  // compound the alpha (a' = 1 - (1 - a)^3) by drawing the finished glyph over itself twice
  const solid = document.createElement('canvas')
  solid.width = W
  solid.height = H
  const sx = solid.getContext('2d')!
  sx.drawImage(c, 0, 0)
  x.drawImage(solid, 0, 0)
  x.drawImage(solid, 0, 0)
  const art = document.createElement('canvas')
  art.width = W
  art.height = H
  const ax2 = art.getContext('2d')!
  if (outline > 0) {
    // a white halo behind the ink: the glyph's own silhouette drawn around a ring and filled white, so the
    // lettering keeps its edge against the dark room (and against the felt)
    const halo = document.createElement('canvas')
    halo.width = W
    halo.height = H
    const hx = halo.getContext('2d')!
    const ring = 16
    for (let k = 0; k < ring; k++) {
      hx.drawImage(mask, Math.cos((k / ring) * Math.PI * 2) * outline, Math.sin((k / ring) * Math.PI * 2) * outline)
    }
    hx.globalCompositeOperation = 'source-in'
    hx.fillStyle = '#fdfaf2'
    hx.fillRect(0, 0, W, H)
    ax2.drawImage(halo, 0, 0)
  }
  ax2.drawImage(c, 0, 0)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.44 * size, 0.52 * size), mat)
  mesh.renderOrder = 6
  return { mesh, mat, cnv: c, ctx: x, art, tex, wip: -1, o: 0, tg: -1 }
}

/**
 * A stable pseudo-random value per letter and channel, so every letter falls with its own delay, weight,
 * drift and spin while staying identical on every reload (no Math.random: the beat has to be reproducible
 * for capture, and it must not differ between server and client render).
 */
/**
 * ?wdbg records [time, offT, first letter y, last letter y, opacity] per frame on window.__wd. Motion bugs
 * (a freeze, a step at a state change) are invisible in stills and obvious in the velocity profile: a run
 * of exact zeroes is a freeze, a single-frame spike is a discontinuity. Both were real here.
 */
/**
 * ?fall=old runs the letters' original exit for comparison: the word stays attached to the chip the whole
 * way down (so it is dragged by the coin rather than flying on its own), a single 6.5 t^2 drop on top of
 * that, three drift values and two spin rates. Kept only as a side by side; the one fix carried over is
 * that the letters are still drawn over the table on the way out, so they leave the frame instead of
 * sinking behind the felt.
 */
const FALLMODE = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('fall') : null
const OLDFALL = FALLMODE === 'old'
/**
 * ?fall=drop keeps the physical exit (gather, asymmetric-gravity drop, lean, the chip's drag). The default
 * is pomme's: the word does not fall at all, it UN-WRITES in place, the same staggered brush wipe played
 * backwards, letter by letter, while the ring stays on the object and keeps swaying.
 */
const DROPFALL = FALLMODE === 'drop'

const WDBG = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('wdbg')

function rnd(i: number, k: number): number {
  const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453
  return v - Math.floor(v)
}

// pomme's drawWipe: the finished art copied through a soft slanted edge sweeping bottom-left to top-right
function drawWipe(L: Letter, w: number) {
  const x = L.ctx, W = L.cnv.width, H = L.cnv.height
  x.globalCompositeOperation = 'source-over'
  x.globalAlpha = 1
  x.clearRect(0, 0, W, H)
  if (w > 0) {
    x.drawImage(L.art, 0, 0)
    if (w < 1) {
      const g = x.createLinearGradient(0, H * 0.85, W, H * 0.15)
      const e2 = Math.min(Math.max(w * 1.25, 0.001), 1)
      const e1 = Math.max(e2 - 0.22, 0)
      g.addColorStop(0, '#000')
      g.addColorStop(e1, '#000')
      g.addColorStop(e2, 'rgba(0,0,0,0)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      x.globalCompositeOperation = 'destination-in'
      x.fillStyle = g
      x.fillRect(0, 0, W, H)
      x.globalCompositeOperation = 'source-over'
    }
  }
  L.tex.needsUpdate = true
}

export default function ResumeWord({
  state,
  text = 'RESUME',
  ink = '#e23b18',
  radius = 1.14,
  size = 1,
  span = Math.PI - 1.24,
  wrap = 0,
  groundY,
  offsetY = 0,
  stagger = 0,
  arc = 'bottom',
  weight = 2,
  outline = 0,
  still = false,
  loose = false,
  spacing,
}: {
  state: MutableRefObject<ChipWordState>
  text?: string
  ink?: string
  /** arc radius around the chip (world) */
  radius?: number
  /** letter size multiplier */
  size?: number
  /** angular span of the arc (radians), centred at the bottom */
  span?: number
  /**
   * How far the ends of the arc bend AWAY from the viewer, in world units. 0 is a flat necklace in the
   * camera plane (pomme's LOADING); anything above that puts the word on a cylinder around the object, so
   * the outer letters sit behind it and come back smaller. The letters stay billboarded, so they wrap
   * without becoming unreadable.
   */
  wrap?: number
  /**
   * World height of the surface under the word. Without it the ring keeps its full height as it rides the
   * object down, so its lower letters are BELOW the table long before the object lands and the felt slices
   * them off. With it, the ring tips into the table's plane as it approaches and no letter ever goes under.
   */
  groundY?: number
  /** the arc's lowest point sits this far from the chip centre (world y); 0 = pomme's radius-based placement */
  offsetY?: number
  /** delay before this line starts writing (seconds) */
  stagger?: number
  /** which side of the circle the letters sit on: 'bottom' (pomme's LOADING) or 'top' (a rainbow) */
  arc?: 'bottom' | 'top'
  /** stroke weight in canvas px (2 = pomme's hairline taps; 5+ reads bold) */
  weight?: number
  /** white halo around each glyph, in canvas px */
  outline?: number
  /** no sway, no drift: the line holds still once written */
  still?: boolean
  /** each letter comes up on its own spring and falls on its own arc (own delay, gravity, tumble) */
  loose?: boolean
  /** world units per letter slot; when given, the span follows the text length and radius alone sets the curve */
  spacing?: number
}) {
  const group = useRef<THREE.Group>(null)
  const letters = useRef<(Letter | null)[]>([])
  const { camera } = useThree()
  const chars = useMemo(() => text.split(''), [text])

  useEffect(() => {
    let alive = true
    const g = group.current
    if (!g) return
    ensureFont().then(() => {
      if (!alive || !group.current) return
      const probe = document.createElement('canvas').getContext('2d')!
      const built = chars.map((ch) => (ch === ' ' ? null : makeLetter(ch, ink, size, probe, weight, outline)))
      for (const L of built) if (L) group.current.add(L.mesh)
      letters.current = built
    })
    return () => {
      alive = false
      for (const L of letters.current) {
        if (!L) continue
        g.remove(L.mesh)
        L.mat.dispose()
        L.tex.dispose()
        L.mesh.geometry.dispose()
      }
      letters.current = []
    }
  }, [chars, ink, size, weight, outline])

  const rightRef = useRef(new THREE.Vector3())
  const fwdRef = useRef(new THREE.Vector3())
  const flatQ = useRef(new THREE.Quaternion())
  const spinQ = useRef(new THREE.Quaternion())
  const eul = useRef(new THREE.Euler())
  // where the word was standing when the drop began. The chip keeps reporting its own falling position, so
  // without this the whole ring rides the chip down as one rigid object and no amount of per-letter
  // physics reads as individual: the shared motion dominates it.
  const anchor = useRef({ set: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 })
  // the anchor's motion over the last frame, so detaching can carry it instead of stopping dead
  const track = useRef({ t: -1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, vys: 0 })
  useFrame(({ clock }) => {
    const Ls = letters.current
    if (!Ls.length) return
    const t = clock.elapsedTime
    const s = state.current
    const N = Ls.length
    // camera-right on the ground plane, so the arc faces the viewer like pomme's
    const right = rightRef.current
    right.set(1, 0, 0).applyQuaternion(camera.quaternion)
    right.y = 0
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0)
    right.normalize()
    // camera-forward on the ground plane, so a letter can drift toward or away from the viewer as it goes
    const fwd = fwdRef.current
    fwd.set(0, 0, -1).applyQuaternion(camera.quaternion)
    fwd.y = 0
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1)
    fwd.normalize()
    // yaw that puts a flat quad's own left-to-right along the camera's right, so text lying on the table
    // still reads across the screen instead of running off at the table's own angle
    const camYaw = Math.atan2(-right.z, right.x)
    // the word hangs off the chip until the drop, then flies on its own. Detaching has to be smooth in
    // VELOCITY, not just position: the chip is bobbing when it lets go, so latching its position alone
    // stops the whole word dead for a beat before the letters launch, which reads as a freeze. The anchor
    // keeps the velocity it had and coasts to a stop over COAST seconds.
    const tk = track.current
    const an = anchor.current
    if (!an.set) {
      if (tk.t >= 0 && t > tk.t) {
        const idt = 1 / (t - tk.t)
        tk.vx = (s.x - tk.x) * idt
        tk.vy = (s.y - tk.y) * idt
        tk.vz = (s.z - tk.z) * idt
        // smoothed, because a per-frame difference is noisy and this drives the letters' trail
        tk.vys += (tk.vy - tk.vys) * 0.3
      }
      tk.t = t
      tk.x = s.x
      tk.y = s.y
      tk.z = s.z
    }
    if (loose && s.offT >= 0 && DROPFALL) {
      if (!an.set) {
        an.set = true
        // the chip recomputes its position on the frame the drop starts, so latch to where the word was
        // standing LAST frame: latching to the new value inherits the chip's own step
        const from = tk.t >= 0 ? tk : s
        an.x = from.x
        an.y = from.y
        an.z = from.z
        // cap it: the chip is already accelerating downward on the frame it lets go
        const cap = 2.2
        an.vx = Math.max(-cap, Math.min(cap, tk.vx))
        an.vy = Math.max(-cap, Math.min(cap, tk.vy))
        an.vz = Math.max(-cap, Math.min(cap, tk.vz))
      }
    } else if (an.set) {
      an.set = false
      tk.t = -1
    }
    if (loose && s.offT < 0) for (const L of Ls) if (L) L.tg = -1
    const COAST = 0.3
    // the integral of v * exp(-t / COAST): the same coast every frame, no drift from accumulation
    const glide = an.set ? COAST * (1 - Math.exp(-s.offT / COAST)) : 0
    // and the word is DRAGGED by the chip before it flies on its own: the chip's plunge is the strongest
    // motion on screen, and cutting the word loose from it the instant the drop starts is what made the
    // letters read as unrelated to the coin. The pull decays, so each letter's own arc takes over.
    const drag = an.set ? Math.exp(-s.offT / 0.34) : 0
    const ax = an.set ? an.x + an.vx * glide + (s.x - an.x) * drag : s.x
    const ay = an.set ? an.y + an.vy * glide + (s.y - an.y) * drag : s.y
    const az = an.set ? an.z + an.vz * glide + (s.z - an.z) * drag : s.z
    for (let i = 0; i < N; i++) {
      const L = Ls[i]
      if (!L) continue
      let o = L.o
      // loose letters: the ink lingers longer on the fall (they drop away instead of un-writing)
      // the letters leave the way they arrived: the same wave through the word, in the same order, but the
      // gaps are not identical (a metronome reads as a machine emptying a tray)
      // LEAD: nothing drops for the first fifth of a second, which is the room every letter needs to
      // gather upward first (including the first one). Then a TIGHT wave through the word: the gaps are
      // shorter than the entrance's so the word collapses rather than being dismantled, with the jitter
      // kept under half a gap so the order never swaps (a metronome reads as a machine emptying a tray).
      const fallDelay = OLDFALL && loose ? i * 0.09 + ((i * 7) % 3) * 0.05 : 0.1 + i * 0.07 + (rnd(i, 13) - 0.5) * 0.036
      // loose letters keep their ink while they fall (they leave the frame under gravity, then are dropped)
      // pomme un-writes on the way out: the fade mirrors the fade-in exactly, same 0.12 s stagger through
      // the word and the same 0.4 s brush wipe, played backwards. Only the physical drop keeps its ink.
      // Here the wipe waits for the SMASH: the word rides the coin all the way down and is swept away as
      // it is flattened against the felt, so the letters go with the impact rather than before it.
      const physical = loose && (DROPFALL || OLDFALL)
      const smash = loose && !physical ? s.offT - (s.hitAt ?? 0.62) : -1
      if (s.offT >= 0)
        o = physical
          ? s.offT - fallDelay > 2.6
            ? 0
            : o
          : Math.min(o, 1 - cl((smash - 0.06 - i * 0.05) / 0.34))
      else if (s.onT >= 0) o = Math.max(o, cl((s.onT - stagger - i * 0.12) / 0.4))
      L.o = o
      if (Math.abs(o - L.wip) > 0.001) {
        drawWipe(L, o)
        L.wip = o
      }
      L.mat.opacity = o > 0 ? 0.95 : 0

      if (o <= 0) {
        L.mesh.visible = false
        continue
      }
      L.mesh.visible = true
      // letters on a circle around the state point: bottom arc (pomme's LOADING, left to right along the
      // bottom) or top arc (a rainbow, left to right over the top); sway unless still. With offsetY the
      // bottom arc's lowest point is pinned relative to the chip so long lines can be stacked as banners
      const radiusUsed = OLDFALL && loose ? 1.7 : radius
      // pomme sways the ring by 0.05 rad at R 1.14; keeping the ANGLE would swing a wider arc further in
      // world units, which reads as the word sitting off centre rather than breathing
      const sway = still ? 0 : Math.sin(t * 0.7) * 0.05 * (1.14 / radiusUsed)
      const u = N > 1 ? i / (N - 1) : 0.5
      const spanUsed = spacing !== undefined ? (spacing * (N - 1)) / radiusUsed : OLDFALL && loose ? Math.PI - 1.24 : span
      const th = arc === 'top' ? Math.PI / 2 + spanUsed / 2 - u * spanUsed + sway : Math.PI * 1.5 - spanUsed / 2 + u * spanUsed + sway
      // distance around the arc from its middle, which is what the wrap bends back
      const off = th - (arc === 'top' ? Math.PI / 2 : Math.PI * 1.5)
      const yArc = arc === 'bottom' && offsetY !== 0 ? ay + offsetY + (Math.sin(th) + 1) * radiusUsed * 0.92 : ay + Math.sin(th) * radiusUsed * 0.92
      let dy = 0
      let dx = 0
      // how far the letter has been driven into the table (0 standing, 1 lying flat) and its yaw there
      let flatAmt = 0
      let tableSpin = 0
      let dz = OLDFALL && loose ? 0 : wrap * (1 - Math.cos(off))
      let tilt = 0
      if (loose) {
        // come up: each letter is an underdamped spring released from below with its own delay:
        // it overshoots, bounces a couple of times and settles (no hard lock)
        const tu = s.onT >= 0 ? s.onT - stagger - i * 0.12 : -1
        if (tu < 0) {
          dy -= 1.0
        } else {
          // each letter's spring is its own: a slightly different rate and damping, so they do not all
          // ring in step
          const w = 10.5 * (0.88 + rnd(i, 8) * 0.28)
          const decay = Math.exp(-4.2 * (0.85 + rnd(i, 9) * 0.3) * tu)
          dy -= 1.0 * decay * Math.cos(w * tu)
          // same rule as the exit: the wobble starts at zero, so the letter is never released already
          // tilted (it is invisible at tu = 0 today, but a snap under a fade is still a snap)
          tilt += 0.45 * decay * Math.sin(w * tu) * (i % 2 === 0 ? 1 : -1)
        }
        // THE SMASH: the coin lands and drives the word into the felt.
        //
        // The ring is VERTICAL and faces the camera, the table is horizontal. Two things follow. First, it
        // has to fall INTO the table's plane: a letter's height above the coin becomes distance across the
        // felt, and the quad turns from a billboard into one lying face up. Second, that has to happen ON
        // THE APPROACH, not at contact: the ring is 1.6 units deep, so its lower letters are under the felt
        // well before the coin lands, and the table cuts them in half on the way down.
        if (!physical && s.offT >= 0) {
          const gy = groundY ?? ay - 0.07
          const rise = Math.sin(th) * radiusUsed * 0.92
          // each letter TRAILS the coin by its own fraction of a second, so the word rains onto the felt
          // in a ripple. As a trail rather than an offset: an offset applied the moment the drop starts is
          // a step of up to half a unit on one frame, which is the break between the float and the fall.
          // A trail is zero while the coin is still hovering and grows only as the coin gains speed.
          dy += Math.max(0, -tk.vys) * (rnd(i, 18) * 0.055)
          // how close this letter is to the felt: tips through the last TIP units of its approach
          const TIP = 1.15
          const yNow = yArc + dy
          const near = Math.min(1, Math.max(0, (gy + TIP - yNow) / TIP))
          const flat = near * near * (3 - 2 * near)
          // the ring tips about the coin's centre, which would LIFT every letter that was below it while
          // it is still falling: on screen that is the letter stopping dead in mid air, as if it hit
          // something above the table. The tip may only ever lower a letter; the ones underneath simply
          // keep falling until the felt catches them. The sideways half of the tip is unchanged, so the
          // ring still opens out into the table's plane.
          dy += Math.min(0, -rise * flat)
          dz += rise * flat

          // TOUCHDOWN: from the frame it first reaches the felt, the letter bounces on its own clock, the
          // usual decaying-hop envelope, and settles. Two or three hops, all inside about half a second.
          const floor = gy + 0.045
          if (L.tg < 0 && yArc + dy <= floor) L.tg = t
          if (L.tg >= 0) {
            const tb = t - L.tg
            const hop = (0.30 + rnd(i, 19) * 0.26) * Math.exp(-tb / (0.19 + rnd(i, 20) * 0.1))
            const w2 = 15 + rnd(i, 21) * 9
            dy = floor - yArc + hop * Math.abs(Math.sin(w2 * tb))
          }

          if (smash >= 0) {
            const skid = 1 - Math.exp(-smash / 0.26)
            // a nudge apart, not a scatter: the word has to stay a word while it lies there
            const away = 0.22 + rnd(i, 16) * 0.3
            const rx = Math.cos(th) * radiusUsed
            const len = Math.hypot(rx, rise) || 1
            dx += (rx / len) * away * skid
            dz += (rise / len) * away * skid
            // yawed to the camera, with a few degrees of its own so the row is not mechanical, and only a
            // touch of turn out of the impact
            tableSpin = camYaw + (rnd(i, 17) - 0.5) * 0.2 + (Math.cos(th) < 0 ? -1 : 1) * 0.16 * skid
          } else {
            tableSpin = camYaw + (rnd(i, 17) - 0.5) * 0.2
          }
          flatAmt = flat
          // and nothing ever goes under the felt, whatever the timing does
          if (yArc + dy < floor) dy = floor - yArc
        }

        // the original exit, for the side by side: one quadratic drop on top of whatever the chip is
        // doing, three drift values and two spin rates
        if (OLDFALL && s.offT >= 0) {
          const ft = Math.max(0, s.offT - fallDelay)
          dy -= 6.5 * ft * ft
          dx += ((i % 3) - 1) * 0.35 * ft
          tilt += (i % 2 === 0 ? 1 : -1) * 2.4 * ft
        }

        // Leaving, in ONE idea: the letter gathers up, tips, and drops away accelerating, while the chip's
        // own plunge drags the word along. Nothing else. Tumbling, fluttering, sideways slip, spreading and
        // depth drift were all in here at once, each defensible on its own and together just noise: the
        // word came apart into six busy fragments instead of leaving as a word.
        if (s.offT >= 0 && DROPFALL) {
          const raw = s.offT - fallDelay
          const te = Math.max(0, raw)
          const dir = i % 2 === 0 ? 1 : -1

          const WIND = 0.07
          // asymmetric gravity: light going up so the gather reads and hangs, heavy coming down so it
          // lands. The eye reads the punch in how much faster the fall is than the rise.
          const v0 = 1.9 + rnd(i, 2) * 0.3
          const gUp = 16.0
          const gDown = 34.0
          const tA = v0 / gUp
          const hA = (v0 * v0) / (2 * gUp)
          const liftEnd = (v0 * WIND) / 2
          if (raw < 0) {
            const u = Math.max(0, raw + WIND)
            dy += (v0 * u * u) / (2 * WIND)
          } else if (te < tA) {
            dy += liftEnd + v0 * te - 0.5 * gUp * te * te
          } else {
            // hands over at the apex, where velocity is zero, so the switch is invisible
            const td = te - tA
            dy += liftEnd + hA - 0.5 * gDown * td * td
          }

          // it tips as it goes, and that is the whole rotation: a slow lean to about 25 degrees, easing
          // out, not a tumble. Spinning letters read as debris; a lean reads as a letter falling away.
          const kb = Math.min(1, Math.max(0, (raw + WIND) / WIND))
          const back = raw < 0 ? kb * kb * kb * (kb * (kb * 6 - 15) + 10) : 1
          tilt -= 0.12 * back * dir
          tilt += dir * 0.55 * (1 - Math.exp(-te / 0.42))
        }
      }
      // on the way out the letter falls past the table, and the felt is between it and the camera, so it
      // has to be drawn over the scene or it vanishes behind the felt instead of leaving the frame. The
      // switch waits until it is well below the word, where nothing is left to sort against: flipping it
      // on the first frame of the drop pops the letter in front of whatever it overlapped.
      const overTable = loose && dy < -1.5
      if (L.mat.depthTest === overTable) {
        L.mat.depthTest = !overTable
        L.mat.needsUpdate = true
      }
      L.mesh.renderOrder = overTable ? 12 : 6
      L.mesh.position.set(
        ax + right.x * (Math.cos(th) * radiusUsed + dx) + fwd.x * dz,
        yArc + dy,
        az + right.z * (Math.cos(th) * radiusUsed + dx) + fwd.z * dz,
      )
      // billboarded, then turned along the arc's tangent: pomme's badge-style wrap, which is what makes
      // the word read as bent around the object rather than laid in front of it
      L.mesh.quaternion.copy(camera.quaternion)
      L.mesh.rotateZ((arc === 'top' ? th - Math.PI / 2 : th - Math.PI * 1.5) + tilt)
      if (flatAmt > 0) {
        // driven into the felt: blend from facing the camera to lying face up on the table, spun about the
        // vertical. A plane turned -90 about x has its own up pointing away from the viewer, so the letter
        // still reads the right way round from above.
        eul.current.set(-Math.PI / 2, 0, 0)
        flatQ.current.setFromEuler(eul.current)
        eul.current.set(0, tableSpin, 0)
        spinQ.current.setFromEuler(eul.current)
        flatQ.current.premultiply(spinQ.current)
        L.mesh.quaternion.slerp(flatQ.current, flatAmt)
      }
      if (loose && WDBG) {
        const w = window as unknown as { __wd?: number[][]; __wpos?: number[][] }
        if (!w.__wd) w.__wd = []
        if (w.__wd.length > 2400) w.__wd.shift()
        if (i === 0) w.__wd.push([t, s.offT, L.mesh.position.y, 0, 0, tilt, 0, dy, 0, s.y])
        const row = w.__wd[w.__wd.length - 1]
        if (row) {
          if (i === N - 1) row[3] = L.mesh.position.y
          row[4] = o
          if (i === 2) {
            row[6] = tilt
            row[8] = dy
          }
        }
        // every letter's screen position plus the anchor's, for checking the arc is symmetric
        const ndc = L.mesh.position.clone().project(camera)
        if (i === 0) {
          const a = new THREE.Vector3(ax, ay, az).project(camera)
          w.__wpos = [[s.offT, a.x, a.y]]
        }
        w.__wpos?.push([i, ndc.x, ndc.y])
      }
    }
  })
  return <group ref={group} />
}
