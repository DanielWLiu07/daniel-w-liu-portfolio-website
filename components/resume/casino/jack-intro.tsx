'use client'

import { cardArtUrl } from './card-art-url'
import { loadCardArtwork } from './card-art-textures'

/**
 * Jack of Hearts / JACK OF ALL TRADES: a layered collage before the chip throw.
 * The royal-flush Jack artwork anchors the left with JACK pasted across it;
 * "of" sits high beside it, ALL fills the right and TRADES overlaps below. Stop-motion
 * entries come from outside the viewport and retain their overshoot/corrections.
 * Paper keeps real depth ordering, with perspective-compensated type sizes.
 */
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame, useThree, type RootState } from '@react-three/fiber'
import * as THREE from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { modalTransform, type ModalGesture } from 'blender-to-threejs'
import { cardShape, planarUV } from './playing-cards'
import { loadRansomFaces, ransomPick, ransomScrap, rnd } from './ransom'
import { beatHold, beatTime, camLift, getLetter, getTune, JACK_FONTS, popUndo, pushUndo, setLetter, setTune, takeRecentre, TUNE_DEFAULTS, TUNE_RANGES, undoTune, useTune, type Tune } from './tune'
import { isJackEditor, subscribeJackClock } from './jack-editor-clock'
import { JACK_PARTS, jackSceneEditor, registerJackPart } from './jack-scene-editor'
import { PaperFlight } from './paper-flight'
import { loadPaperRecording } from './paper-recording'
import { ScreenExit } from './screen-exit'
import { PORTRAIT_JACK_CARRIERS } from './responsive-layout'
import { jackStraightAt, jackRedBackAt, jackSeedAt, jackBlastAt, JACK_SEED_LEAD } from './jack-composition'
import { JACK_FAN, JACK_CARRIERS, JACK_GRID, JACK_GRID_CENTRES, jackTileAt, jackEchoAt, jackSpiralAt, jackKeeperAt, jackWallRevealAt, JACK_HEADLINE_SPAN, includeJackRect, jackPaperProjection, jackDealAt, jackFraming } from './jack-composition'

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
const SNAKE = { at: 0.10, dur: 0.8, gap: 0, count: JACK_GRID.columns * JACK_GRID.rows, w: JACK_GRID.width }

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
 * Transparent lettering is a DECAL to the compositor; solid card shapes are not.
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

/** Rounded geometry is the actual paper silhouette, safe for position styling.
 * Cards keep transparent materials for ordered collage rendering, so explicitly
 * opt them in. Front and reverse meshes both need this during a flip.
 */
function asCard<T extends THREE.Object3D>(o: T): T {
  o.userData.compForcePosition = true
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
  const out: { mesh: THREE.Mesh; mat: MeshBasicNodeMaterial; x: number; dy: number; rot: number; rx: number; ry: number; dz: number; k: number; ox: number; oy: number; lag: number }[] = []
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
    // One clean serif skeleton anchors the payoff word; its original cutouts,
    // ink, weight and slant still vary. JACK retains its existing mixed art.
    const authoredFace = seed === 7 && w === 3 && forced === 0 ? 10 : faceI
    // The connector gets a small red label so it remains readable over the
    // patterned court illustrations; the surrounding scraps retain their mix.
    const authoredStock = seed === 7 && w === 1 ? 3 : stockI
    const L = ransomScrap(chars[i], seed, w, i, forced, authoredFace, authoredStock)
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
    const mat = new MeshBasicNodeMaterial({ map: tex, transparent: true, opacity: 0, alphaTest: 0.4, depthWrite: true, toneMapped: false, fog: false })
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
    // Collage is assembled edge-over-edge, not a row of isolated labels.
    // Small irregular overlaps join the silhouettes without hiding the ink.
    const adv = hw * (0.87 + r(2) * 0.06)
    out.push({
      mesh,
      mat,
      // OFF THE LINE. A hand-pasted word does not sit on a baseline: the hop, the uneven advance and the
      // roll are all one setting, because they are one idea - that nobody measured any of this.
      x: cursor + hw / 2 + (r(9) - 0.5) * scatter * 0.5,
      dy: (r(3) - 0.5) * scatter * 2 + (w === 3 ? Math.sin(i / Math.max(1, chars.length - 1) * Math.PI) * 0.18 : 0),
      rot: (r(4) - 0.5) * scatter * 1.1,
      // IN SPACE, not on a plane: each scrap is turned out of the picture plane on both axes and sits at
      // its own depth. The lockup is billboarded, so without this every letter is exactly parallel to the
      // lens and the whole thing reads as a decal printed on the frame. A perspective camera does the rest
      // - the far scraps come back smaller and the tilted ones foreshorten, on their own.
      // back down from 1.0 / 1.6: the wider turn went with the thickness and read as the same overdone
      // thing. This is enough to foreshorten a scrap and to let the camera's fall move them against each
      // other, without any of them looking like it is standing on edge.
      rx: (r(5) - 0.5) * 0.16,
      ry: (r(6) - 0.5) * 0.16,
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
  const mat = new MeshBasicNodeMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false })
  const mesh = asDecal(new THREE.Mesh(new THREE.PlaneGeometry(h * aspect, h), mat))
  return { mesh, mat }
}

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t))
  return x * x * x * (x * (x * 6 - 15) + 10)
}
const cl = (x: number) => Math.min(1, Math.max(0, x))


