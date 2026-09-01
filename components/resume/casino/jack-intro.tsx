'use client'

/**
 * "JACK OF ALL TRADES": the title card, before the chip is ever flicked.
 *
 * A Jack tumbles in, slaps down left of centre and tilted, and the phrase builds on it one word at a
 * time. Each word is a different trade, so each word is set in a different face, colour, size and place,
 * and each ARRIVES DIFFERENTLY: the Jack is stamped onto the card, "of" is breathed in behind it, "ALL"
 * is thrown at the camera, "TRADES" is typed. Then the chip comes up through the lockup and the whole
 * thing is carried off the top of the frame as the chip falls, which is the handoff into the table.
 *
 * The hits are on a 0.4 s grid on purpose. A title that lands on a beat reads as deliberate; the same
 * moves at arbitrary times read as a pile of animations. Every hit also SHAKES the lockup, because a
 * word that arrives and disturbs nothing does not feel like it hit anything.
 *
 * It is billboarded a fixed distance in front of the camera rather than placed on the set, so the
 * framing is the same whatever the camera is doing and the layout can be reasoned about in screen
 * units. It is still a scene object, so the compositor paints it with everything else.
 */
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { modalTransform, type ModalGesture } from 'blender-to-threejs'
import { cardBackCanvas, cardShape, planarUV } from './playing-cards'
import { loadRansomFaces, ransomPick, ransomScrap, rnd } from './ransom'
import { beatHold, beatTime, camLift, getLetter, getTune, JACK_FONTS, popUndo, pushUndo, setLetter, setTune, takeRecentre, TUNE_DEFAULTS, TUNE_RANGES, useTune, type Tune } from './tune'
import { SLIDE_CHART, chartAt, chartFor } from './stop-motion'

/**
 * ONE face for the whole line, and a display face rather than a system one.
 *
 * The first cut set every word in a different family, which is a literal reading of "each word its own
 * style" and looks like a ransom note: four typefaces in four words has no voice at all. The words are
 * still told apart by size, colour, place and the way each one arrives - that is plenty - and sharing a
 * face is what makes them read as one line.
 *
 * Fredericka is the default because it is an inked wood-type serif: it is what a court card and a saloon
 * bill are both set in, and its texture survives the paint pass rather than fighting it. ?jf= swaps it.
 */
/** the family for a stored index, clamped so a stale saved value cannot break the build */
function faceOf(i: number): string {
  return (JACK_FONTS[Math.max(0, Math.min(JACK_FONTS.length - 1, Math.round(i)))] ?? JACK_FONTS[0]).key
}

/** seconds from the armed clock. The four hits are 0.4 apart; the card lands a beat before the ink. */
export const JACK_BEATS = {
  cardIn: 0.55,
  cardLand: 1.35,
  jack: 1.65,
  of: 2.05,
  all: 2.45,
  trades: 2.85,
} as const
/** the last letter of TRADES is down here; anything after this is hold */
export const JACK_END = 3.03

/**
 * The flourish: a ribbon of cards whipped across the frame ahead of the Jack.
 *
 * One path, one card per phase offset, so they arrive as a moving LINE rather than as a scatter - which is
 * the whole difference between a flourish and confetti. The Jack enters from the same side while the tail
 * is still crossing, so it reads as having come out of the stream rather than as a separate event, and it
 * is the one card that stops.
 */
const SNAKE = { at: 0.1, dur: 0.78, gap: 0.03, count: 26, w: 0.26 }

/** where a card in the ribbon is at `u`, in the lockup's own plane: right to left, snaking. */
function snakePath(u: number, out: THREE.Vector3) {
  out.set(
    4.6 - 9.2 * u,
    // FIVE half-turns over the run, not two. The first cut had a wavelength longer than the frame, so what
    // was on screen at any moment was a single enormous arc: correct as a path and useless as a read,
    // because a snake is only a snake if you can see it turn. About two full undulations fit now.
    1.05 * Math.sin(u * Math.PI * 5 + 0.6) - 0.1,
    // and through the plane as well, so the ribbon has depth and the cards cross in front of and behind
    // each other instead of sliding along one flat line
    0.7 * Math.sin(u * Math.PI * 3.3 + 0.3),
  )
}

const PAPER = '#f6f2e6'
const INK = '#121212'
const RED = '#b8181c'
const GREEN = '#6cf59a'
const CREAM = '#e9dfc6'

/**
 * How far in front of the camera the lockup hangs.
 *
 * BEYOND THE COIN, which is the whole reason it is 17 and not 6. The chip is flicked from the table's
 * middle and comes to rest there, so at its apex it hangs on the frame's centre line and there is no way to
 * move it aside without moving where it lands, which the table's paint reveal, the folder and the perch all
 * The words are set as if the coin were not there, with ONE exception that is placement rather than a
 * channel: "of" is only two letters, so a coin parked over it removes the word entirely, where the same
 * coin crossing ALL's first stroke removes nothing. It sits left of the coin's column for that reason.
 *
 * key off. The alternative was pushing the type apart to leave the coin a channel, and that is the wrong
 * trade twice over: it is the coin's beat so the coin belongs in front, and a gap held open for something
 * that is only there for a second and a half reads as a hole in the line for the other six. The words are
 * set as if the coin were not there at all, and the coin crosses in front of them:
 * at 17 the lockup sits behind the chip's 12.7 at apex, so the letters no longer occlude it.
 *
 * The distance costs nothing in framing. `fit` below is derived from the frame half-height AT this
 * distance, so moving it just scales the whole lockup by the same factor and the angular size, the layout
 * and the texture resolution on screen are all identical. What it does cost is parallax on the way out:
 * a frozen object at 17 swings 2.8x less than one at 6 for the same camera drop, which is why the fall
 * wants to be long.
 */
const DIST = 17

/**
 * One word, drawn to canvas.
 *
 * Tight-fitted to the glyphs rather than to a fixed box, so `size` means the height of the LETTERS and two
 * words at the same size actually match. Tracking is applied per character, because canvas has no
 * letter-spacing.
 *
 * THE INK IS EXTRACTED, NOT FILLED, and that is not optional for the face this uses. KatieRoze is a colour
 * font and largely semi-transparent, so a plain fillText comes out as a ghost: the first cut of "of" was
 * set in it and rendered as literally nothing on screen. The glyphs are drawn, their silhouette kept as a
 * mask, the colour laid in through source-in, and the finished art drawn over ITSELF twice to compound the
 * alpha (a' = 1 - (1 - a)^3). That is exactly what resume-word.tsx does for the ALWAYS BET ON arcs, which
 * is the point: the title card and the table's own lettering are now the same ink out of the same pipe.
 *
 * `weight` dilates the glyph by stamping it around a ring, because a script face at this size is hairline
 * otherwise. Zero for the display faces behind ?jf, which are heavy already.
 */
function wordCanvas(text: string, o: { family: string; colour: string; track?: number; weight?: number; halo?: number; haloColour?: string }) {
  const S = 190
  const font = `${S}px '${o.family}', Georgia, 'Times New Roman', serif`
  const probe = document.createElement('canvas').getContext('2d')!
  probe.font = font
  const track = (o.track ?? 0) * S
  const adv = [...text].map((ch) => probe.measureText(ch).width)
  const w = adv.reduce((a, b) => a + b, 0) + track * (text.length - 1)
  const m = probe.measureText(text)
  const asc = m.actualBoundingBoxAscent || S * 0.72
  const desc = m.actualBoundingBoxDescent || S * 0.22
  /**
   * The face's CAP HEIGHT, which is what `size` means.
   *
   * It used to mean the height of this word's own bounding box, and that is not a property of the size at
   * all - it is a property of the face and of which letters happen to be in the word. KatieRoze spends most
   * of its box on ascenders and descenders and Fredericka does not, so swapping one for the other at the
   * same number doubled the lettering and threw the lockup off the frame. Measured off an H, the number
   * means the same thing in every face, and a font can be changed without re-dialling three sliders.
   */
  const cap = probe.measureText('H').actualBoundingBoxAscent || S * 0.7
  const weight = o.weight ?? 0
  const halo = o.halo ?? 0
  /**
   * The horizontal INK overhang, which the advance widths do not contain.
   *
   * `measureText(ch).width` is the ADVANCE - how far the pen travels - and a wood-type serif's ink is
   * routinely wider than that. The T of TRADES carries its left serif back PAST the pen origin, so laid
   * at bx = pad it began left of the canvas and the upstroke was sliced clean off at the texture edge.
   * The vertical case was always right, because asc/desc are actualBoundingBox values and those are real
   * ink; the same measurement was simply never taken across. Read per glyph at its laid position, so
   * tracking and any middle letter that overhangs are covered too, not just the first and last.
   *
   * Padded SYMMETRICALLY, by the worse of the two sides, on purpose: the quad is sized from aspect =
   * W / H and centred, so asymmetric padding would move the ink off the quad's centre and shift every
   * word by a few pixels. Every baked jk*X stays exactly where it was dialled.
   */
  let ovL = 0
  let ovR = 0
  {
    let px = 0
    for (let i = 0; i < text.length; i++) {
      const gm = probe.measureText(text[i])
      ovL = Math.max(ovL, (gm.actualBoundingBoxLeft ?? 0) - px)
      ovR = Math.max(ovR, px + (gm.actualBoundingBoxRight ?? adv[i]) - w)
      px += adv[i] + track
    }
  }
  const over = Math.ceil(Math.max(0, ovL, ovR))
  const padV = Math.ceil(S * 0.16) + halo + weight * 2
  const padH = padV + over
  const W = Math.max(2, Math.ceil(w) + padH * 2)
  const H = Math.max(2, Math.ceil(asc + desc) + padV * 2)
  const bx = padH
  const by = padV + asc

  const lay = (x: CanvasRenderingContext2D, dx: number, dy: number) => {
    let px = bx + dx
    for (let i = 0; i < text.length; i++) {
      x.fillText(text[i], px, by + dy)
      px += adv[i] + track
    }
  }

  // 1. the silhouette, dilated by a ring of taps
  const ink = document.createElement('canvas')
  ink.width = W
  ink.height = H
  const ix = ink.getContext('2d')!
  ix.font = font
  ix.textBaseline = 'alphabetic'
  const taps: [number, number][] = [[0, 0]]
  if (weight > 0) {
    const ring = weight <= 2 ? 4 : 12
    for (let k = 0; k < ring; k++) taps.push([Math.cos((k / ring) * Math.PI * 2) * weight, Math.sin((k / ring) * Math.PI * 2) * weight])
  }
  for (const [dx, dy] of taps) lay(ix, dx, dy)

  // 2. that silhouette, kept
  const mask = document.createElement('canvas')
  mask.width = W
  mask.height = H
  mask.getContext('2d')!.drawImage(ink, 0, 0)

  // 3. the colour, laid in through the silhouette, with the face's own texture multiplied back over it
  ix.globalCompositeOperation = 'source-in'
  ix.fillStyle = o.colour
  ix.fillRect(0, 0, W, H)
  ix.globalCompositeOperation = 'multiply'
  ix.globalAlpha = 0.15
  ix.drawImage(mask, 0, 0)
  ix.globalAlpha = 1
  ix.globalCompositeOperation = 'destination-in'
  ix.drawImage(mask, 0, 0)
  ix.globalCompositeOperation = 'source-over'

  // 4. compounded, because the face is largely semi-transparent and on a dark room that reads as dim ink
  const solid = document.createElement('canvas')
  solid.width = W
  solid.height = H
  solid.getContext('2d')!.drawImage(ink, 0, 0)
  ix.drawImage(solid, 0, 0)
  ix.drawImage(solid, 0, 0)

  // 5. a halo behind it, off the MASK rather than off strokeText, which a colour font does not answer
  const art = document.createElement('canvas')
  art.width = W
  art.height = H
  const ax = art.getContext('2d')!
  if (halo > 0) {
    const h = document.createElement('canvas')
    h.width = W
    h.height = H
    const hx = h.getContext('2d')!
    const ring = 16
    for (let k = 0; k < ring; k++) {
      hx.drawImage(mask, Math.cos((k / ring) * Math.PI * 2) * halo, Math.sin((k / ring) * Math.PI * 2) * halo)
    }
    hx.globalCompositeOperation = 'source-in'
    // it has to CONTRAST with the ink, which is the whole job. Cream ink under a paper halo is cream on
    // cream: "of" came out as a soft blob with no letters in it until this was a parameter.
    hx.fillStyle = o.haloColour ?? '#f6f2e6'
    hx.fillRect(0, 0, W, H)
    ax.globalAlpha = 0.72
    ax.drawImage(h, 0, 0)
    ax.globalAlpha = 1
  }
  ax.drawImage(ink, 0, 0)

  const tex = new THREE.CanvasTexture(art)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.needsUpdate = true
  // the plane's height is derived from the CAP height, so the padding and the descenders scale back out
  return { tex, aspect: W / H, boxToGlyph: H / cap }
}

/**
 * Everything in the lockup is a DECAL to the compositor.
 *
 * The position pass renders the scene a second time into a position buffer, and it does it through one
 * override material that cannot see alphaTest - so a transparent quad stamps its whole RECTANGLE, not its
 * glyph, and the pass's grain and edge terms then draw that rectangle. It is the same trap the resume's
 * link marks fell into. Thirty-eight quads were going through it every frame for the whole beat, for a
 * buffer none of them should be in.
 */
function asDecal<T extends THREE.Object3D>(o: T): T {
  o.userData.compNoPosition = true
  return o
}

/**
 * RANSOM NOTE LETTERING.
 *
 * Every letter is its own cut-out: a torn scrap of paper with one glyph on it, in its own face, its own
 * size, its own ink, sitting at its own angle. That is the whole grammar of the thing - a ransom note is
 * not "mixed fonts", it is letters that were physically CUT FROM DIFFERENT SOURCES and pasted down by
 * hand, and the paper under each one is what says so. Mixed faces with no paper just reads as broken CSS.
 *
 * The variation is deterministic, hashed from the seed and the letter's position, so the note is the same
 * one on every reload rather than reshuffling itself while it is being looked at. `jkSeed` rerolls it.
 *
 * The palette is the room: newsprint and cream stock, a black scrap cut from an ad, casino red, felt green
 * and chip gold. Dark scraps carry light ink, which is what gives a ransom note its flicker.
 */
/**
 * The faces a scrap can be cut from.
 *
 * The eight in the repo, plus system families that are genuinely different SHAPES rather than different
 * names - a slab, a fat poster sans, a typewriter, an engraver, a chalk, two scripts, a Didone. Variety in
 * a ransom note has to come from the letterforms; eight weights of one grotesque would read as one voice
 * with a stutter.
 *
 * A family a visitor does not have falls back, and here that is harmless: the fallback is simply another
 * face in a design whose whole premise is that the faces do not match. That is the one context where a
 * font stack failing is not a bug.
 */
/**
 * A word of cut-outs, flowed and measured.
 *
 * Returns each letter's offset from the word's own centre in units of the CAP HEIGHT, so the caller scales
 * the whole word by one number and the note holds together. Advances overlap slightly and unevenly, and
 * every letter carries its own tilt and baseline hop, because a hand-pasted line does not sit on a
 * baseline at all - that irregularity is the effect, not a defect in it.
 */
/**
 * How a WORD gets to its place.
 *
 * Per word, not per letter, and that is the whole correction. Giving every scrap its own path made fifteen
 * things travelling independently, which is not what stop motion looks like: an animator moves the pieces
 * and shoots ONE frame, so everything that moves moves together. A word now travels as a word - one
 * direction, one curve, one turn to unwind - and its letters differ only by a slight offset in where they
 * start from, so the group is loose without being fifteen separate events.
 *
 * Five kinds, because "unique" built out of a random offset is still the same move fifteen times over -
 * the eye reads the verb, not the numbers. These are five verbs: thrown in flat from a side, dropped from
 * above and tumbling, swung in on a wide arc, pushed up from under the line, spiralled in from a corner.
 */
interface Entry {
  /** where the word starts, relative to where it lands, in the lockup's units */
  fx: number
  fy: number
  /** how far the path bows off the straight line between the two, and which side */
  bow: number
  /** the turn it unwinds on the way in */
  spin: number
  /**
   * Its own travel time, so the four words do not all land on the same instant.
   *
   * They share a start - that is what "together, not one after another" meant - but a shared DURATION on
   * top of that made the whole line snap home on one frame, which is the one moment in the beat that
   * cannot look accidental. Different distances taking different times is also just what throwing four
   * things at once looks like.
   */
  dur: number
}


/**
 * How far the whole lockup floats in front of the card. See LADDER for why it is not simply zero.
 *
 * place() divides the placement and the scale by the parallax this causes, so lifting the type off the
 * card costs nothing visually and only keeps every scrap on the near side of it.
 */
const Z_BASE = 0.7
/**
 * The gap between two scraps in depth, and the fix for one word cutting through another.
 *
 * Scraps used to take random depths out of one continuous range, so two of them could end up a hair
 * apart - and since every scrap is a plane TILTED out of the picture plane, two at nearly the same depth
 * do not merely overlap, they INTERSECT, and the intersection shows as a hard straight cut across a
 * letter. That is what "of is clipping through ALL" was.
 *
 * The obvious fix, a depth band per word, is worse than the problem: it makes a word occlude another one
 * outright wherever they overlap, and the line reads as ALL pasted over the top of everything. What
 * actually wants preserving is the INTERLEAVE - "of" in front of one letter of ALL and behind the next -
 * so the depths are quantised onto one ladder shared by the whole lockup instead, with every scrap on its
 * own rung and the rungs dealt out at random across all four words. A rung has to clear a tilted scrap's
 * own depth, which is what this number is: comfortably more than a letter's half-diagonal times the tilt.
 */