export default function JackIntro({
  armed,
  clock0,
  flickAt,
  riseFor,
  holdFor,
  onReady,
}: {
  /** Signals actual font/texture construction, not just component mount. */
  onReady?: (ready: boolean) => void
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
  const portraitRecording = useThree(state => state.size.width / Math.max(1, state.size.height) < .9)
  const group = useRef<THREE.Group>(null)
  /** the live scale factor, so a screen drag can be converted into the lockup's own units */
  const fitRef = useRef(1)
  const t0 = useRef(-1)
  const cardImpact = useRef({ at: Infinity, x: 0, y: 0, speed: 0 })
  const paperExit = useMemo(() => new ScreenExit(), [])
  const portraitFraming = useRef<boolean | null>(null)
  const retiredPaper = useRef({ at: Infinity, last: -1 })
  /** what G / S / R will act on: set by clicking or dragging something, cleared by clicking empty space */
  const sel = useRef<string | null>(null)
  const workspaceSelection = useRef<string | null>('card')
  /** the world transform the lockup is let go at, so the falling camera leaves it behind */
  const frozen = useRef<null | { p: THREE.Vector3; q: THREE.Quaternion; s: number }>(null)
  /** the latched centring offset: recomputed only when something asks for it, never every frame */
  const centre = useRef<[number, number]>([0, 0])
  const needsFraming = useRef(true)
  const framing = useRef({ halfWidth: 2.7, halfHeight: 1.65 })
  const built = useRef<null | {
    card: THREE.Mesh
    cardMat: MeshBasicNodeMaterial
    backMat: MeshBasicNodeMaterial
    fan: { mesh: THREE.Mesh; face: MeshBasicNodeMaterial; back: MeshBasicNodeMaterial }[]
    textures: THREE.Texture[]
    flight: PaperFlight
    bodies: THREE.Mesh[][]
    snake: { mesh: THREE.Mesh; mat: MeshBasicNodeMaterial; faceMat: MeshBasicNodeMaterial; mixedTex: THREE.Texture; jackTex: THREE.Texture; i: number }[]
    /** what each grabbable mesh edits: its two position keys and its size key */
    pick: { mesh: THREE.Mesh; name: string; i: number; x: keyof Tune; y: keyof Tune; r: keyof Tune; s: keyof Tune }[]
    /** the card and the words, offset as one so the line can be centred on its own bounds */
    lock: THREE.Group
    jack: RansomWord
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
    const unregister: (() => void)[] = []
    const mine = ++version.current
    // waits on document.fonts so every word is MEASURED against the face it will be drawn in; measuring
    // early lays the lockup out in fallback metrics and it never corrects itself
    Promise.all([
      loadRansomFaces().then(() => document.fonts.ready),
      Promise.all([...['hearts', ...JACK_FAN.map(card => card.suit)].map(suit => cardArtUrl(`J-${suit}`)), cardArtUrl('casino-back'), ...['10', 'Q', 'K', 'A'].flatMap(rank => ['hearts', 'spades'].map(suit => cardArtUrl(`${rank}-${suit}`)))].map(url => loadCardArtwork(url))),
      loadPaperRecording(portraitRecording),
    ]).then(([, maps, recording]) => {
      if (dead || mine !== version.current || !group.current) return
      const tex = maps[0]
      const g = group.current
      const cw = D.jkCardW
      // Same full-face artwork as FlightRoyalFlush; preserve its 2:3 ratio.
      const ch = cw * 1.5
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 4
      const cardMat = new MeshBasicNodeMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false })
      const shape = planarUV(new THREE.ShapeGeometry(cardShape(cw, ch, cw * 0.075), 12))
      const card = asCard(new THREE.Mesh(shape, cardMat))
      card.renderOrder = 20
      // A BACK, because the throw flips it. A single plane faces +z, so every frame the card is turned away
      // it would simply not be drawn and the flip would read as the card blinking rather than turning. The
      // back is a child so it inherits the squash on landing, and it is the deck's own back, so a card
      // thrown in from off frame belongs to the hand already on the felt.
      const backTex = maps[4]
      backTex.colorSpace = THREE.SRGBColorSpace
      backTex.anisotropy = 4
      const backMat = new MeshBasicNodeMaterial({ map: backTex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false })
      const back = asCard(new THREE.Mesh(shape.clone(), backMat))
      back.rotation.y = Math.PI
      back.position.z = -0.003
      back.renderOrder = 19
      card.add(back)
      const fan = JACK_FAN.map((layout, i) => {
        const map = maps[i + 1]
        const face = cardMat.clone(); face.map = map
        const mesh = asCard(new THREE.Mesh(shape, face))
        mesh.name = `Jack of ${layout.suit}`
        mesh.renderOrder = 16 + i
        const reverseMat = backMat.clone()
        const reverse = asCard(new THREE.Mesh(shape, reverseMat))
        reverse.rotation.y = Math.PI; reverse.position.z = -0.003
        reverse.renderOrder = 15 + i
        mesh.add(reverse); card.add(mesh)
        return { mesh, face, back: reverseMat }
      })

      // Physical two-sided tiles: alternating fronts/backs after each hinge opens.
      const sw = SNAKE.w
      const snakeGeo = planarUV(new THREE.ShapeGeometry(cardShape(sw, sw * 1.5, sw * 0.075), 8))
      // One card per cell: no duplicate followers stacking on the same spot.
      const slots = Array.from({ length: SNAKE.count }, (_, slot) => slot)
      const snake = slots.map(slot => {
        const i = slot % SNAKE.count
        const col = i % JACK_GRID.columns, row = Math.floor(i / JACK_GRID.columns)
        const faceUp = (col + row) % 2 === 0
        const keeper = JACK_GRID_CENTRES.findIndex(([c, r]) => c === col && r === row)
        const jackTex = maps[keeper >= 0 ? keeper : (col + row * 3) % 4]
        const mixedTex = maps[5 + (col * 3 + row * 5) % 8]
        const faceTex = mixedTex
        const mat = new MeshBasicNodeMaterial({ map: faceUp ? faceTex : backTex, transparent: true, opacity: 1, depthWrite: false, toneMapped: false, side: THREE.FrontSide, fog: false })
        const m = asCard(new THREE.Mesh(snakeGeo, mat))
        const reverseMat = mat.clone()
        reverseMat.map = faceUp ? backTex : faceTex
        const reverse = asCard(new THREE.Mesh(snakeGeo, reverseMat))
        reverse.rotation.y = Math.PI
        reverse.position.z = -.003
        m.add(reverse)
        m.renderOrder = 10
        m.visible = false
        return { mesh: m, mat, faceMat: faceUp ? mat : reverseMat, mixedTex, jackTex, i: slot }
      })

      // Four ransom words. Each is its own set of cut-outs, so the mix is per LETTER rather than per word,
      // which is the difference between a ransom note and four fonts in a row.
      const jack = ransomWord('JACK', seed, 0, fj, initial, vary, scatter)
      for (const L of jack.letters) L.mesh.renderOrder = 21
      const of = ransomWord('of', seed, 1, fo, initial, vary, scatter)
      const all = ransomWord('ALL', seed, 2, fa, initial, vary, scatter)
      const trades = ransomWord('TRADES', seed, 3, ft, initial, vary, scatter)
      const words = [jack, of, all, trades]
      assignDepths(words, seed)

      // one inner group for the card and the type, so the whole line can be shifted by its own centring
      // without disturbing the ribbon, which is a full-frame flourish and belongs to the frame
      const lock = new THREE.Group()
      // Match the outer group order so mesh orders, not nested group defaults,
      // place the persistent wall behind the foreground cards and lettering.
      lock.renderOrder = 20
      const wordGroups = words.map(word => {
        const parent = new THREE.Group()
        parent.renderOrder = 20
        parent.add(...word.letters.map(letter => letter.mesh))
        return parent
      })
      lock.add(card, ...fan.map(piece => piece.mesh), ...wordGroups)
      g.add(lock, ...snake.map((k) => k.mesh))
      if (isJackEditor()) {
        const selected = workspaceSelection.current
        unregister.push(jackSceneEditor.add('jack-title', lock, { name: 'Jack of All Trades' }))
        const perPixel = () => (2 * DIST * Math.tan(THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov) / 2)) / gl.domElement.clientHeight / (fitRef.current || 1)
        JACK_PARTS.forEach((part, index) => unregister.push(registerJackPart(part, index === 0 ? card : wordGroups[index - 1], perPixel)))
        jackSceneEditor.select(selected ?? 'card')
      }
      const pick = [
        { mesh: card, name: 'card', i: -1, x: 'jkCardX' as const, y: 'jkCardY' as const, r: 'jkCardTilt' as const, s: 'jkCardW' as const },
        ...fan.map(({ mesh }) => ({ mesh, name: 'card', i: -1, x: 'jkCardX' as const, y: 'jkCardY' as const, r: 'jkCardTilt' as const, s: 'jkCardW' as const })),
        // every letter grabs its whole word: a word is one thing to move, however many scraps it is made of
        ...jack.letters.map((L, li) => ({ mesh: L.mesh, name: 'JACK', i: li, x: 'jkJackX' as const, y: 'jkJackY' as const, r: 'jkJackR' as const, s: 'jkJackS' as const })),
        ...of.letters.map((L, li) => ({ mesh: L.mesh, name: 'of', i: li, x: 'jkOfX' as const, y: 'jkOfY' as const, r: 'jkOfR' as const, s: 'jkOfS' as const })),
        ...all.letters.map((L, li) => ({ mesh: L.mesh, name: 'ALL', i: li, x: 'jkAllX' as const, y: 'jkAllY' as const, r: 'jkAllR' as const, s: 'jkAllS' as const })),
        ...trades.letters.map((L, li) => ({ mesh: L.mesh, name: 'TRADES', i: li, x: 'jkTrX' as const, y: 'jkTrY' as const, r: 'jkTrR' as const, s: 'jkTrS' as const })),
      ]
      const bodies = [
        ...[card, ...fan.map(piece => piece.mesh)].map((mesh, i) => [mesh, ...words[i].letters.map(letter => letter.mesh)]),
        ...snake.map(piece => [piece.mesh]),
      ]
      const flight = new PaperFlight(recording)
      built.current = { card, cardMat, backMat, fan, snake, pick, lock, jack, of, all, trades, textures: maps, flight, bodies }
      needsFraming.current = true
      onReady?.(true)
    }).catch(error => console.error('Jack intro artwork failed to load', error))
    return () => {
      dead = true
      workspaceSelection.current = jackSceneEditor.selectedId() ?? workspaceSelection.current
      unregister.reverse().forEach(remove => remove())
      const b = built.current
      b?.flight.dispose()
      if (b && group.current) {
        group.current.remove(b.lock)
        const all2: THREE.Mesh[] = []
        for (const tile of b.snake) tile.mesh.traverse(object => { if (object instanceof THREE.Mesh) all2.push(object) })
        b.lock.traverse(object => { if (object instanceof THREE.Mesh) all2.push(object) })
        const shared = new Set(b.textures)
        const textures = new Set(all2.map(o => (o.material as MeshBasicNodeMaterial).map))
        // Only the letter canvases belong to this mount. Card artwork is also
        // used by the flying hand and dealer, and survives replay/remounts.
        textures.forEach(texture => { if (texture && !shared.has(texture)) texture.dispose() })
        new Set(all2.map(o => o.geometry)).forEach(geometry => geometry.dispose())
        new Set(all2.map(o => o.material as THREE.Material)).forEach(material => material.dispose())
        group.current.remove(...b.snake.map(piece => piece.mesh))
      }
      built.current = null
      onReady?.(false)
    }
  }, [D, fj, fo, fa, ft, seed, initial, vary, scatter, onReady, portraitRecording])

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
    if (isJackEditor()) return
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
      window.dispatchEvent(new CustomEvent('casino:jack-select', { detail: g2.name }))
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
    if (isJackEditor()) return
    if (beatHold() === null) return
    const el = gl.domElement
    let start: { x: number; y: number; r: number; s: number } | null = null
    let keys: { x: keyof Tune; y: keyof Tune; r: keyof Tune; s: keyof Tune } | null = null
    const clampKey = (k: keyof Tune, v: number) => {
      const [mn, mx] = TUNE_RANGES[k]
      return Math.max(mn, Math.min(mx, Math.round(v * 1000) / 1000))
    }
    if (new URLSearchParams(window.location.search).has('flight')) return
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

  useEffect(() => {
    if (!isJackEditor()) return
    const canvas = gl.domElement
    canvas.tabIndex = 0
    // One keyboard owner; legacy drag/modal effects above are disabled here.
    const disconnect = jackSceneEditor.connect(canvas, { axes: ['x', 'y'], profile: 'basic' })
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
    const pick = (event: PointerEvent) => {
      if (event.button !== 0 || jackSceneEditor.gesture()) return
      const rect = canvas.getBoundingClientRect()
      ndc.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2)
      ray.setFromCamera(ndc, camera)
      const hit = ray.intersectObjects(built.current?.pick.map(part => part.mesh) ?? [], false)[0]
      jackSceneEditor.pick(hit?.object ?? null)
      canvas.focus()
      event.stopPropagation()
    }
    const stopClock = subscribeJackClock(() => {
      if (jackSceneEditor.gesture()) {
        const selected = jackSceneEditor.selectedId()
        jackSceneEditor.select(null); jackSceneEditor.select(selected)
      }
    })
    const undo = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable=true]')) return
      event.preventDefault(); undoTune()
    }
    canvas.addEventListener('pointerdown', pick, true)
    window.addEventListener('keydown', undo)
    return () => { stopClock(); disconnect(); canvas.removeEventListener('pointerdown', pick, true); window.removeEventListener('keydown', undo) }
  }, [gl, camera])

  const animate = (state: RootState, dt: number, poseTime?: number): void => {
    const g = group.current
    const b = built.current
    if (!g || !b) return
    if (!armed || clock0.current < 0) {
      g.visible = false
      return
    }
    if (t0.current < 0) t0.current = clock0.current
    const t = poseTime ?? beatTime(state.clock.elapsedTime - t0.current)
    // Speed the complete card choreography together, preserving its easing,
    // overlaps and word handoffs without speeding up the camera/table exit.
    const cardTime = t * 1.3 - JACK_SEED_LEAD
    /**
     * ONE quantiser, and this is why it reads as an animation rather than as a stuck page.
     *
     * The letters used to run on a clock floored to a frame rate AND a travel quantised into poses. Two
     * grids that do not divide into each other beat: a pose came out one frame long, the next two, the
     * next one. Uneven holds are the actual signature of a dropped frame - a deliberate cadence is the
     * thing an eye reads as intent - so the frame rate grid is gone and the poses alone set the rhythm,
     * every one of them held exactly as long as the last.
     */
    const authoredTune = getTune()
    const portrait = state.size.width / Math.max(1, state.size.height) < .9
    const carriers = portrait ? PORTRAIT_JACK_CARRIERS : JACK_CARRIERS
    // A compact two-by-two collage on portrait screens. Keep the same four
    // deals/flips and preserve editor offsets relative to their desktop defaults.
    const tn = portrait ? { ...authoredTune,
      jkCardX: authoredTune.jkCardX - D.jkCardX - .92,
      jkCardY: authoredTune.jkCardY - D.jkCardY + 1.2,
      jkOfX: authoredTune.jkOfX - D.jkOfX + .92,
      jkOfY: authoredTune.jkOfY - D.jkOfY + 1.25,
      jkAllX: authoredTune.jkAllX - D.jkAllX - .92,
      jkAllY: authoredTune.jkAllY - D.jkAllY - 1.18,
      jkTrX: authoredTune.jkTrX - D.jkTrX + .92,
      jkTrY: authoredTune.jkTrY - D.jkTrY - 1.25,
      jkJackS: authoredTune.jkJackS * .8,
      jkOfS: authoredTune.jkOfS * .82,
      jkAllS: authoredTune.jkAllS * .8,
      jkTrS: authoredTune.jkTrS * .58,
    } : authoredTune
    if (portraitFraming.current !== portrait) {
      portraitFraming.current = portrait
      needsFraming.current = true
    }
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
    if (t < retiredPaper.current.last || t <= flickAt) retiredPaper.current.at = Infinity
    retiredPaper.current.last = t
    g.visible = t >= 0 && t < retiredPaper.current.at
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
    // Frame the actual tilted paper silhouettes, including JACK's overhang.
    // Only re-centre when requested: ordinary editor moves must not shift peers.
    const requestedFraming = takeRecentre()
    if (needsFraming.current || requestedFraming) {
      needsFraming.current = false
      const bounds = { left: Infinity, right: -Infinity, bottom: Infinity, top: -Infinity }
      const textBounds = { left: Infinity, right: -Infinity, bottom: Infinity, top: -Infinity }
      const span = (word: RansomWord, x: number, y: number, scale: number, roll: number) => {
        const wi = word === b.jack ? 0 : word === b.of ? 1 : word === b.all ? 2 : 3
        const carrier = carriers[wi]
        includeJackRect(bounds, x + carrier.x, y + carrier.y, carrier.width, carrier.width * 1.5, carrier.roll)
        const c = Math.cos(roll), s = Math.sin(roll)
        word.letters.forEach((letter, i) => {
          const tweak = getLetter(`${word === b.jack ? 'JACK' : word === b.of ? 'of' : word === b.all ? 'ALL' : 'TRADES'}:${i}`)
          const lx = (letter.x + tweak.dx) * scale, ly = (letter.dy + tweak.dy) * scale
          const geo = letter.mesh.geometry
          if (!geo.boundingBox) geo.computeBoundingBox()
          const box = geo.boundingBox!
          includeJackRect(textBounds, x + lx * c - ly * s, y + lx * s + ly * c,
            (box.max.x - box.min.x) * scale * Math.abs(tweak.s),
            (box.max.y - box.min.y) * scale * Math.abs(tweak.s), roll + letter.rot + tweak.r)
        })
      }
      const cs = tn.jkCardW / D.jkCardW
      const co = Math.cos(tn.jkCardTilt), si = Math.sin(tn.jkCardTilt)
      const cardFit = Math.min(1, D.jkCardW * JACK_HEADLINE_SPAN / (b.jack.width * D.jkJackS))
      span(b.jack, tn.jkCardX + cs * (tn.jkJackX * co - tn.jkJackY * si),
        tn.jkCardY + cs * (tn.jkJackX * si + tn.jkJackY * co),
        tn.jkJackS * cardFit * cs, tn.jkCardTilt + tn.jkJackR)
      span(b.of, tn.jkOfX, tn.jkOfY, tn.jkOfS, tn.jkOfR)
      span(b.all, tn.jkAllX, tn.jkAllY, tn.jkAllS, tn.jkAllR)
      span(b.trades, tn.jkTrX, tn.jkTrY, tn.jkTrS, tn.jkTrR)
      bounds.left = Math.min(bounds.left, textBounds.left); bounds.right = Math.max(bounds.right, textBounds.right)
      bounds.bottom = Math.min(bounds.bottom, textBounds.bottom); bounds.top = Math.max(bounds.top, textBounds.top)
      const frame = jackFraming(bounds, textBounds)
      centre.current = [frame.x, frame.y]
      framing.current = { halfWidth: frame.halfWidth, halfHeight: frame.halfHeight }
    }

    const cam = camera as THREE.PerspectiveCamera
    const halfH = DIST * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)
    const halfW = halfH * cam.aspect
    // no cap at 1: the factor is relative to the frame half-height at DIST, so capping it would peg the
    // lockup to a size that only meant anything when DIST was 6
    let fit = Math.min(halfW / (framing.current.halfWidth + 0.28), halfH / (framing.current.halfHeight + 0.38)) * (1.85 / tn.jkFit)
    fitRef.current = fit
    if (t < letGo) {
      frozen.current = null
      const fwd = scratch.fwd
      cam.getWorldDirection(fwd)
      g.position.copy(cam.position).addScaledVector(fwd, DIST)
      // the same arc the camera is on, so the two can never drift apart
      // The camera follows the chip; cancel its climb on the paper so the
      // wall and words remain behind, as before the falling-paper change.
      g.position.y -= tn.jkLag * camLift(poseTime === undefined ? t : beatTime(state.clock.elapsedTime - t0.current), flickAt, dropAt, tn.jkFallFor, 0).y
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
    const impact = cardImpact.current
    // One authored punch beat; sampled frame velocity made dropped frames
    // change the launch energy. Its ballistic derivative is now deterministic.
    impact.at = flickAt + Math.min(Math.max(0, tn.jkDelay), riseFor * .5)
    impact.x = impact.y = 0
    impact.speed = Math.max(25, Math.min(100, 2 * (tn.jkFall + tn.jkApex)
      * (1 - (impact.at - flickAt) / riseFor) / riseFor))
    const prepareAt = impact.at - .40
    if (t < prepareAt) b.flight.dispose()

    const showFlight = () => {
      b.lock.position.set(centre.current[0] + tn.jkLockX, centre.current[1] + tn.jkLockY, 0)
      b.flight.sample(t - impact.at)
      g.updateWorldMatrix(true, true)
      g.userData.cardRenderLayer = 1
      for (const body of b.bodies) body[0].traverse(object => {
        if (object instanceof THREE.Mesh) {
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          for (const material of materials) material.depthWrite = true
        }
      })
    }
    // Once launched, the recorded card/word poses own the animation. Rebuilding
    // all the folds, flips, letter placement and fallback flight here only
    // computes transforms that sample() immediately overwrites.
    if (poseTime === undefined && b.flight.active && t >= impact.at) {
      showFlight()
      return
    }

    // Neighbor-to-neighbor checkerboard unfolding, then an accelerating fall.
    {
      for (const k of b.snake) {
        const index = k.i % SNAKE.count, generation = Math.floor(k.i / SNAKE.count)
        const col = index % JACK_GRID.columns, row = Math.floor(index / JACK_GRID.columns)
        const tile = jackTileAt(cardTime, col, row)
        const travelTime = cardTime
        const leader = jackEchoAt(travelTime, col, row)
        const echo = generation ? jackEchoAt(travelTime - .26, col, row) : leader
        const keeper = JACK_GRID_CENTRES.findIndex(([c, r]) => c === col && r === row)
        const cue = [B.jack, B.of, B.all, B.trades][keeper]
        const dance = keeper >= 0 ? jackKeeperAt(cardTime, keeper, cue) : null
        k.mesh.visible = tile.visible
        if (generation) k.mesh.visible = k.mesh.visible && keeper < 0 && (leader.active || cardTime >= 2.02) && Math.hypot(leader.x, leader.y) > 0
        const width = Math.max(JACK_GRID.width, halfW * 2 / (fit * 7.6), halfH * 2 / (fit * 8.5))
        const fold = (1 - Math.cos(tile.flip)) * 0.5
        const x = (col - JACK_GRID.originCol + echo.x + (dance?.x ?? 0)) * width - tile.dirX * width * fold
        const y = (JACK_GRID.originRow - row + echo.y) * width * 1.5 - tile.dirY * width * 1.5 * fold + (dance?.y ?? 0) * width
        const lift = 0
        // Open the seed edge-on at the exact screen centre. On exit the whole
        // field gently winds clockwise, while each card curls away in depth.
        const spiral = jackSpiralAt(cardTime, x, y)
        k.mesh.position.set(spiral.x, spiral.y, lift - tile.retreat + echo.lift * width + (dance?.lift ?? 0))
        k.mesh.rotation.set((tile.seed ? (1 - tile.open) * Math.PI / 2 : tile.dirY * tile.flip) + tile.tilt + echo.axisX * echo.angle + (dance?.tilt ?? 0), -tile.dirX * tile.flip + tile.yaw + echo.axisY * echo.angle + (dance?.yaw ?? 0), spiral.angle + (dance?.roll ?? 0))
        if (tile.seed && cardTime < .8) {
          const seed = jackSeedAt(cardTime, halfH / fit + width * 1.6)
          k.mesh.visible = seed.visible
          k.mesh.position.set(0, seed.y, 0)
          k.mesh.rotation.set(0, seed.yaw, seed.roll)
        }
        if (tile.open === 1 && cardTime >= .8) k.mesh.quaternion.set(echo.qx, echo.qy, echo.qz, echo.qw)
        const wallReveal = jackWallRevealAt(cardTime, col, row)
        k.mesh.position.z -= .22
        applyWallTurn(k.mesh.quaternion, wallReveal, (col + row) % 2 !== 0)
        // Rotate the existing two-sided card; the reverse already carries the
        // red artwork. Keep the foreground word carriers face-up and readable.
        const redTurn = jackRedBackAt(cardTime, col, row, Math.max(3.335, prepareAt * 1.3 - JACK_SEED_LEAD)) * Math.PI
        scratch.wallQuaternion.set(0, Math.sin(redTurn / 2), 0, Math.cos(redTurn / 2))
        k.mesh.quaternion.multiply(scratch.wallQuaternion)
        const fall = jackBlastAt(t - impact.at, index, k.mesh.position.x * fit - impact.x, k.mesh.position.y * fit - impact.y, impact.speed)
        if (fall.active) {
          k.mesh.position.x += fall.x / fit
          k.mesh.position.y += fall.y / fit
          fallEuler.set(fall.pitch, fall.yaw, fall.roll, 'ZYX')
          fallQuaternion.setFromEuler(fallEuler)
          k.mesh.quaternion.premultiply(fallQuaternion)
        }
        k.faceMat.map = wallReveal >= .5 ? k.jackTex : k.mixedTex
        k.mesh.renderOrder = 10 + Math.round((1 - tile.open) * 2) + (echo.active ? 2 : 0) - generation
        k.mesh.scale.setScalar(width / SNAKE.w * 0.975)
        k.mat.color.setScalar(1)
        k.mat.depthWrite = t > impact.at
        for (const child of k.mesh.children) {
          child.renderOrder = k.mesh.renderOrder
          if (child instanceof THREE.Mesh) {
            const material = child.material as MeshBasicNodeMaterial
            material.color.copy(k.mat.color)
            material.depthWrite = t > impact.at
          }
        }
        k.mat.opacity = 1
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
    // Carrier cards are placed with their words below, using the exact same
    // translation and turn so the artwork cannot lag behind the lettering.

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
    // The same motion model as ALWAYS BET ON / DANIEL W LIU: whole-word
    // placement, stagger, bowed approach, delayed turn and per-pose hand error.
    const place = (name: string, w2: RansomWord, cx0: number, cy0: number, rot: number, sk0: number, at: () => number, wi = 0) => {
      const zb = Z_BASE
      const pz = (DIST - zb) / DIST
      const cx = cx0 * pz
      const cy = cy0 * pz
      const sk = sk0 * pz
      const co = Math.cos(rot)
      const si = Math.sin(rot)
      // Compress the entire approach/overshoot/hand-correction chart together;
      // the words keep their individual character without a long trailing settle.
      const localTime = at() + cardTime - t
      const deal = jackDealAt(localTime * 1.35, wi)
      const carrier = carriers[wi]
      const rollU = Math.max(0, Math.min(1, (deal.progress - .35) / .65))
      const motion = { x: 0, y: 0, turn: -carrier.roll * (1 - rollU * rollU * (3 - 2 * rollU)), moving: deal.moving, pose: Math.floor(localTime * tn.smFps) }
      // Match travel relative to cap height across the two differently-sized layouts.
      const homes = w2.letters.map((L, i) => {
        const tweak = getLetter(`${name}:${i}`)
        const lx = (L.x + tweak.dx) * sk
        const ly = (L.dy + tweak.dy) * sk
        return { L, tweak, x: cx + lx * co - ly * si, y: cy + lx * si + ly * co }
      })
      const px = homes.reduce((sum, h) => sum + h.x, 0) / Math.max(1, homes.length)
      const py = homes.reduce((sum, h) => sum + h.y, 0) / Math.max(1, homes.length)
      // Keepers inherit the precise grid tile pose before peeling into the title.
      const gridWidth = Math.max(JACK_GRID.width, halfW * 2 / (fit * 7.6), halfH * 2 / (fit * 8.5))
      const [col, row] = JACK_GRID_CENTRES[wi]
      const homeCardX = (cx0 + carrier.x) * pz, homeCardY = (cy0 + carrier.y) * pz
      const sourceTime = Math.min(cardTime, cardTime - localTime)
      const sourceTravel = jackEchoAt(sourceTime, col, row)
      scratch.sourceQuaternion.set(sourceTravel.qx, sourceTravel.qy, sourceTravel.qz, sourceTravel.qw)
      applyWallTurn(scratch.sourceQuaternion, jackWallRevealAt(sourceTime, col, row), (col + row) % 2 !== 0)
      if ((col + row) % 2 !== 0) scratch.sourceQuaternion.multiply(scratch.reverseQuaternion)
      let sourceYaw = 2 * Math.atan2(scratch.sourceQuaternion.y, scratch.sourceQuaternion.w)
      sourceYaw = Math.atan2(Math.sin(sourceYaw), Math.cos(sourceYaw))
      // A back-to-face half-turn travels with the title, revealing its word
      // during arrival rather than finishing the flip before the move begins.
      deal.flip = (sourceYaw < 0 ? -1 : 1) * Math.PI * (1 - deal.progress)
      const source = jackSpiralAt(sourceTime, (col - JACK_GRID.originCol + sourceTravel.x) * gridWidth, (JACK_GRID.originRow - row + sourceTravel.y) * gridWidth * 1.5)
      const sourceX = (source.x - centre.current[0] - tn.jkLockX) * pz
      const sourceY = (source.y - centre.current[1] - tn.jkLockY) * pz
      motion.turn += source.angle * (1 - deal.progress)
      const c = Math.cos(motion.turn)
      const s = Math.sin(motion.turn)
      const route = jackStraightAt(deal.progress, wi, sourceX, sourceY, homeCardX, homeCardY)
      const entryX = route.x - (px + (homeCardX - px) * c - (homeCardY - py) * s)
      const entryY = route.y - (py + (homeCardX - px) * s + (homeCardY - py) * c)
      const piece = wi === 0 ? { mesh: b.card, face: b.cardMat, back: b.backMat } : b.fan[wi - 1]
      const dx = (cx0 + carrier.x) * pz - px, dy = (cy0 + carrier.y) * pz - py
      piece.mesh.visible = localTime >= 0
      piece.mesh.position.set((px + dx * c - dy * s + entryX) / pz, (py + dx * s + dy * c + entryY) / pz, sourceTravel.lift * gridWidth * (1 - deal.progress))
      piece.mesh.rotation.set(0, deal.flip, carrier.roll + motion.turn, 'ZYX')
      piece.mesh.scale.setScalar((gridWidth * .975 * (1 - deal.progress) + carrier.width * deal.progress) / D.jkCardW)
      piece.face.opacity = piece.back.opacity = localTime >= 0 ? 1 : 0
      piece.face.depthWrite = piece.back.depthWrite = t > impact.at
      homes.forEach(({ L, tweak, x, y }) => {
        // The ink is on the face: it foreshortens with the card and is hidden
        // on the reverse, then reveals naturally as that face turns toward us.
        const pivotX = (cx0 + carrier.x) * pz, pivotY = (cy0 + carrier.y) * pz
        const cc = Math.cos(carrier.roll), ss = Math.sin(carrier.roll)
        const carriedScale = piece.mesh.scale.x * D.jkCardW / carrier.width
        const localX = ((x - pivotX) * cc + (y - pivotY) * ss) * carriedScale
        const localY = (-(x - pivotX) * ss + (y - pivotY) * cc) * carriedScale
        const dx = pivotX + localX * Math.cos(deal.flip) * cc - localY * ss - px
        const dy = pivotY + localX * Math.cos(deal.flip) * ss + localY * cc - py
        L.mesh.position.set(
          px + dx * c - dy * s + entryX,
          py + dx * s + dy * c + entryY,
          zb + L.dz * sk,
        )
        // The card's hinge is shared by the whole word. Applying its yaw in
        // each letter's separately rotated axes made the word peel apart.
        L.mesh.rotation.set(L.rx, L.ry, rot + L.rot + tweak.r - carrier.roll, 'ZYX')
        L.mesh.quaternion.premultiply(piece.mesh.quaternion)
        // Depth separates paper; it must not inflate its authored type size.
        const depthScale = jackPaperProjection(DIST, fit, L.mesh.position.z)
        const projection = depthScale / pz
        L.mesh.position.x *= projection
        L.mesh.position.y *= projection
        L.mesh.position.x += (centre.current[0] + tn.jkLockX) * (depthScale - 1)
        L.mesh.position.y += (centre.current[1] + tn.jkLockY) * (depthScale - 1)
        L.mesh.scale.setScalar(sk * tweak.s * projection * carriedScale)
        L.mat.opacity = localTime > 0 && Math.abs(deal.flip) < Math.PI / 2 - .03 ? 1 : 0
      })
      // Keep each card and its word together as the chip releases the paper.
      const fall = jackBlastAt(t - impact.at, 67 + wi * 3,
        (piece.mesh.position.x + centre.current[0] + tn.jkLockX) * fit - impact.x,
        (piece.mesh.position.y + centre.current[1] + tn.jkLockY) * fit - impact.y, impact.speed)
      if (fall.active) {
        fallEuler.set(fall.pitch, fall.yaw, fall.roll, 'ZYX')
        fallQuaternion.setFromEuler(fallEuler)
        fallPivot.copy(piece.mesh.position)
        for (const { L } of homes) {
          // The collage's decorative depth ladder can place a low letter
          // behind its own stock. Lift its full tilted bounds before applying
          // the shared tumble, so enabling depth writes cannot slice the word.
          if (!L.mesh.geometry.boundingBox) L.mesh.geometry.computeBoundingBox()
          L.mesh.updateMatrix()
          fallInkBounds.copy(L.mesh.geometry.boundingBox!).applyMatrix4(L.mesh.matrix)
          L.mesh.position.z += Math.max(0, fallPivot.z + .025 - fallInkBounds.min.z)
          L.mesh.position.sub(fallPivot).applyQuaternion(fallQuaternion).add(fallPivot)
          L.mesh.position.x += fall.x / fit
          L.mesh.position.y += fall.y / fit
          L.mesh.quaternion.premultiply(fallQuaternion)
        }
        piece.mesh.position.x += fall.x / fit
        piece.mesh.position.y += fall.y / fit
        piece.mesh.quaternion.premultiply(fallQuaternion)
      }
    }

    // Restore the original collage: JACK is pasted across the tilted card.
    {
      const s2 = t - B.jack
      const cs = tn.jkCardW / D.jkCardW
      const co = Math.cos(tn.jkCardTilt), si = Math.sin(tn.jkCardTilt)
      const ox = tn.jkJackX * cs, oy = tn.jkJackY * cs
      const cardFit = Math.min(1, D.jkCardW * JACK_HEADLINE_SPAN / (b.jack.width * D.jkJackS))
      place('JACK', b.jack, tn.jkCardX + ox * co - oy * si, tn.jkCardY + ox * si + oy * co,
        tn.jkCardTilt + tn.jkJackR, tn.jkJackS * cardFit * cs, () => s2, 0)
    }

    // "of": both scraps on the word's line and the word's frames, offset only slightly from each other
    place('of', b.of, tn.jkOfX, tn.jkOfY, tn.jkOfR, tn.jkOfS, () => t - B.of, 1)

    // ALL
    place('ALL', b.all, tn.jkAllX, tn.jkAllY, tn.jkAllR, tn.jkAllS, () => t - B.all, 2)

    // TRADES arrives as TRADES: one line, one set of frames, its letters apart only by their slight offsets
    place('TRADES', b.trades, tn.jkTrX, tn.jkTrY, tn.jkTrR, tn.jkTrS, () => t - B.trades, 3)

    b.lock.position.set(centre.current[0] + tn.jkLockX, centre.current[1] + tn.jkLockY, 0)
    g.userData.cardRenderLayer = t > impact.at ? 1 : 0
    if (poseTime === undefined && t >= prepareAt) {
      const preparedNow = !b.flight.active
      if (preparedNow) {
        // Prepare the exact launch pose during the back flip so depth
        // spacing does not shift the whole field on the release frame.
        animate(state, 0, impact.at)
        g.updateWorldMatrix(true, true)
        b.flight.start(b.bodies, impact.speed, g.getWorldPosition(new THREE.Vector3()), g.getWorldQuaternion(new THREE.Quaternion()))
      }
      if (t < impact.at) {
        // Restore this frame after sampling the future launch, then ease only
        // the required depth spacing into its existing authored motion.
        if (preparedNow) animate(state, 0, t)
        b.flight.stage((t - prepareAt) / (impact.at - prepareAt))
        g.updateWorldMatrix(true, true)
        return
      }
      showFlight()
    }
  }
  useFrame((state, dt) => animate(state, dt))

  useFrame(({ camera, clock }) => {
    const g = group.current
    const b = built.current
    if (g?.visible && b && beatTime(clock.elapsedTime - t0.current) > cardImpact.current.at) {
      const t = beatTime(clock.elapsedTime - t0.current)
      // Allow the upward kick and camera dive to finish before retiring below
      // the frame. A fixed lifetime used to chop the slowest papers in half.
      if (t > flickAt + riseFor + holdFor + getTune().jkFallFor && paperExit.cleared(g, camera, 'bottom')) {
        retiredPaper.current.at = t
        g.visible = false
      }
    }
  }, .9) // after the .75 dealer handoff, before the priority-1 paint compositor

  return <group ref={group} renderOrder={20} userData={{ cardRenderLayer: 0 }} />
}

const scratch = { fwd: new THREE.Vector3(), p: new THREE.Vector3(), q: new THREE.Vector3(), tan: new THREE.Vector3(), sourceQuaternion: new THREE.Quaternion(), targetQuaternion: new THREE.Quaternion(), reverseQuaternion: new THREE.Quaternion(0, 1, 0, 0), wallQuaternion: new THREE.Quaternion() }
const WALL_EDGE = new THREE.Quaternion(0, Math.SQRT1_2, 0, Math.SQRT1_2)
const fallEuler = new THREE.Euler()
const fallQuaternion = new THREE.Quaternion()
const fallPivot = new THREE.Vector3()
const fallInkBounds = new THREE.Box3()
/** Swap printed artwork only at the shared edge-on pose, never face-on. */
function applyWallTurn(q: THREE.Quaternion, reveal: number, backFace: boolean) {
  if (reveal <= 0) return
  if (reveal < .5) { q.slerp(WALL_EDGE, reveal * 2); return }
  scratch.wallQuaternion.set(0, backFace ? 1 : 0, 0, backFace ? 0 : 1)
  q.copy(WALL_EDGE).slerp(scratch.wallQuaternion, (reveal - .5) * 2)
}
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
    const mat = new MeshBasicNodeMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, depthTest: false, toneMapped: false, fog: false })
    return { tex, mat }
  }, [])

  useFrame((state) => {
    const m = mesh.current
    if (!m || !built) return
    if (!armed || clock0.current < 0) {
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