const LADDER = 0.15

/** deal the rungs out across every scrap in the lockup, so no two share a depth and none of it is in order */
function assignDepths(words: { letters: { dz: number }[] }[], seed: number) {
  const all = words.flatMap((w2) => w2.letters)
  const rung = all.map((_, i) => i)
  for (let i = rung.length - 1; i > 0; i--) {
    const j = Math.floor(rnd(seed, i, 770) * (i + 1))
    const t = rung[i]
    rung[i] = rung[j]
    rung[j] = t
  }
  const mid = (all.length - 1) / 2
  for (let i = 0; i < all.length; i++) all[i].dz = (rung[i] - mid) * LADDER
}


function makeEntry(seed: number, w: number): Entry {
  const r = (n: number) => rnd(seed * 977 + w * 31, 0, 500 + n)
  const kind = Math.floor(r(0) * 5)
  const side = r(1) < 0.5 ? -1 : 1
  switch (kind) {
    case 0:
      return { fx: side * (4.4 + r(3) * 2.4), fy: (r(4) - 0.5) * 0.85, bow: side * (0.3 + r(5) * 0.5), spin: side * (0.25 + r(6) * 0.5), dur: 0.40 + r(8) * 0.1 }
    case 1:
      return { fx: (r(3) - 0.5) * 1.5, fy: 3.4 + r(4) * 2, bow: side * (0.2 + r(5) * 0.35), spin: side * (0.7 + r(6) * 0.9), dur: 0.48 + r(8) * 0.12 }
    case 2:
      return { fx: side * (2.5 + r(3) * 1.7), fy: -1.7 - r(4) * 1.7, bow: -side * (0.9 + r(5) * 0.8), spin: -side * (0.6 + r(6) * 0.8), dur: 0.56 + r(8) * 0.14 }
    case 3:
      return { fx: (r(3) - 0.5) * 0.7, fy: -2.2 - r(4) * 1.4, bow: side * (0.12 + r(5) * 0.25), spin: side * (0.06 + r(6) * 0.25), dur: 0.36 + r(8) * 0.1 }
    default:
      return { fx: side * (2.9 + r(3) * 2), fy: (r(4) < 0.5 ? -1 : 1) * (2.6 + r(5) * 1.7), bow: side * (0.55 + r(6) * 0.6), spin: side * (1.2 + r(7) * 1.3), dur: 0.52 + r(9) * 0.16 }
  }
}

type RansomWord = ReturnType<typeof ransomWord>
function ransomWord(text: string, seed: number, w: number, forced: number, initial: number, vary: number, scatter: number) {
  const out: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; x: number; dy: number; rot: number; rx: number; ry: number; dz: number; k: number; ox: number; oy: number; lag: number }[] = []
  let cursor = 0
  const chars = [...text]
  /**
   * Faces and stocks are drawn HERE, with a redraw whenever one repeats its neighbour.
   *
   * The first attempt just offset the index by the letter's position, which guarantees no repeat and
   * guarantees something worse: consecutive scraps land on ADJACENT entries, and adjacent entries in a
   * palette are the ones that look alike. ALL came out gold, gold, red and TRADES came out four creams in
   * a row. Redrawing until it differs keeps the spread the randomness was supposed to give.
   */
  let prevFace = -1
  let prevStock = -1
  for (let i = 0; i < chars.length; i++) {
    const { faceI, stockI } = ransomPick(chars[i], seed, w, i, prevFace, prevStock)
    prevFace = faceI
    prevStock = stockI
    const L = ransomScrap(chars[i], seed, w, i, forced, faceI, stockI)
    const r = (n: number) => rnd(seed * 977 + w * 31, i, 40 + n)
    // sizes vary per scrap, which is most of what says these came from different places
    /**
     * The size this scrap was cut at.
     *
     * Two parts, and they do different jobs. The jitter is the small unevenness of fifteen things cut by
     * hand. The INITIAL is a composition: the first letter of a word is cut much bigger, the way a ransom
     * note is assembled around whatever headline word was to hand. Jitter on its own gives fifteen letters
     * that are all slightly different and none of them dominant, which reads as untidy rather than cut.
     */
    const k = (1 - vary + r(1) * vary * 2) * (i === 0 ? initial : 1)
    const hw = (L.W / L.cap) * k
    const hh = (L.H / L.cap) * k
    const tex = new THREE.CanvasTexture(L.canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    // alphaTest with depthWrite: the torn silhouette is cut out per pixel AND the solid part writes depth,
    // which is what lets a scrap in front actually hide the one behind it instead of blending over it
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, alphaTest: 0.4, depthWrite: true, toneMapped: false, fog: false })
    /**
     * FLAT again. The scraps were briefly solids with a real cut edge, and thickness that reads at this
     * size is thickness paper does not have - they came out as slabs. The depth is carried by the tilt,
     * the stacking and the pass instead, which is the honest amount for a thing that is one sheet thick.
     *
     * What the solid version was worth keeping for is the DRAW STATE: alphaTest cuts the torn silhouette
     * per pixel and depthWrite lets the depth buffer decide what is in front, so a scrap actually hides
     * the one behind it rather than blending over it. A plane does that just as well.
     */
    const geo = new THREE.PlaneGeometry(hw, hh)
    const mesh = asDecal(new THREE.Mesh(geo, mat))
    /**
     * WHICH SCRAP IS ON TOP IS RANDOM, and it has to be said explicitly.
     *
     * Left to itself the pile stacks in reading order, because that is the order the meshes were made in
     * and every one of them shared a renderOrder - so the right-hand letter was always the one lying over
     * its neighbour, which is the one thing a hand-pasted note never does.
     */
    mesh.renderOrder = 20 + Math.floor(r(8) * 12)
    // a shade of air between scraps. They may touch and occasionally overlap - that is the look - but a
    // pair that overlaps by a quarter of a letter reads as one smudged glyph rather than two pasted ones.
    const adv = hw * (1.02 + r(2) * 0.12)
    out.push({
      mesh,
      mat,
      // OFF THE LINE. A hand-pasted word does not sit on a baseline: the hop, the uneven advance and the
      // roll are all one setting, because they are one idea - that nobody measured any of this.
      x: cursor + hw / 2 + (r(9) - 0.5) * scatter * 0.5,
      dy: (r(3) - 0.5) * scatter * 2,
      rot: (r(4) - 0.5) * scatter * 1.1,
      // IN SPACE, not on a plane: each scrap is turned out of the picture plane on both axes and sits at
      // its own depth. The lockup is billboarded, so without this every letter is exactly parallel to the
      // lens and the whole thing reads as a decal printed on the frame. A perspective camera does the rest
      // - the far scraps come back smaller and the tilted ones foreshorten, on their own.
      // back down from 1.0 / 1.6: the wider turn went with the thickness and read as the same overdone
      // thing. This is enough to foreshorten a scrap and to let the camera's fall move them against each
      // other, without any of them looking like it is standing on edge.
      rx: (r(5) - 0.5) * 0.6,
      ry: (r(6) - 0.5) * 0.6,
      // overwritten by assignDepths once every word exists: depth is a property of the whole lockup, not
      // of one word, because the scraps that must not collide are the ones from DIFFERENT words
      dz: 0,
      k,
      // its slight offset from where the WORD starts: enough that the group is loose, not enough that
      // the letter reads as arriving on its own errand
      ox: (r(10) - 0.5) * 1.1,
      oy: (r(11) - 0.5) * 1.1,
      // and a good way behind it. Every scrap in a word used to switch on and settle on the same frame,
      // which reads as a cut rather than as an arrival. This is a quarter of a second across a word, which
      // is enough that the eye can follow individual scraps landing instead of being handed a finished
      // line - the whole point of assembling it on camera.
      lag: r(12) * 0.26,
    })
    cursor += adv
  }
  // recentre on the word's own middle so the caller positions a word, not its first letter
  for (const o of out) o.x -= cursor / 2
  return { letters: out, width: cursor, entry: makeEntry(seed, w) }
}

/** a billboarded plane carrying one canvas, sized by glyph height */
function wordMesh(text: string, size: number, o: Parameters<typeof wordCanvas>[1]) {
  const { tex, aspect, boxToGlyph } = wordCanvas(text, o)
  const h = size * boxToGlyph
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false })
  const mesh = asDecal(new THREE.Mesh(new THREE.PlaneGeometry(h * aspect, h), mat))
  return { mesh, mat }
}

/**
 * The card the Jack is printed on: paper, a hairline frame, and the four suits in the corners.
 *
 * All four, because the joke is the phrase. A Jack that belongs to one suit is a card; a Jack that
 * belongs to every suit is the line itself, and it costs four glyphs to say.
 */
function cardFace(W: number, H: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const x = c.getContext('2d')!
  x.fillStyle = PAPER
  x.fillRect(0, 0, W, H)
  x.strokeStyle = 'rgba(184,24,28,0.32)'
  x.lineWidth = 6
  x.strokeRect(24, 24, W - 48, H - 48)
  const suits: [string, string][] = [['♠', INK], ['♥', RED], ['♣', INK], ['♦', RED]]
  /**
   * One corner index: the J with its suit under it.
   *
   * The block is centred at 0.135 of the height, not 0.11, and that is not taste. At 0.11 with a 0.15W
   * letter the top of the J sat at y = -3: it was being CLIPPED by the edge of the canvas, so the card
   * came out with four decapitated indices. It clears the hairline frame at 24 px now with room over.
   */
  const idx = (cx: number, cy: number, flip: boolean, s: [string, string]) => {
    x.save()
    x.translate(cx, cy)
    if (flip) x.rotate(Math.PI)
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    x.font = `700 ${Math.round(W * 0.13)}px 'Times New Roman', Times, serif`
    x.fillStyle = s[1]
    x.fillText('J', 0, -W * 0.07)
    x.font = `${Math.round(W * 0.11)}px 'Times New Roman', Times, serif`
    x.fillText(s[0], 0, W * 0.065)
    x.restore()
  }
  idx(W * 0.125, H * 0.135, false, suits[0])
  idx(W * 0.875, H * 0.865, true, suits[1])
  idx(W * 0.875, H * 0.135, false, suits[2])
  idx(W * 0.125, H * 0.865, true, suits[3])
  // the court plate, empty: the word is stamped into it a beat later and wants a clean field
  x.strokeStyle = 'rgba(26,26,26,0.22)'
  x.lineWidth = 4
  x.strokeRect(W * 0.24, H * 0.2, W * 0.52, H * 0.6)
  return c
}

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t))
  return x * x * x * (x * (x * 6 - 15) + 10)
}
const cl = (x: number) => Math.min(1, Math.max(0, x))

/**
 * Where a word is along its travel, on `steps` exposures. Returns the progress and the exposure's index.
 *
 * A hard attack that decelerates onto its mark: 0 at the start, exactly 1 at the end, with nothing past
 * it. The thrown read comes from the ATTACK, not from a bounce at the end.
 *
 * The easing is nearly linear on purpose. Under a step quantiser a strong ease-out puts most of the
 * distance into the first pose or two and leaves the rest as a crawl, so only two of the eight exposures
 * read as movement at all; even strides, then the overshoot and the settle, is what an animator's pass
 * actually looks like.
 *
 * TIME is what gets quantised, not the eased progress, and that is the whole difference between a pose
 * held for a beat and a pose held for half a second. Quantising the eased value gives exposures of wildly
 * different lengths - the curve is steep at the start, so the first poses flick past, and shallow at the
 * end, so the last ones sit there - which reads as the word stalling exactly as it arrives. Stepping the
 * CLOCK gives every pose the same length and lets the easing do what easing is for: a big move, then a
 * smaller one, then smaller again, each held for the same beat.
 *
 * The settle wobble is evaluated on the same stepped clock. A word that lands in steps and then rings
 * smoothly gives the whole thing away.
 */
function arrive(s: number, dur: number, steps = 0): { p: number; n: number } {
  if (s <= 0) return { p: 0, n: 0 }
  const step = steps > 0 ? dur / steps : 0
  const n = step > 0 ? Math.ceil(s / step) : 0
  const sq = step > 0 ? n * step : s
  const u = Math.min(1, sq / dur)
  /**
   * The curve depends on WHETHER IT IS STEPPED, and the two wants are opposite.
   *
   * Smooth wants a hard ease: a thrown thing covers most of its distance immediately and then kills its
   * speed, and anything close to linear reads as floating rather than as thrown. That is what "slow and
   * looks bad" was - the flat 1.25 curve was correct for the stepped version and wrong the moment the
   * quantiser came off.
   *
   * Stepped wants the opposite, because a hard ease-out under a quantiser puts most of the distance in the
   * first pose and leaves the rest a crawl, so only two exposures read as movement at all.
   */
  const e = 1 - Math.pow(1 - u, steps > 0 ? 1.25 : 3.2)
  // NO overshoot. There used to be a small ring past home, which is the standard way to land a thrown
  // thing and here read as a nudge after the scrap had already arrived - a second little move rather than
  // a settle. The hard ease kills the speed on its own; a pasted scrap does not bounce.
  return { p: e, n }
}

/**
 * The same arrival as the title's, off the same authored chart.
 *
 * arrive() above documents the exact trap this avoids, from the other side: a
 * hard ease under a quantiser "puts most of the distance in the first pose and
 * leaves the rest a crawl, so only two exposures read as movement at all". That
 * is what a decimated curve always does, and it is why the title read as lag.
 * The chart is authored per exposure instead, so no pose jumps more than a fifth
 * of the travel and the gaps are deliberately uneven.
 *
 * `p` is returned UNCLAMPED on purpose: the chart starts at -0.06 and peaks at
 * 1.04, and the Bezier below extrapolates those into a real anticipation before
 * the push and a real carry past the mark, rather than a curve that eases
 * perfectly into place.
 */
function chartArrive(s: number, step: number, fps: number): { p: number; n: number } {
  if (s <= 0) return { p: SLIDE_CHART[0], n: 0 }
  const c = chartAt(s, 0, fps, step)
  return { p: c.k, n: c.pose }
}

export default function JackIntro({
  armed,
  clock0,
  flickAt,
  riseFor,
  holdFor,
}: {
  /** the beat's clock only starts once the page cover has cleared, exactly like the chip's */
  armed: boolean
  /** the CHIP's start time, so the two share one clock instead of two that drift */
  clock0: MutableRefObject<number>
  /** when the chip is flicked: the lockup starts being lifted here */
  flickAt: number
  /** the chip's rise and apex hold, so the hard exit lands on the frame the chip starts falling */
  riseFor: number
  holdFor: number
}) {
  const { camera, gl } = useThree()
  const group = useRef<THREE.Group>(null)
  /** the live scale factor, so a screen drag can be converted into the lockup's own units */
  const fitRef = useRef(1)
  const t0 = useRef(-1)
  /** what G / S / R will act on: set by clicking or dragging something, cleared by clicking empty space */
  const sel = useRef<string | null>(null)
  /** the world transform the lockup is let go at, so the falling camera leaves it behind */
  const frozen = useRef<null | { p: THREE.Vector3; q: THREE.Quaternion; s: number }>(null)
  /** the latched centring offset: recomputed only when something asks for it, never every frame */
  const centre = useRef<[number, number]>([0, 0])
  const built = useRef<null | {
    card: THREE.Mesh
    cardMat: THREE.MeshBasicMaterial
    backMat: THREE.MeshBasicMaterial
    snake: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; i: number }[]
    /** what each grabbable mesh edits: its two position keys and its size key */
    pick: { mesh: THREE.Mesh; name: string; i: number; x: keyof Tune; y: keyof Tune; r: keyof Tune; s: keyof Tune }[]
    /** the card and the words, offset as one so the line can be centred on its own bounds */
    lock: THREE.Group
    jack: RansomWord
    jackFit: number
    of: RansomWord
    all: RansomWord
    trades: RansomWord
  }>(null)
  const version = useRef(0)

  // the whole lockup, in the plane hanging in front of the camera. Laid out in world units at DIST:
  // the frame is 4.13 high there at fov 38, so these are roughly half-screen numbers.
  /**
   * The lockup is BUILT at the defaults and SCALED from there, never rebuilt.
   *
   * Sizes come out of the canvas the glyphs are drawn on, so honouring a size slider by rebuilding would
   * re-render ten canvases on every drag of it. Applying the ratio as a mesh scale costs nothing and keeps
   * the type exactly as crisp as it was drawn; all it gives up is that a very large increase eventually
   * shows the texture, which is what the slider's range is for. Positions and times are read straight out
   * of the store each frame, so those are free.
   */
  const D = TUNE_DEFAULTS
  /**
   * The four font choices, and the ONLY tune values this component re-renders on.
   *
   * A font is baked into the canvas the glyphs are drawn on, so changing one has to rebuild that word -
   * which is fine for a picker and would be ruinous for a slider. Everything else is read inside the frame
   * loop instead, so dragging a position or a size never re-renders anything at all.
   */
  const tuneNow = useTune()
  const fj = tuneNow.jkFontJack
  const fo = tuneNow.jkFontOf
  const fa = tuneNow.jkFontAll
  const ft = tuneNow.jkFontTrades
  /** rerolling the note recuts every scrap, so it is a build input like a font is */
  const seed = tuneNow.jkSeed
  // size is cut into the scrap, so these are build inputs like the seed and the fonts
  const initial = tuneNow.jkInitial
  const vary = tuneNow.jkVary
  const scatter = tuneNow.jkScatter

  useEffect(() => {
    let dead = false
    const mine = ++version.current
    // waits on document.fonts so every word is MEASURED against the face it will be drawn in; measuring
    // early lays the lockup out in fallback metrics and it never corrects itself
    loadRansomFaces().then(() => document.fonts.ready).then(() => {
      if (dead || mine !== version.current || !group.current) return
      const g = group.current
      const cw = D.jkCardW
      const ch = (cw * 3.5) / 2.5
      const faceCnv = cardFace(560, Math.round((560 * 3.5) / 2.5))
      const tex = new THREE.CanvasTexture(faceCnv)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 4
      const cardMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false })
      const shape = planarUV(new THREE.ShapeGeometry(cardShape(cw, ch, cw * 0.075), 12))
      const card = asDecal(new THREE.Mesh(shape, cardMat))
      card.renderOrder = 20
      // A BACK, because the throw flips it. A single plane faces +z, so every frame the card is turned away
      // it would simply not be drawn and the flip would read as the card blinking rather than turning. The
      // back is a child so it inherits the squash on landing, and it is the deck's own back, so a card
      // thrown in from off frame belongs to the hand already on the felt.
      const backTex = new THREE.CanvasTexture(cardBackCanvas())
      backTex.colorSpace = THREE.SRGBColorSpace
      backTex.anisotropy = 4
      const backMat = new THREE.MeshBasicMaterial({ map: backTex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false })
      const back = asDecal(new THREE.Mesh(shape.clone(), backMat))
      back.rotation.y = Math.PI
      back.position.z = -0.003
      back.renderOrder = 19
      card.add(back)

      // The ribbon. All backs, and DoubleSide rather than a face on the reverse: they are travelling fast
      // enough that nobody reads a face, the lattice is symmetric so a mirrored back is the same back, and
      // it is one material path instead of forty meshes. Own material each, only because they fade in and
      // out at their own moments.
      const sw = SNAKE.w
      const snakeGeo = planarUV(new THREE.ShapeGeometry(cardShape(sw, sw * 1.4, sw * 0.075), 8))
      const snake = Array.from({ length: SNAKE.count }, (_, i) => {
        const mat = new THREE.MeshBasicMaterial({ map: backTex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, fog: false })
        const m = asDecal(new THREE.Mesh(snakeGeo, mat))
        m.renderOrder = 18
        m.visible = false
        return { mesh: m, mat, i }
      })

      // Four ransom words. Each is its own set of cut-outs, so the mix is per LETTER rather than per word,
      // which is the difference between a ransom note and four fonts in a row.
      const jack = ransomWord('JACK', seed, 0, fj, initial, vary, scatter)
      for (const L of jack.letters) L.mesh.renderOrder = 21
      // Scaled to the CARD it is printed on, measured off the flowed word rather than set by eye. At its
      // own size the word came out wider than the card and ran off both edges, which is what "the J is not
      // on the card correctly" was: not the index, the word.
      /**
       * JACK is allowed to OVERHANG the card now, up to a quarter of its width past each edge.
       *
       * Fitting it strictly inside the court plate was shrinking it to about 40 percent, which is why
       * turning its slider up did so little - the clamp was eating most of what the slider gave. A pasted
       * letter that runs off the edge of the card it is stuck to is what a real note looks like anyway.
       */
      const jackFit = Math.min(1, (cw * 1.3) / (jack.width * D.jkJackS))
      const of = ransomWord('of', seed, 1, fo, initial, vary, scatter)
      const all = ransomWord('ALL', seed, 2, fa, initial, vary, scatter)
      const trades = ransomWord('TRADES', seed, 3, ft, initial, vary, scatter)
      const words = [jack, of, all, trades]
      assignDepths(words, seed)

      // one inner group for the card and the type, so the whole line can be shifted by its own centring
      // without disturbing the ribbon, which is a full-frame flourish and belongs to the frame
      const lock = new THREE.Group()
      lock.add(card, ...words.flatMap((w2) => w2.letters.map((L) => L.mesh)))
      g.add(lock, ...snake.map((k) => k.mesh))
      const pick = [
        { mesh: card, name: 'card', i: -1, x: 'jkCardX' as const, y: 'jkCardY' as const, r: 'jkCardTilt' as const, s: 'jkCardW' as const },
        // every letter grabs its whole word: a word is one thing to move, however many scraps it is made of
        ...jack.letters.map((L, li) => ({ mesh: L.mesh, name: 'JACK', i: li, x: 'jkJackX' as const, y: 'jkJackY' as const, r: 'jkJackR' as const, s: 'jkJackS' as const })),
        ...of.letters.map((L, li) => ({ mesh: L.mesh, name: 'of', i: li, x: 'jkOfX' as const, y: 'jkOfY' as const, r: 'jkOfR' as const, s: 'jkOfS' as const })),
        ...all.letters.map((L, li) => ({ mesh: L.mesh, name: 'ALL', i: li, x: 'jkAllX' as const, y: 'jkAllY' as const, r: 'jkAllR' as const, s: 'jkAllS' as const })),
        ...trades.letters.map((L, li) => ({ mesh: L.mesh, name: 'TRADES', i: li, x: 'jkTrX' as const, y: 'jkTrY' as const, r: 'jkTrR' as const, s: 'jkTrS' as const })),
      ]
      built.current = { card, cardMat, backMat, snake, pick, lock, jack, jackFit, of, all, trades }
    })
    return () => {
      dead = true
      const b = built.current
      if (b && group.current) {
        const all2 = [b.card, ...(b.card.children as THREE.Mesh[]), ...b.snake.map((k) => k.mesh), ...[b.jack, b.of, b.all, b.trades].flatMap((w2) => w2.letters.map((L) => L.mesh))]
        for (const o of all2) {
          group.current.remove(o)
          o.geometry.dispose()
          ;(o.material as THREE.Material).dispose()
        }
      }
      built.current = null
    }
  }, [D, fj, fo, fa, ft, seed, initial, vary, scatter])

  /**
   * Drag to move, shift-drag to resize, straight in the frame.
   *
   * Only while the beat is frozen, which is the only time the thing being dragged is on screen long enough
   * to drag. Sliders are exact and a drag is not; the point of having both is that placing something is a
   * spatial decision and doing it through two numbered axes is a translation nobody should be doing in
   * their head.
   *
   * It raycasts the meshes itself rather than going through r3f's pointer events, because these meshes are
   * built imperatively and added to a group - r3f only routes events to objects it created. The handler is
   * on the CAPTURE phase so a grab never reaches the folder or the chip underneath it.
   */
  useEffect(() => {
    if (beatHold() === null) return
    const el = gl.domElement
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    type Grab = { name: string; i: number; x: keyof Tune; y: keyof Tune; r: keyof Tune; s: keyof Tune }
    let drag: (Grab & { one: boolean; lk: string; px: number; py: number; sx: number; sy: number; ss: number; resize: boolean }) | null = null

    const hit = (e: PointerEvent): Grab | null => {
      const b2 = built.current
      if (!b2) return null
      const r = el.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      const hits = ray.intersectObjects(b2.pick.map((q) => q.mesh), false)
      if (!hits.length) return null
      return b2.pick.find((q) => q.mesh === hits[0].object) ?? null
    }
    const clampKey = (k: keyof Tune, v: number) => {
      const [mn, mx] = TUNE_RANGES[k]
      return Math.max(mn, Math.min(mx, Math.round(v * 1000) / 1000))
    }
    const down = (e: PointerEvent) => {
      const g2 = hit(e)
      if (!g2) {
        // clicking nothing deselects, the way it does in a viewport
        sel.current = null
        return
      }
      e.preventDefault()
      e.stopPropagation()
      const t2 = getTune()
      sel.current = g2.name
      /**
       * ALT edits the ONE LETTER, everything else edits its word.
       *
       * Both are wanted and they are the same gesture, so the modifier is the whole difference: a word is
       * the thing you place, a letter is the thing you nudge once the word is placed. Holding alt writes to
       * the sparse per-letter map instead of to the word's own numbers.
       */
      const one = e.altKey && g2.i >= 0
      const lk = `${g2.name}:${g2.i}`
      const lt = getLetter(lk)
      if (!one) pushUndo([g2.x, g2.y, g2.s])
      drag = {
        ...g2,
        one,
        lk,
        px: e.clientX,
        py: e.clientY,
        sx: one ? lt.dx : t2[g2.x],
        sy: one ? lt.dy : t2[g2.y],
        ss: one ? lt.s : t2[g2.s],
        resize: e.shiftKey,
      }
      el.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!drag) {
        el.style.cursor = hit(e) ? 'grab' : ''
        return
      }
      const dx = e.clientX - drag.px
      const dy = e.clientY - drag.py
      if (drag.resize) {
        // up is bigger, and proportional, so the feel is the same whatever size it started at
        const k = drag.ss * (1 - dy * 0.005)
        if (drag.one) setLetter(drag.lk, { s: Math.max(0.2, Math.min(4, Math.round(k * 1000) / 1000)) })
        else setTune({ [drag.s]: clampKey(drag.s, k) } as Partial<Tune>)
        return
      }
      // one screen pixel in the lockup's own units: pixels are square, so the same factor serves both axes
      const cam = camera as THREE.PerspectiveCamera
      const per = (2 * DIST * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) / el.clientHeight / (fitRef.current || 1)
      if (drag.one) {
        // the per-letter offset is in the WORD's units, which are already scaled by its size, so the same
        // pixel delta has to be divided by that or a small word's letters move faster than a big one's
        const sk = getTune()[drag.s] || 1
        setLetter(drag.lk, { dx: drag.sx + (dx * per) / sk, dy: drag.sy - (dy * per) / sk })
        return
      }
      setTune({ [drag.x]: clampKey(drag.x, drag.sx + dx * per), [drag.y]: clampKey(drag.y, drag.sy - dy * per) } as Partial<Tune>)
    }
    const up = (e: PointerEvent) => {
      if (!drag) return
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        /* the capture can already be gone */
      }
      drag = null
    }
    el.addEventListener('pointerdown', down, true)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      el.style.cursor = ''
      el.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [gl, camera])

  /**
   * G to move, S to size, R to roll, on whatever was last clicked.
   *
   * The controller in the library reports the gesture and this decides what it means, because the lockup's
   * layout lives in the tune store and is re-applied every frame - writing to the Object3D would be
   * overwritten on the next one. Pixels convert to the lockup's own units the same way the drag does.
   *
   * A typed number REPLACES the pointer rather than adding to it, as it does in Blender, and rotation is
   * typed in DEGREES because nobody thinks in radians at a keyboard.
   */
  useEffect(() => {
    if (beatHold() === null) return
    const el = gl.domElement
    let start: { x: number; y: number; r: number; s: number } | null = null
    let keys: { x: keyof Tune; y: keyof Tune; r: keyof Tune; s: keyof Tune } | null = null
    const clampKey = (k: keyof Tune, v: number) => {
      const [mn, mx] = TUNE_RANGES[k]
      return Math.max(mn, Math.min(mx, Math.round(v * 1000) / 1000))
    }
    const stop = modalTransform(el, {
      axes: ['x', 'y'],
      enabled: () => sel.current !== null && !!built.current,
      onBegin: () => {
        const b2 = built.current
        const p2 = b2?.pick.find((q) => q.name === sel.current)
        if (!p2) return
        keys = { x: p2.x, y: p2.y, r: p2.r, s: p2.s }
        const t2 = getTune()
        start = { x: t2[p2.x], y: t2[p2.y], r: t2[p2.r], s: t2[p2.s] }
        pushUndo([p2.x, p2.y, p2.r, p2.s])
      },
      onUpdate: (g2: ModalGesture) => {
        if (!start || !keys) return
        const cam = camera as THREE.PerspectiveCamera
        const per = (2 * DIST * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) / el.clientHeight / (fitRef.current || 1)
        const f = g2.fine ? 0.15 : 1
        if (g2.mode === 'move') {
          if (g2.exact !== null) {
            const ax = g2.axis ?? 'x'
            setTune({
              [keys.x]: clampKey(keys.x, ax === 'x' ? start.x + g2.exact : start.x),
              [keys.y]: clampKey(keys.y, ax === 'y' ? start.y + g2.exact : start.y),
            } as Partial<Tune>)
            return
          }
          const dx = g2.axis === 'y' ? 0 : g2.dx * per * f
          const dy = g2.axis === 'x' ? 0 : -g2.dy * per * f
          setTune({ [keys.x]: clampKey(keys.x, start.x + dx), [keys.y]: clampKey(keys.y, start.y + dy) } as Partial<Tune>)
        } else if (g2.mode === 'scale') {
          const k = g2.exact !== null ? g2.exact : 1 - g2.dy * 0.005 * f
          setTune({ [keys.s]: clampKey(keys.s, start.s * k) } as Partial<Tune>)
        } else {
          const rad = g2.exact !== null ? THREE.MathUtils.degToRad(g2.exact) : g2.dx * 0.006 * f
          setTune({ [keys.r]: clampKey(keys.r, start.r + rad) } as Partial<Tune>)
        }
      },
      onCancel: () => {
        if (!start || !keys) return
        setTune({ [keys.x]: start.x, [keys.y]: start.y, [keys.r]: start.r, [keys.s]: start.s } as Partial<Tune>)
        // and drop the entry it pushed on begin: a cancelled gesture has already undone itself, so leaving
        // it there costs the next Ctrl+Z a press that does nothing visible
        popUndo()
        start = null
        keys = null
      },
      onCommit: () => {
        start = null
        keys = null
      },
    })
    return stop
  }, [gl, camera])

  useFrame((state, dt) => {
    const g = group.current
    const b = built.current
    if (!g || !b) return
    if (!armed) {
      g.visible = false
      return
    }
    if (t0.current < 0) t0.current = clock0.current > 0 ? clock0.current : state.clock.elapsedTime
    const t = beatTime(state.clock.elapsedTime - t0.current)
    /**
     * ONE quantiser, and this is why it reads as an animation rather than as a stuck page.
     *
     * The letters used to run on a clock floored to a frame rate AND a travel quantised into poses. Two
     * grids that do not divide into each other beat: a pose came out one frame long, the next two, the
     * next one. Uneven holds are the actual signature of a dropped frame - a deliberate cadence is the
     * thing an eye reads as intent - so the frame rate grid is gone and the poses alone set the rhythm,
     * every one of them held exactly as long as the last.
     */
    const tn = getTune()
    // the beats, live: dragging one of these while the page is open re-cuts the timing on the next loop
    const B = { cardIn: tn.jkTCardIn, cardLand: tn.jkTCardLand, jack: tn.jkTJack, of: tn.jkTOf, all: tn.jkTAll, trades: tn.jkTTrades }
    const dropAt = flickAt + riseFor + holdFor
    /**
     * The frame the LENS turns over, which is jkOver after the coin does and is what the title is keyed to.
     *
     * Keying it to the coin instead of the lens is what made the camera look like it went up TWICE.
     * Up to that instant the title follows the camera and holds back jkLag of the climb, so it sinks at a
     * third of the camera's rate; the moment it is let go it sinks at the FULL rate, because it is now
     * standing still while the lens keeps climbing. Same direction, three times the speed, starting on one
     * frame - which reads as a second, harder push upward exactly when the coin gets high.
     */
    const letGo = dropAt + tn.jkSink
    const gone = letGo + tn.jkFallFor + 0.1
    g.visible = t >= SNAKE.at - 0.05 && t < gone
    if (!g.visible) return

    /**
     * Hung a fixed distance in front of the camera while it is being read, and shrunk on a narrow frame so
     * the lockup never runs off.
     *
     * THE MOMENT THE FALL STARTS IT IS LET GO. Its world transform is frozen and the camera drops away from
     * it, which is the whole difference between this reading as the camera falling and reading as the words
     * flying up: the pixels are not far apart, the cue is. A billboard that goes on tracking a falling
     * camera falls WITH it and never leaves the frame at all, so it has to be released for the drop to cost
     * it anything.
     *
     * AND IT IS PART-RELEASED ON THE WAY UP, for the same reason a beat earlier. The camera chases the coin
     * up by CAM_LIFT, and a title welded to the camera rides that climb exactly - it sits in the identical
     * place in frame while the lens travels four units, and since nothing else world-fixed is on screen at
     * that height there is no other cue either, so the move is simply invisible. Holding back jkLag of
     * the climb lets the lens be SEEN going up past it: the line sinks in frame as the camera rises, and
     * then shoots back up out of the top as the camera drops. Not the full amount, or the last word would
     * be pushed off the bottom edge before the fall even starts.
     */
    const cam = camera as THREE.PerspectiveCamera
    const halfH = DIST * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)
    const halfW = halfH * cam.aspect
    // no cap at 1: the factor is relative to the frame half-height at DIST, so capping it would peg the
    // lockup to a size that only meant anything when DIST was 6
    let fit = Math.min(halfW / 2.95, halfH / tn.jkFit)
    fitRef.current = fit
    if (t < letGo) {
      frozen.current = null
      const fwd = scratch.fwd
      cam.getWorldDirection(fwd)
      g.position.copy(cam.position).addScaledVector(fwd, DIST)
      // the same arc the camera is on, so the two can never drift apart
      g.position.y -= tn.jkLag * camLift(t, flickAt, dropAt, tn.jkFallFor, 0).y
      g.quaternion.copy(cam.quaternion)
    } else {
      if (!frozen.current) frozen.current = { p: g.position.clone(), q: g.quaternion.clone(), s: g.scale.x }
      g.position.copy(frozen.current.p)
      g.quaternion.copy(frozen.current.q)
      fit = frozen.current.s
    }

    // NO SHAKE ON THE WORDS. Each hit used to kick the whole lockup, on the reasoning that a word which
    // arrives and disturbs nothing does not feel like it hit anything - but shaking the FRAME to sell a
    // word arriving shakes everything the reader is trying to read, including the three words already
    // placed. The impact stays in the words themselves: the attack is fast, they overshoot and settle, and
    // the card squashes when it lands. That is the part that reads. The only shake left in the beat is the
    // chip hitting the felt at the bottom of the fall, which is the one thing actually hitting something.

    // THE EXIT. Two speeds on purpose: the chip's rise lifts the lockup gently, and the moment the chip
    // starts to FALL the lockup is thrown upward, accelerating, so the two motions trade places in the
    // frame. A constant-speed exit reads as a slide; this reads as the chip taking its place.
    // NOTHING of its own. It had a 0.1 lift through the chip's rise, as a nudge from the coin going past,
    // and that was a mistake for a reason worth keeping: motion is RELATIVE, and this lockup is the only
    // thing in a frame whose background is a featureless dark wall. Eighteen pixels of the title drifting
    // up over nearly two seconds does not read as the title drifting up, it reads as the CAMERA SINKING -
    // which then steals the one move the whole beat is built around. It is dead still now until the lens
    // actually falls away from it.
    // NO FADE ON THE WAY OUT. It used to dissolve over the drop, and a fade is the one exit that says the
    // title was never really there: it admits the thing is a graphic being switched off. It leaves by being
    // LEFT BEHIND instead, at full ink the whole way. The maths works out with room to spare - the camera
    // falls 8.14 and the lockup is 17 from the lens, so it swings 2.16 half-frames, against the 1.5 it needs
    // to carry its lowest line past the top of the frame, and it is clear at about 83 percent of the drop.

    g.scale.setScalar(fit)

    // THE FLOURISH. One path, one card per phase offset, so they arrive as a moving line. Each card is
    // turned along the ribbon's own tangent and then ROLLED about it, which is what a real card spring
    // does and what makes the stream flicker rather than slide.
    {
      const P = scratch.p, Q = scratch.q
      for (const k of b.snake) {
        const u = (t - SNAKE.at) / SNAKE.dur - k.i * SNAKE.gap
        if (u <= 0 || u >= 1) {
          k.mesh.visible = false
          continue
        }
        k.mesh.visible = true
        snakePath(u, P)
        snakePath(Math.min(1, u + 0.02), Q)
        k.mesh.position.copy(P)
        k.mesh.quaternion.setFromUnitVectors(AXIS_Y, scratch.tan.subVectors(Q, P).normalize())
        // rolled, but not so fast that many of them are edge-on at once: an edge-on card is a hairline, and
        // several at a time leave holes in the middle of the ribbon that read as missing cards rather than as
        // cards turning
        k.mesh.rotateY(u * 8 + k.i * 0.42)
        // faded at both ends of its own run, so no card pops on or off at the edge of the frame
        k.mat.opacity = Math.min(1, u * 7, (1 - u) * 7) * 0.95
      }
    }

    // THE CARD: thrown in from off frame, flipping, and it keeps flipping while it travels rather than
    // spinning at a constant rate. The rate decays, which is what a real thrown card does and what makes
    // the landing read as the end of a throw instead of the end of a tween.
    //
    // NO SCALE OF ITS OWN. It used to be blown up 1.35x at the far end of the throw on top of the 1.67x
    // perspective was already giving it, and 2.25x of growth over three quarters of a second does not read
    // as a card coming toward you, it reads as a zoom. The travel through z is small now for the same
    // reason: the size change left is only the perspective the throw actually earns.
    {
      const u = smooth((t - B.cardIn) / Math.max(0.05, B.cardLand - B.cardIn))
      const k = 1 - u
      const cs = tn.jkCardW / D.jkCardW
      b.card.position.set(
        tn.jkCardX + k * 5.4,
        tn.jkCardY - k * 3.1 + Math.sin(u * Math.PI) * 0.55,
        k * 0.5,
      )
      b.card.rotation.set(k * k * 1.1, -Math.pow(k, 1.5) * 9.2, tn.jkCardTilt + k * k * 2.6)
      b.card.scale.set(cs, cs, 1)
      b.cardMat.opacity = cl(u * 4)
      b.backMat.opacity = b.cardMat.opacity
    }

    /**
     * THE LOCKUP: four ransom words, placed and then CENTRED ON THEIR OWN BOUNDS.
     *
     * Every word is positioned by its own keys and scaled by its own cap height, and the group is then
     * offset so the union of the card and the type sits on the frame's centre line. That is what stops a
     * font change or a size drag walking the whole line off to one side, which is exactly what kept
     * happening while every element was placed against the frame by hand.
     */
    /**
     * Z_BASE lifts the whole lockup clear of the card, and the parallax it would cause is cancelled here.
     *
     * The scraps sit on a depth ladder wide enough that none of them intersect (see LADDER), which puts the
     * back of it well behind the card unless the whole thing is floated forward first. Dividing the
     * placement and the scale by that shift keeps the projection exactly where it was, so the lift is
     * invisible and does only its one job. The per-scrap depth is deliberately NOT compensated: the far
     * scraps coming back smaller is most of the size variety in a word.
     */
    const place = (name: string, w2: RansomWord, cx0: number, cy0: number, rot: number, sk0: number, at: () => number) => {
      const zb = Z_BASE
      const pz = (DIST - zb) / DIST
      const cx = cx0 * pz
      const cy = cy0 * pz
      const sk = sk0 * pz
      const co = Math.cos(rot)
      const si = Math.sin(rot)
      // 0 or 1 means SMOOTH: no quantiser at all, the eased curve straight through
      const steps = tn.jkSteps >= 2 ? Math.round(tn.jkSteps) : 0
      // shot on the chart by default; jkShot 0 brings back the old eased curve
      const shot = tn.jkShot >= 0.5
      const E = w2.entry
      for (let i = 0; i < w2.letters.length; i++) {
        const L = w2.letters[i]
        // its own override, if it has ever been given one: a letter with no entry costs a lookup and
        // nothing else, and still follows its word
        const T = getLetter(`${name}:${i}`)
        const lx = (L.x + T.dx) * sk
        const ly = (L.dy + T.dy) * sk
        const hx = cx + (lx * co - ly * si)
        const hy = cy + (lx * si + ly * co)
        /**
         * A word is ONE SCRAP.
         *
         * Its letters used to lag each other by up to a quarter of a second and
         * sit up to a unit apart on the way in, which is fifteen pieces being
         * tweened separately however stepped the clock is. On the chart they
         * share a pose and a line, and the only thing separating them is the
         * hand error below.
         */
        const s2 = at() - (shot ? 0 : L.lag * tn.jkSpeed)

        /**
         * ONE STEPPED CLOCK FOR THE WHOLE WORD, so every letter in it moves on the same exposure.
         *
         * The clock is the WORD's, not the letter's: an animator moves all the pieces and then shoots one
         * frame, so a word whose letters each stepped on their own clock was never stop motion, it was
         * fifteen things being tweened at fifteen different times.
         */
        const A = shot ? chartArrive(s2, tn.jkStep, tn.smFps) : arrive(s2, E.dur * tn.jkSpeed, steps)
        // unclamped in chart mode, so the anticipation and the overshoot survive
        const p = shot ? A.p : Math.min(1, Math.max(0, A.p))
        const u = 1 - p
        // the animator's hand: re-rolled once per EXPOSURE and decaying as it settles. Small on purpose -
        // it used to be five times this, and a pose that lands somewhere random every time is not a hand,
        // it is noise, and noise on top of a stepped move is what a stuttering page looks like.
        const n = A.n
        const shake = Math.max(0, Math.min(1, u)) * tn.jkHand
        const jx = (rnd(i * 7 + 1, n, 900) - 0.5) * shake
        const jy = (rnd(i * 7 + 2, n, 901) - 0.5) * shake

        // the word's own line to its destination, and this letter's slight offset along it
        const sx = hx + E.fx + (shot ? 0 : L.ox)
        const sy = hy + E.fy + (shot ? 0 : L.oy)
        const dx = hx - sx
        const dy2 = hy - sy
        const len = Math.hypot(dx, dy2) || 1
        const ccx = (sx + hx) / 2 - (dy2 / len) * E.bow
        const ccy = (sy + hy) / 2 + (dx / len) * E.bow
        const q = 1 - p
        const bx = q * q * sx + 2 * q * p * ccx + p * p * hx
        const by = q * q * sy + 2 * q * p * ccy + p * p * hy

        L.mesh.position.set(bx + jx, by + jy, zb + L.dz * sk)
        // the word's roll, the scrap's own, its override, and the turn the word is still unwinding
        L.mesh.rotation.set(L.rx, L.ry, rot + L.rot + T.r + E.spin * u)
        L.mesh.scale.setScalar(sk * T.s)
        L.mat.opacity = s2 > 0 ? 1 : 0
      }
    }

    // JACK is pasted ON the card, so it is placed in the CARD's frame: its offset is rotated by the card's
    // tilt and it carries the card's scale, and it can be dragged around the card without leaving it.
    {
      const s2 = t - B.jack
      const cs = tn.jkCardW / D.jkCardW
      const rot = tn.jkCardTilt + tn.jkJackR
      const co = Math.cos(tn.jkCardTilt)
      const si = Math.sin(tn.jkCardTilt)
      const ox = tn.jkJackX * cs
      const oy = tn.jkJackY * cs
      place('JACK', b.jack, tn.jkCardX + (ox * co - oy * si), tn.jkCardY + (ox * si + oy * co), rot, tn.jkJackS * b.jackFit * cs, () => s2)
    }

    // "of": both scraps on the word's line and the word's frames, offset only slightly from each other
    place('of', b.of, tn.jkOfX, tn.jkOfY, tn.jkOfR, tn.jkOfS, () => t - B.of)

    // ALL
    place('ALL', b.all, tn.jkAllX, tn.jkAllY, tn.jkAllR, tn.jkAllS, () => t - B.all)

    // TRADES arrives as TRADES: one line, one set of frames, its letters apart only by their slight offsets
    place('TRADES', b.trades, tn.jkTrX, tn.jkTrY, tn.jkTrR, tn.jkTrS, () => t - B.trades)

    // and the centring: measured off the bounds, but only when something ASKS for it
    if (takeRecentre()) {
      const cw2 = tn.jkCardW
      let lo = tn.jkCardX - cw2 / 2
      let hi = tn.jkCardX + cw2 / 2
      let bo = tn.jkCardY - (cw2 * 1.4) / 2
      let to = tn.jkCardY + (cw2 * 1.4) / 2
      const span = (w2: RansomWord, x: number, y: number, sk: number) => {
        lo = Math.min(lo, x - (w2.width * sk) / 2)
        hi = Math.max(hi, x + (w2.width * sk) / 2)
        bo = Math.min(bo, y - sk * 0.8)
        to = Math.max(to, y + sk * 0.8)
      }
      span(b.of, tn.jkOfX, tn.jkOfY, tn.jkOfS)
      span(b.all, tn.jkAllX, tn.jkAllY, tn.jkAllS)
      span(b.trades, tn.jkTrX, tn.jkTrY, tn.jkTrS)
      centre.current = [-(lo + hi) / 2, -(bo + to) / 2]
    }
    b.lock.position.set(centre.current[0] + tn.jkLockX, centre.current[1] + tn.jkLockY, 0)
  })

  return <group ref={group} renderOrder={20} />
}

const scratch = { fwd: new THREE.Vector3(), p: new THREE.Vector3(), q: new THREE.Vector3(), tan: new THREE.Vector3() }
const AXIS_Y = new THREE.Vector3(0, 1, 0)
/** a full-screen quad has no business in the position buffer at all */
const DECAL = { compNoPosition: true }

/**
 * Speed lines, for the fall.
 *
 * The camera doing the moving is what makes the fall a fall, but a dark room is a poor thing to read
 * motion against: the wall has almost no contrast to streak, so the strongest cue in the shot was doing
 * the least work. These are the comic's answer and they cost one plane - ink dashes racing up the frame,
 * DENSE AT THE EDGES AND CLEAR THROUGH THE MIDDLE, so the coin stays perfectly readable while everything
 * around it tears past. Screen space rather than parallax on purpose: parallax gives you the geometry of
 * the move, speed lines give you how fast it feels, and the two are not the same thing.
 *
 * Alpha and scroll are both driven by the fall's own SPEED, not its progress, so the lines build as the
 * drop accelerates and are gone on the frame of the impact rather than lingering over the landing.
 */
/**
 * Speed lines, driven by the CAMERA'S OWN VERTICAL SPEED, in whichever direction it is going.
 *
 * Differencing camLift gives the SIGNED speed, so the lines know which way the lens is going without being
 * told, and their length and opacity come off how fast it is going rather than off a progress fraction.
 *
 * They are drawn on the DESCENT ONLY, deliberately, even though the climb is the half with no other cue -
 * the title's sink is all the climb has, and how far the title can slide is capped by the frame however
 * far the lens actually travels. Streaks going up read as weather rather than as a lens rising, so the
 * trade was taken the other way. If the climb ever needs to read harder, jkLag is the knob.
 */
export function FallStreaks({
  armed,
  clock0,
  flickAt,
  dropAt,
}: {
  armed: boolean
  clock0: MutableRefObject<number>
  flickAt: number
  dropAt: number
}) {
  const { camera } = useThree()
  const mesh = useRef<THREE.Mesh>(null)
  const t0 = useRef(-1)
  const built = useMemo(() => {
    if (typeof document === 'undefined') return null
    const S = 512
    const c = document.createElement('canvas')
    c.width = S
    c.height = S
    const x = c.getContext('2d')!
    x.clearRect(0, 0, S, S)
    // dashes, not continuous lines: a full-height line looks identical however far it is scrolled, so it
    // would read as a static screen of stripes no matter how fast the offset moved
    let seed = 1
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    for (let i = 0; i < 190; i++) {
      const px = rnd() * S
      // clear through the middle third: the subject of the shot is dead centre and it has to stay legible
      const edge = Math.abs(px / S - 0.5) * 2
      if (edge < 0.34 && rnd() > edge * 1.4) continue
      const len = S * (0.06 + rnd() * 0.3)
      const py = rnd() * S
      x.globalAlpha = (0.1 + rnd() * 0.55) * Math.min(1, edge * 1.5)
      x.strokeStyle = '#e9dfc6'
      x.lineWidth = 0.8 + rnd() * 2.2
      x.beginPath()
      x.moveTo(px, py)
      x.lineTo(px, py + len)
      x.stroke()
      // wrapped, so a dash running off the bottom comes back on at the top and the tile has no seam
      if (py + len > S) {
        x.beginPath()
        x.moveTo(px, py - S)
        x.lineTo(px, py + len - S)
        x.stroke()
      }
    }
    const tex = new THREE.CanvasTexture(c)
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.needsUpdate = true
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, depthTest: false, toneMapped: false, fog: false })
    return { tex, mat }
  }, [])

  useFrame((state) => {
    const m = mesh.current
    if (!m || !built) return
    if (!armed || clock0.current <= 0) {
      m.visible = false
      return
    }
    if (t0.current < 0) t0.current = clock0.current
    // the shared clock, so the streaks freeze and replay with the rest of the beat
    const ft = beatTime(state.clock.elapsedTime - t0.current)
    // the lens's own vertical speed, by differencing its arc. Signed: + climbing, - falling.
    const h = 0.02
    const fallFor = getTune().jkFallFor
    const v =
      (camLift(ft + h, flickAt, dropAt, fallFor, 0).y - camLift(ft - h, flickAt, dropAt, fallFor, 0).y) / (2 * h)
    // normalised against the fall, which is the fastest the lens ever moves
    const speed = Math.min(1.3, Math.abs(v) / 75)
    // DOWN ONLY. They ran on the climb too for a while, as the one piece of evidence that the lens was
    // moving at all up there, and it reads as air resisting a fall rather than as a lens rising - on the
    // way up it just looked like weather. The climb is back to being carried by the title's sink (jkLag).
    m.visible = v < 0 && speed > 0.02
    if (!m.visible) return
    const cam = camera as THREE.PerspectiveCamera
    const D = 2.4
    const fwd = scratch.fwd
    cam.getWorldDirection(fwd)
    m.position.copy(cam.position).addScaledVector(fwd, D)
    m.quaternion.copy(cam.quaternion)
    const halfH = D * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)
    m.scale.set(halfH * cam.aspect * 2.1, halfH * 2.1, 1)
    built.tex.repeat.set(2.4 * cam.aspect, 1.7)
    // the world streams the opposite way to the lens, and the sign of v carries that on its own
    built.tex.offset.y += 0.0012 * v
    built.mat.opacity = Math.min(0.85, speed * 1.15)
  })

  if (!built) return null
  return (
    <mesh ref={mesh} renderOrder={30} visible={false} material={built.mat} userData={DECAL}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  )
}
