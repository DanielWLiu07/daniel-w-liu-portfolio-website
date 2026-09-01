/**
 * The full 52 card set: four suits, thirteen ranks, drawn rather than shipped.
 *
 * No bitmaps. Every face is a canvas, so the deck costs nothing to download,
 * scales to whatever resolution the shot needs, and can be recoloured from the
 * casino palette instead of from a texture edit.
 *
 * The split here is deliberate. LAYOUT is pure data: pipLayout() returns where
 * the pips go in unit card space and nothing else, so it can be asserted in
 * scripts/check-cards.ts without a canvas. DRAWING consumes that layout. A pip
 * grid that is subtly wrong (a seven laid out as a six plus one in the middle,
 * a ten with its centre pips upright) looks fine in a render and is wrong to
 * anyone who has held a deck.
 *
 * Unit card space is (0,0) top left to (1,1) bottom right, the canvas
 * convention, so x is in card WIDTHS and y is in card HEIGHTS. Distances that
 * have to be compared, like pip clearances, are converted to width units by
 * dividing y by ASPECT.
 */

/** poker proportion, 2.5 x 3.5 inches */
export const ASPECT = 2.5 / 3.5

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs'
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'

export const SUITS: readonly Suit[] = ['spades', 'hearts', 'diamonds', 'clubs']
export const RANKS: readonly Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
export const COURTS: readonly Rank[] = ['J', 'Q', 'K']

/** hearts and diamonds print red, spades and clubs black. Nothing else varies by suit. */
export const SUIT_IS_RED: Record<Suit, boolean> = { spades: false, hearts: true, diamonds: true, clubs: false }

export const RED = '#b8181c'
export const INK = '#1a1a1a'
export const PAPER = '#f6f2e6'
export const GOLD = '#c8a227'

export const suitColour = (s: Suit) => (SUIT_IS_RED[s] ? RED : INK)

/** one card of the set */
export interface Card {
  rank: Rank
  suit: Suit
}

/** the whole deck in printing order: spades A..K, then hearts, diamonds, clubs */
export function deck(): Card[] {
  const out: Card[] = []
  for (const suit of SUITS) for (const rank of RANKS) out.push({ rank, suit })
  return out
}

export const cardId = (c: Card) => `${c.rank}${c.suit[0]}`

/**
 * The pip field: the rectangle the number cards' pips live in, inside the corner
 * indices on both diagonals. Pips sit on three columns and on rows interpolated
 * across it, which is what makes the layouts below a table of fractions rather
 * than a table of coordinates.
 */
/**
 * Measured against a real deck, not chosen.
 *
 * The English pattern reference cards put their pip columns at 0.249, 0.499 and
 * 0.749 of the card width. Ours cannot go that wide: that deck sets its index in
 * a much smaller glyph tucked at x 0.083, and ours is a bigger glyph at 0.125,
 * so a column at 0.249 would put the pip through the index. 0.282 is as wide as
 * the index leaves room for, which is still noticeably wider than the 0.300 this
 * started at.
 */
export const PIP_FIELD = { x0: 0.282, x1: 0.718, y0: 0.152, y1: 0.848 } as const
const L = 0, C = 0.5, R = 1

/**
 * The classic layouts, as [column, row] with both in 0..1 across the pip field.
 *
 * This is the arrangement every standard deck prints, and the reason it is a
 * table rather than a formula: 7 puts its odd pip a quarter of the way down and
 * 8 adds its partner three quarters down, while 9 and 10 abandon that grid for
 * quarters and thirds. There is no rule that generates all thirteen.
 */
const LAYOUTS: Record<Rank, [number, number][]> = {
  A: [[C, 0.5]],
  '2': [[C, 0], [C, 1]],
  '3': [[C, 0], [C, 0.5], [C, 1]],
  '4': [[L, 0], [R, 0], [L, 1], [R, 1]],
  '5': [[L, 0], [R, 0], [C, 0.5], [L, 1], [R, 1]],
  '6': [[L, 0], [R, 0], [L, 0.5], [R, 0.5], [L, 1], [R, 1]],
  '7': [[L, 0], [R, 0], [C, 0.25], [L, 0.5], [R, 0.5], [L, 1], [R, 1]],
  '8': [[L, 0], [R, 0], [C, 0.25], [L, 0.5], [R, 0.5], [C, 0.75], [L, 1], [R, 1]],
  '9': [[L, 0], [R, 0], [L, 1 / 3], [R, 1 / 3], [C, 0.5], [L, 2 / 3], [R, 2 / 3], [L, 1], [R, 1]],
  '10': [[L, 0], [R, 0], [C, 1 / 6], [L, 1 / 3], [R, 1 / 3], [L, 2 / 3], [R, 2 / 3], [C, 5 / 6], [L, 1], [R, 1]],
  // the courts carry a plate, not pips
  J: [],
  Q: [],
  K: [],
}

/**
 * The seven is the ONE rank a standard deck does not lay out point symmetrically.
 *
 * Its odd pip sits a quarter of the way down, between the top pair and the
 * middle pair, and a half turn sends it three quarters down where there is
 * nothing to meet it. Every other rank maps onto itself. This is printed that
 * way on real decks, so the check asserts the exception rather than "fixing" it
 * into a symmetry the deck does not have.
 */
export const HALF_TURN_ODD: Partial<Record<Rank, number>> = { '7': 1 }

/** how many pips a rank prints: its face value, and nothing for a court */
export function pipCount(rank: Rank): number {
  if (rank === 'A') return 1
  if (COURTS.includes(rank)) return 0
  return Number(rank)
}

export interface Pip {
  /** unit card space */
  x: number
  y: number
  /** printed upside down, the way the lower half of a real card is */
  flip: boolean
}

/** where a rank's pips go, in unit card space */
export function pipLayout(rank: Rank): Pip[] {
  const f = PIP_FIELD
  return LAYOUTS[rank].map(([c, t]) => ({
    x: f.x0 + c * (f.x1 - f.x0),
    y: f.y0 + t * (f.y1 - f.y0),
    // a pip below the middle is rotated, which is what makes a card read the
    // same from either end. The middle pip of A, 3 and 5 stays upright.
    flip: t > 0.5,
  }))
}

/**
 * The ace prints one larger pip.
 *
 * Worth knowing that this is a DEPARTURE: measured on the English pattern ace of
 * hearts, its single pip is 0.165 of the card width, exactly the same size as a
 * pip on the ten. That deck does not enlarge the ace at all. A lone pip at the
 * number size reads as a bare card here, so this keeps some enlargement, but
 * less than it had.
 */
export const ACE_SCALE = 1.75

/**
 * Pip size, DERIVED rather than picked.
 *
 * `design` is MEASURED off a real deck: the English pattern reference cards put
 * their pip at 0.165 of the card width, which is where this sits. It is still
 * only an upper request: the ten's centre pips sit a sixth
 * of the field below the corner pips and a fifth of the width inside them, and
 * that diagonal is the tightest pair anywhere in the set. Taking the minimum
 * means a change to PIP_FIELD can never quietly start overlapping pips.
 *
 * Returns sizes in card WIDTH units. `clearest` is the tightest centre to centre
 * distance in the set, kept so a check can report the margin.
 */
export function pipMetrics(design = 0.165, clearance = 0.94) {
  let clearest = Infinity
  let where = ''
  for (const rank of RANKS) {
    const ps = pipLayout(rank)
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const dx = ps[i].x - ps[j].x
        // y is in card heights; the comparison has to happen in one unit
        const dy = (ps[i].y - ps[j].y) / ASPECT
        const d = Math.hypot(dx, dy)
        if (d < clearest) {
          clearest = d
          where = rank
        }
      }
    }
  }
  const size = Math.min(design, clearest * clearance)
  return { size, clearest, tightest: where, clamped: size < design }
}

/** how far in from the card's edge the printed frame runs */
export const FRAME_INSET = 0.042
/** clear space the index keeps between itself and that frame */
export const INDEX_MARGIN = 0.026

/**
 * The corner index block, in unit card space: rank over a small suit mark.
 *
 * `rankSize` is a REQUEST, not a promise. A ten is two glyphs in the space of
 * one and at any size that reads well for a K it crosses the frame, so the rank
 * is measured and shrunk to fit the safe box at draw time. Nudging the constants
 * until the ten happened to fit only holds until the serif falls back to Times
 * on a machine without Georgia, and then it crosses the frame again.
 */
export const CORNER = { x: 0.125, rank: 0.095, suit: 0.175, rankSize: 0.115, suitSize: 0.072 } as const

/** the widest the rank glyph may be, centred on CORNER.x and clear of the frame */
export function indexSafeWidth(): number {
  return 2 * (CORNER.x - FRAME_INSET - INDEX_MARGIN)
}

/**
 * The court plate's panel, mirrored about the middle.
 *
 * x0 is set by the INDEX, not by taste. The rank glyph is centred on CORNER.x
 * and may be as wide as indexSafeWidth(), so a panel that starts left of
 * CORNER.x + half of that has the letter running through its frame, which is
 * exactly what a wider panel was doing: the K reached x 0.186 and the frame
 * started at 0.155. Real decks inset the panel for the same reason.
 */
export const COURT_PANEL = { x0: 0.212, x1: 0.788, y0: 0.075, y1: 0.925 } as const

/**
 * Where the held regalia sits, and how far the widest of them reaches past it.
 *
 * Constants rather than numbers inline, because the plate is CLIPPED to the
 * panel: anything reaching past x1 is not drawn wrong, it is silently cut off at
 * the frame, which reads as a blade snapped against the border. Narrowing the
 * panel to clear the index is what pushed the jack's halberd out, so the check
 * asserts this reach against the panel now.
 */
export const COURT_REGALIA = { x: 0.19, reach: 0.082 } as const

/* -------------------------------------------------------------------------- */
/* drawing                                                                     */
/* -------------------------------------------------------------------------- */

type Ctx = CanvasRenderingContext2D

/**
 * One suit mark, centred on (cx, cy) and fitted to a box `s` across.
 *
 * The paths are written in a unit box from -0.5 to 0.5 so the four suits share
 * one call site and keep their real relative proportions: a diamond is narrow, a
 * club is nearly square, a spade sits between them.
 */
export function drawSuit(x: Ctx, suit: Suit, cx: number, cy: number, s: number, colour?: string) {
  x.save()
  x.translate(cx, cy)
  x.scale(s, s)
  x.fillStyle = colour ?? suitColour(suit)
  if (suit === 'hearts') {
    x.beginPath()
    x.moveTo(0, 0.46)
    x.bezierCurveTo(-0.3, 0.2, -0.5, -0.02, -0.5, -0.18)
    x.bezierCurveTo(-0.5, -0.42, -0.22, -0.5, 0, -0.24)
    x.bezierCurveTo(0.22, -0.5, 0.5, -0.42, 0.5, -0.18)
    x.bezierCurveTo(0.5, -0.02, 0.3, 0.2, 0, 0.46)
    x.closePath()
    x.fill()
  } else if (suit === 'diamonds') {
    x.beginPath()
    x.moveTo(0, -0.5)
    x.lineTo(0.33, 0)
    x.lineTo(0, 0.5)
    x.lineTo(-0.33, 0)
    x.closePath()
    x.fill()
  } else if (suit === 'spades') {
    x.beginPath()
    x.moveTo(0, -0.48)
    x.bezierCurveTo(0.08, -0.28, 0.24, -0.14, 0.34, -0.02)
    x.bezierCurveTo(0.43, 0.1, 0.42, 0.28, 0.29, 0.34)
    x.bezierCurveTo(0.19, 0.38, 0.1, 0.33, 0.06, 0.245)
    // the stem flares out of the blade's notch, so it is one silhouette
    x.bezierCurveTo(0.06, 0.34, 0.105, 0.44, 0.18, 0.5)
    x.lineTo(-0.18, 0.5)
    x.bezierCurveTo(-0.105, 0.44, -0.06, 0.34, -0.06, 0.245)
    x.bezierCurveTo(-0.1, 0.33, -0.19, 0.38, -0.29, 0.34)
    x.bezierCurveTo(-0.42, 0.28, -0.43, 0.1, -0.34, -0.02)
    x.bezierCurveTo(-0.24, -0.14, -0.08, -0.28, 0, -0.48)
    x.closePath()
    x.fill()
  } else {
    // three lobes and a stem, each filled on its own. A single path would have
    // to union four subpaths and any one of them wound the other way punches a
    // hole; opaque fills of one colour union for free.
    for (const [lx, ly] of [[0, -0.245], [-0.245, 0.115], [0.245, 0.115]] as const) {
      x.beginPath()
      x.arc(lx, ly, 0.215, 0, Math.PI * 2)
      x.fill()
    }
    x.beginPath()
    x.moveTo(-0.185, 0.5)
    x.bezierCurveTo(-0.085, 0.38, -0.05, 0.23, -0.045, 0.03)
    x.lineTo(0.045, 0.03)
    x.bezierCurveTo(0.05, 0.23, 0.085, 0.38, 0.185, 0.5)
    x.closePath()
    x.fill()
  }
  x.restore()
}

/** the rank as it is printed in the corner: T is written 10, everything else is itself */
export const rankLabel = (r: Rank) => r

const indexFontCache = new Map<string, string>()
/**
 * ONE index size for every rank, measured rather than assumed.
 *
 * The whole set is measured, the widest single glyph decides the size, and every
 * rank is set at it. Fitting each rank on its own prints an A smaller than a 4,
 * which no deck does.
 *
 * Measuring matters because the fallback matters: on a machine without Georgia
 * this sets in Times, whose A is wider, and constants tuned against Georgia
 * would put it through the frame.
 */
function indexFont(x: Ctx, W: number, H: number): string {
  const size = CORNER.rankSize * H
  const key = `${Math.round(size)}:${Math.round(W)}`
  const hit = indexFontCache.get(key)
  if (hit) return hit
  const font = (px: number) => `700 ${Math.round(px)}px ${INDEX_FACE}`
  x.save()
  x.font = font(size)
  let widest = 0
  // the ten is excluded: it is two glyphs and it is CONDENSED to fit, not
  // allowed to drag the other twelve down to its width
  for (const r of RANKS) if (r !== '10') widest = Math.max(widest, x.measureText(r).width)
  x.restore()
  const safe = indexSafeWidth() * W
  const out = font(widest > safe ? size * (safe / widest) : size)
  indexFontCache.set(key, out)
  return out
}

/**
 * How much the ten has to be squeezed sideways, and by how much of that in
 * tracking versus in width.
 *
 * A ten is two glyphs in the space every other rank gets one, and the way real
 * decks deal with that is a CONDENSED cut: the digits get narrower and the cap
 * height does not move. Scaling the font instead, which is the obvious fix and
 * what this did first, makes the ten shorter as well as narrower, and an index
 * that is shorter than its neighbours is exactly what the eye catches on a
 * spread hand.
 *
 * The squeeze is split: tracking first, because negative tracking on two digits
 * is nearly invisible, then width for whatever is left over.
 */
export const INDEX_TRACK = -0.055

/**
 * The index face, and it is Times ahead of Georgia for ONE measured reason.
 *
 * Georgia has OLD STYLE figures. Measured at 90 px its digits come out
 * 0:50 1:49 2:49 against 3:65 4:65 5:64 6:66 7:64 8:66 9:65, so its 1 and 0 are
 * a quarter shorter than the rest of the set. That is the typeface working as
 * designed and it is wrong for a card index, where the ten then reads as a
 * smaller rank than the nine beside it. It is also why the 2 looked light.
 *
 * Times has LINING figures: same measurement gives a spread of 1.3 out of 90.
 * Every rank now stands the same height, which is what a real deck's index does
 * and what no amount of scaling could have fixed.
 */
export const INDEX_FACE = '"Times New Roman", Times, Georgia, serif'

function condense(x: Ctx, label: string, W: number): number {
  const safe = indexSafeWidth() * W
  const w = x.measureText(label).width
  return w > safe ? safe / w : 1
}

function drawCorner(x: Ctx, rank: Rank, suit: Suit, W: number, H: number, flip: boolean) {
  x.save()
  if (flip) {
    x.translate(W, H)
    x.rotate(Math.PI)
  }
  const col = suitColour(suit)
  const cx = CORNER.x * W
  x.fillStyle = col
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  const label = rankLabel(rank)
  x.font = indexFont(x, W, H)
  const ls = x as Ctx & { letterSpacing?: string }
  const hadLs = ls.letterSpacing
  // tracking is applied BEFORE measuring, so the width scale only has to cover
  // what tracking could not
  if (rank === '10') ls.letterSpacing = `${(CORNER.rankSize * H * INDEX_TRACK).toFixed(2)}px`
  const k = condense(x, label, W)
  if (k < 1) {
    // narrower, NOT smaller: the y scale stays at 1 so the cap height is the
    // same as every other rank on the card
    x.save()
    x.translate(cx, CORNER.rank * H)
    x.scale(k, 1)
    x.fillText(label, 0, 0)
    x.restore()
  } else {
    x.fillText(label, cx, CORNER.rank * H)
  }
  ls.letterSpacing = hadLs ?? '0px'
  drawSuit(x, suit, cx, CORNER.suit * H, CORNER.suitSize * W, col)
  x.restore()
}

/* -------------------------------------------------------------------------- */
/* court plates: a generated image when there is one, the drawn figure when not */
/* -------------------------------------------------------------------------- */

/**
 * Where a generated court plate lives. One image per RANK, not per card: the
 * figure is the same on all four suits and only the marks change, so three
 * images cover twelve cards and the suit can never come out wrong, because the
 * suit is still drawn.
 *
 * Each image is the TOP HALF of the figure. The existing mirror and clip does
 * the rest, which means the point symmetry a court card needs is guaranteed by
 * the code rather than hoped for from the generator.
 */
export const courtPlateURL = (rank: 'J' | 'Q' | 'K') => `/cards/court-${rank.toLowerCase()}.png`

const PLATES = new Map<string, HTMLImageElement>()

/** true once a plate for this rank has loaded and can be printed */
export const hasCourtPlate = (rank: Rank) => PLATES.has(rank)

/**
 * Load whatever plates exist. A missing file is not an error: the drawn figure
 * is a complete card on its own, so the deck prints either way and the page
 * never has to know which it got.
 */
export async function loadCourtPlates(): Promise<string[]> {
  const got: string[] = []
  await Promise.all(
    (['J', 'Q', 'K'] as const).map(
      (r) =>
        new Promise<void>((done) => {
          const img = new Image()
          img.onload = () => {
            PLATES.set(r, img)
            got.push(r)
            done()
          }
          img.onerror = () => done()
          img.src = courtPlateURL(r)
        }),
    ),
  )
  return got
}

/**
 * Print a generated plate into the panel's top half.
 *
 * COVER, not contain: the panel is a fixed shape and the generator's is not, so
 * fitting inside it would leave bands of bare paper down the sides that the
 * drawn version does not have. The overflow is clipped by the caller.
 */
function drawCourtPlate(x: Ctx, img: HTMLImageElement, W: number, H: number) {
  const p = COURT_PANEL
  const bx = p.x0 * W
  const by = p.y0 * H
  const bw = (p.x1 - p.x0) * W
  const bh = ((p.y1 - p.y0) / 2) * H
  const k = Math.max(bw / img.width, bh / img.height)
  const dw = img.width * k
  const dh = img.height * k
  // anchored to the BOTTOM of the half panel, so the figure's shoulders meet
  // the middle rule wherever the generator put them in its own frame
  x.drawImage(img, bx + (bw - dw) / 2, by + bh - dh, dw, dh)
}

/**
 * A court plate: the top half of a figure, drawn once and printed again rotated,
 * the way a real court card is.
 *
 * The figure is the SAME on all four suits, in red, ink and gold, and only the
 * suit marks change. That is what real decks do, and it is not just tradition:
 * tinting the robe by the suit turned every spade and club into a black slab
 * with a white stripe down it.
 *
 * The head is in PROFILE. A frontal head built from bold shapes is a circle with
 * two dots and a curve in it, which is an emoji however carefully it is drawn,
 * and that is exactly what the first pass came out as. A profile has a nose, a
 * lip and a chin doing the work instead, so it reads as a figure at any size,
 * and it is what most real court cards actually show.
 *
 * The other half of the fix is DENSITY. Real courts have no large flat areas:
 * the costume is patterned and it fills the panel edge to edge. A flat red
 * hexagon with a white stripe reads as a shape, not as a person, so the robe
 * here is latticed, banded in gold, and cropped by the panel.
 */
function drawCourtHalf(x: Ctx, rank: 'J' | 'Q' | 'K', suit: Suit, W: number, H: number) {
  const cx = W / 2
  const pip = suitColour(suit)
  const p = COURT_PANEL
  const thin = Math.max(2, W * 0.0055)
  const thick = Math.max(2, W * 0.0092)
  x.lineJoin = 'round'
  x.lineCap = 'round'

  const fill = (col: string, path: () => void, stroke: string | '' = INK, lw = thin) => {
    x.beginPath()
    path()
    x.closePath()
    x.fillStyle = col
    x.fill()
    if (stroke) {
      x.strokeStyle = stroke
      x.lineWidth = lw
      x.stroke()
    }
  }
  const stroke = (col: string, lw: number, path: () => void) => {
    x.beginPath()
    path()
    x.strokeStyle = col
    x.lineWidth = lw
    x.stroke()
  }
  /** the figure faces the panel's left, so the head sits a touch right of centre */
  const hx = cx + W * 0.018

  /* ---- regalia, behind everything ---- */
  const ix = cx + W * COURT_REGALIA.x
  if (rank === 'K') {
    fill(PAPER, () => {
      x.moveTo(ix, H * 0.1)
      x.lineTo(ix + W * 0.018, H * 0.137)
      x.lineTo(ix + W * 0.018, H * 0.352)
      x.lineTo(ix - W * 0.018, H * 0.352)
      x.lineTo(ix - W * 0.018, H * 0.137)
    })
    stroke(INK, thin, () => {
      x.moveTo(ix, H * 0.121)
      x.lineTo(ix, H * 0.344)
    })
    fill(GOLD, () => x.rect(ix - W * 0.054, H * 0.352, W * 0.108, H * 0.02))
    fill(INK, () => x.rect(ix - W * 0.013, H * 0.372, W * 0.026, H * 0.06), '')
  } else if (rank === 'Q') {
    stroke(INK, thick, () => {
      x.moveTo(ix + W * 0.012, H * 0.44)
      x.quadraticCurveTo(ix + W * 0.03, H * 0.29, ix, H * 0.2)
    })
    fill(GOLD, () => {
      x.moveTo(ix + W * 0.014, H * 0.302)
      x.quadraticCurveTo(ix + W * 0.066, H * 0.312, ix + W * 0.08, H * 0.256)
      x.quadraticCurveTo(ix + W * 0.038, H * 0.254, ix + W * 0.014, H * 0.302)
    })
    fill(GOLD, () => x.arc(ix, H * 0.155, W * 0.056, 0, Math.PI * 2))
    drawSuit(x, suit, ix, H * 0.155, W * 0.08, pip)
  } else {
    fill(INK, () => x.rect(ix - W * 0.009, H * 0.092, W * 0.018, H * 0.35), '')
    fill(GOLD, () => {
      x.moveTo(ix + W * 0.009, H * 0.1)
      x.lineTo(ix + W * 0.082, H * 0.128)
      x.lineTo(ix + W * 0.009, H * 0.188)
    })
    fill(GOLD, () => {
      x.moveTo(ix, H * 0.074)
      x.lineTo(ix + W * 0.016, H * 0.1)
      x.lineTo(ix - W * 0.016, H * 0.1)
    })
  }

  /** the woven pattern, clipped to whatever shape is passed in */
  const lattice = (path: () => void) => {
    x.save()
    x.beginPath()
    path()
    x.closePath()
    x.clip()
    x.strokeStyle = 'rgba(246,242,230,0.34)'
    x.lineWidth = Math.max(1, W * 0.0075)
    for (let i = -H; i < W + H; i += W * 0.052) {
      x.beginPath(); x.moveTo(i, H * 0.14); x.lineTo(i + H * 0.36, H * 0.5); x.stroke()
      x.beginPath(); x.moveTo(i, H * 0.5); x.lineTo(i + H * 0.36, H * 0.14); x.stroke()
    }
    x.restore()
  }

  /**
   * The standing collar, behind the head.
   *
   * Without it the plate had a block of costume across the bottom and bare paper
   * either side of the face, which is the part that read as unfinished: real
   * court cards have no empty ground at head height. It doubles as the thing
   * that frames the profile, which is why it rises to just under the ear.
   */
  const fan = () => {
    x.moveTo(cx - W * 0.186, H * 0.352)
    x.quadraticCurveTo(cx - W * 0.208, H * 0.212, cx - W * 0.086, H * 0.19)
    x.lineTo(cx - W * 0.068, H * 0.294)
    x.lineTo(cx + W * 0.068, H * 0.294)
    x.lineTo(cx + W * 0.086, H * 0.19)
    x.quadraticCurveTo(cx + W * 0.208, H * 0.212, cx + W * 0.186, H * 0.352)
  }
  fill(RED, fan, INK, thick)
  lattice(fan)
  // the inner edges run UNDER the head on both sides. Set outside it they left a
  // sliver of paper between the face and the collar, and the two halves read as
  // a pair of wings floating either side of a head rather than as one collar.
  for (const side of [-1, 1]) {
    stroke(GOLD, Math.max(2, W * 0.013), () => {
      x.moveTo(cx + side * W * 0.092, H * 0.206)
      x.quadraticCurveTo(cx + side * W * 0.196, H * 0.228, cx + side * W * 0.174, H * 0.338)
    })
  }

  /* ---- robe, cropped by the panel on both sides ---- */
  /**
   * The robe meets the panel edge on a VERTICAL side.
   *
   * Sloping it all the way out to the corner made the mirrored pair a pointed
   * lens: a red almond with a white stripe, which is a shape and not a costume.
   * Reaching the edge high and dropping straight makes the printed pair a block
   * that fills the plate, which is what a real court card does.
   */
  const robe = () => {
    x.moveTo(p.x0 * W, H * 0.5)
    x.lineTo(p.x0 * W, H * 0.348)
    x.lineTo(cx - W * 0.176, H * 0.316)
    x.quadraticCurveTo(cx - W * 0.08, H * 0.274, cx, H * 0.28)
    x.quadraticCurveTo(cx + W * 0.08, H * 0.274, cx + W * 0.176, H * 0.316)
    x.lineTo(p.x1 * W, H * 0.348)
    x.lineTo(p.x1 * W, H * 0.5)
  }
  fill(RED, robe, INK, thick)

  lattice(robe)

  // gold bands along the shoulder line and down the panel's edge
  stroke(GOLD, Math.max(2, W * 0.016), () => {
    x.moveTo(p.x0 * W + W * 0.014, H * 0.366)
    x.lineTo(cx - W * 0.19, H * 0.336)
    x.quadraticCurveTo(cx - W * 0.09, H * 0.298, cx, H * 0.304)
    x.quadraticCurveTo(cx + W * 0.09, H * 0.298, cx + W * 0.19, H * 0.336)
    x.lineTo(p.x1 * W - W * 0.014, H * 0.366)
  })

  // the placket down the front, carrying the one mark that names the suit
  fill(PAPER, () => {
    x.moveTo(cx - W * 0.048, H * 0.3)
    x.lineTo(cx + W * 0.048, H * 0.3)
    x.lineTo(cx + W * 0.066, H * 0.5)
    x.lineTo(cx - W * 0.066, H * 0.5)
  }, INK, thin)
  drawSuit(x, suit, cx, H * 0.394, W * 0.082, pip)
  // mirrored, an unbroken placket is one white stripe running the whole plate
  // and it splits the costume in two; the band is what stops that reading
  fill(GOLD, () => {
    x.moveTo(cx - W * 0.062, H * 0.452)
    x.lineTo(cx + W * 0.062, H * 0.452)
    x.lineTo(cx + W * 0.066, H * 0.484)
    x.lineTo(cx - W * 0.066, H * 0.484)
  }, INK, thin)

  // cuff and hand on the regalia
  fill(RED, () => x.rect(cx + W * (COURT_REGALIA.x - 0.046), H * 0.332, W * 0.05, H * 0.048), INK, thin)
  fill(PAPER, () => x.ellipse(cx + W * COURT_REGALIA.x, H * 0.364, W * 0.031, H * 0.024, 0.2, 0, Math.PI * 2), INK, thin)

  /* ---- collar: points rather than a lens, so the neck is not a hinge ---- */
  fill(PAPER, () => {
    x.moveTo(cx - W * 0.122, H * 0.282)
    x.lineTo(cx - W * 0.055, H * 0.324)
    x.lineTo(cx, H * 0.288)
    x.lineTo(cx + W * 0.055, H * 0.324)
    x.lineTo(cx + W * 0.122, H * 0.282)
    x.quadraticCurveTo(cx, H * 0.248, cx - W * 0.122, H * 0.282)
  }, INK, thin)

  /**
   * Head, features and headwear as ONE group, scaled about a pivot up at the
   * headwear rather than about the head's middle.
   *
   * The head wanted to be larger to close the gap to the collar, but the crown
   * already sits a hair under the panel's top rule, so scaling about the middle
   * pushed it straight out of the plate. Pivoting high grows the head downward
   * into the collar instead, which is where the room is.
   */
  x.save()
  x.translate(hx, H * 0.108)
  x.scale(1.13, 1.13)
  x.translate(-hx, -H * 0.108)

  /* ---- hair behind the head ---- */
  if (rank === 'Q') {
    fill(INK, () => {
      x.moveTo(hx + W * 0.01, H * 0.135)
      x.quadraticCurveTo(hx + W * 0.115, H * 0.16, hx + W * 0.112, H * 0.24)
      x.quadraticCurveTo(hx + W * 0.108, H * 0.3, hx + W * 0.06, H * 0.312)
      x.quadraticCurveTo(hx + W * 0.086, H * 0.24, hx + W * 0.055, H * 0.175)
    }, '')
  } else {
    fill(INK, () => {
      x.moveTo(hx + W * 0.005, H * 0.136)
      x.quadraticCurveTo(hx + W * 0.098, H * 0.155, hx + W * 0.094, H * 0.225)
      x.quadraticCurveTo(hx + W * 0.09, H * 0.262, hx + W * 0.052, H * 0.27)
      x.quadraticCurveTo(hx + W * 0.078, H * 0.21, hx + W * 0.05, H * 0.168)
    }, '')
  }

  /* ---- the head, in profile, facing left ---- */
  fill(PAPER, () => {
    x.moveTo(hx + W * 0.008, H * 0.138)
    x.bezierCurveTo(hx - W * 0.03, H * 0.139, hx - W * 0.056, H * 0.15, hx - W * 0.058, H * 0.166)
    x.lineTo(hx - W * 0.07, H * 0.192)
    x.quadraticCurveTo(hx - W * 0.062, H * 0.198, hx - W * 0.078, H * 0.206)
    x.quadraticCurveTo(hx - W * 0.098, H * 0.214, hx - W * 0.092, H * 0.219)
    x.quadraticCurveTo(hx - W * 0.086, H * 0.223, hx - W * 0.066, H * 0.223)
    x.quadraticCurveTo(hx - W * 0.078, H * 0.231, hx - W * 0.07, H * 0.235)
    x.quadraticCurveTo(hx - W * 0.058, H * 0.239, hx - W * 0.07, H * 0.244)
    x.quadraticCurveTo(hx - W * 0.072, H * 0.253, hx - W * 0.05, H * 0.259)
    x.quadraticCurveTo(hx - W * 0.028, H * 0.265, hx + W * 0.03, H * 0.257)
    x.quadraticCurveTo(hx + W * 0.072, H * 0.247, hx + W * 0.08, H * 0.206)
    x.quadraticCurveTo(hx + W * 0.086, H * 0.16, hx + W * 0.008, H * 0.138)
  }, INK, thin)

  // eye and brow
  fill(INK, () => {
    x.moveTo(hx - W * 0.056, H * 0.2)
    x.quadraticCurveTo(hx - W * 0.04, H * 0.195, hx - W * 0.026, H * 0.201)
    x.quadraticCurveTo(hx - W * 0.04, H * 0.207, hx - W * 0.056, H * 0.2)
  }, '')
  stroke(INK, thin, () => {
    x.moveTo(hx - W * 0.06, H * 0.19)
    x.quadraticCurveTo(hx - W * 0.042, H * 0.184, hx - W * 0.022, H * 0.191)
  })
  // ear
  stroke(INK, thin, () => {
    x.moveTo(hx + W * 0.026, H * 0.212)
    x.quadraticCurveTo(hx + W * 0.048, H * 0.207, hx + W * 0.042, H * 0.229)
  })

  if (rank === 'K') {
    // moustache and beard, in profile: a silhouette off the jaw rather than a
    // black patch over the middle of a face
    fill(INK, () => {
      x.moveTo(hx - W * 0.066, H * 0.224)
      x.quadraticCurveTo(hx - W * 0.03, H * 0.222, hx - W * 0.012, H * 0.232)
      x.quadraticCurveTo(hx - W * 0.036, H * 0.234, hx - W * 0.066, H * 0.231)
    }, '')
    fill(INK, () => {
      x.moveTo(hx - W * 0.062, H * 0.246)
      x.quadraticCurveTo(hx - W * 0.048, H * 0.29, hx + W * 0.005, H * 0.298)
      x.quadraticCurveTo(hx + W * 0.062, H * 0.29, hx + W * 0.06, H * 0.232)
      x.quadraticCurveTo(hx + W * 0.03, H * 0.264, hx - W * 0.062, H * 0.246)
    }, '')
  } else if (rank === 'J') {
    stroke(INK, thin, () => {
      x.moveTo(hx - W * 0.068, H * 0.231)
      x.lineTo(hx - W * 0.048, H * 0.232)
    })
  } else {
    stroke(INK, thin, () => {
      x.moveTo(hx - W * 0.07, H * 0.233)
      x.lineTo(hx - W * 0.052, H * 0.234)
    })
  }

  /* ---- headwear ---- */
  if (rank === 'K') {
    fill(GOLD, () => {
      x.moveTo(hx - W * 0.072, H * 0.155)
      x.lineTo(hx - W * 0.062, H * 0.108)
      x.lineTo(hx - W * 0.022, H * 0.14)
      x.lineTo(hx + W * 0.008, H * 0.09)
      x.lineTo(hx + W * 0.042, H * 0.136)
      x.lineTo(hx + W * 0.082, H * 0.108)
      x.lineTo(hx + W * 0.09, H * 0.16)
    }, INK, thin)
    fill(GOLD, () => {
      x.moveTo(hx - W * 0.074, H * 0.152)
      x.quadraticCurveTo(hx + W * 0.008, H * 0.176, hx + W * 0.092, H * 0.157)
      x.lineTo(hx + W * 0.09, H * 0.132)
      x.quadraticCurveTo(hx + W * 0.008, H * 0.152, hx - W * 0.072, H * 0.128)
    }, INK, thin)
    x.fillStyle = RED
    for (const [jx, jy] of [[-0.062, 0.106], [0.008, 0.088], [0.082, 0.106]] as const) {
      x.beginPath()
      x.arc(hx + W * jx, H * jy, W * 0.013, 0, Math.PI * 2)
      x.fill()
      x.strokeStyle = INK
      x.lineWidth = thin
      x.stroke()
    }
  } else if (rank === 'Q') {
    fill(GOLD, () => {
      x.moveTo(hx - W * 0.066, H * 0.152)
      x.lineTo(hx - W * 0.05, H * 0.116)
      x.lineTo(hx - W * 0.016, H * 0.142)
      x.lineTo(hx + W * 0.014, H * 0.104)
      x.lineTo(hx + W * 0.046, H * 0.14)
      x.lineTo(hx + W * 0.072, H * 0.114)
      x.lineTo(hx + W * 0.082, H * 0.155)
      x.quadraticCurveTo(hx + W * 0.008, H * 0.174, hx - W * 0.066, H * 0.152)
    }, INK, thin)
    x.fillStyle = RED
    x.beginPath()
    x.arc(hx + W * 0.014, H * 0.102, W * 0.013, 0, Math.PI * 2)
    x.fill()
    x.strokeStyle = INK
    x.lineWidth = thin
    x.stroke()
  } else {
    // a soft cap pulled over the crown, with a gold band and a feather sweeping
    // back over the shoulder
    fill(RED, () => {
      x.moveTo(hx - W * 0.066, H * 0.16)
      x.quadraticCurveTo(hx - W * 0.088, H * 0.106, hx + W * 0.005, H * 0.09)
      x.quadraticCurveTo(hx + W * 0.098, H * 0.078, hx + W * 0.09, H * 0.152)
      x.quadraticCurveTo(hx + W * 0.008, H * 0.174, hx - W * 0.066, H * 0.16)
    }, INK, thin)
    fill(GOLD, () => {
      x.moveTo(hx - W * 0.068, H * 0.148)
      x.quadraticCurveTo(hx + W * 0.008, H * 0.168, hx + W * 0.09, H * 0.14)
      x.lineTo(hx + W * 0.091, H * 0.158)
      x.quadraticCurveTo(hx + W * 0.008, H * 0.184, hx - W * 0.066, H * 0.162)
    }, INK, thin)
    stroke(INK, thick, () => {
      x.moveTo(hx + W * 0.068, H * 0.104)
      x.quadraticCurveTo(hx + W * 0.16, H * 0.07, hx + W * 0.14, H * 0.026)
    })
  }
  x.restore()
}

/** the printed face of one card, at `W` pixels across */
export function cardFaceCanvas(rank: Rank, suit: Suit, W = 620): HTMLCanvasElement {
  const H = Math.round(W / ASPECT)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const x = c.getContext('2d')!
  const col = suitColour(suit)
  x.fillStyle = PAPER
  x.fillRect(0, 0, W, H)
  // the hairline frame a printed card carries
  x.strokeStyle = SUIT_IS_RED[suit] ? 'rgba(184,24,28,0.32)' : 'rgba(26,26,26,0.26)'
  x.lineWidth = Math.max(2, W * 0.0095)
  x.strokeRect(W * FRAME_INSET, W * FRAME_INSET, W * (1 - 2 * FRAME_INSET), H - W * 2 * FRAME_INSET)

  drawCorner(x, rank, suit, W, H, false)
  drawCorner(x, rank, suit, W, H, true)

  if (COURTS.includes(rank)) {
    const p = COURT_PANEL
    const px = p.x0 * W, pw = (p.x1 - p.x0) * W, py = p.y0 * H, ph = (p.y1 - p.y0) * H
    // the plate is clipped to the top half and printed twice, rotated. Clipping
    // is what keeps the two halves from drawing over each other at the rule.
    const plate = PLATES.get(rank)
    for (const flip of [false, true]) {
      x.save()
      if (flip) {
        x.translate(W, H)
        x.rotate(Math.PI)
      }
      x.beginPath()
      x.rect(px, py, pw, ph / 2)
      x.clip()
      if (plate) drawCourtPlate(x, plate, W, H)
      else drawCourtHalf(x, rank as 'J' | 'Q' | 'K', suit, W, H)
      x.restore()
    }
    if (plate) {
      // the suit still comes from the code, never from the picture, so a plate
      // shared across four suits cannot print the wrong one
      drawSuit(x, suit, W / 2, H * 0.402, W * 0.082, col)
      drawSuit(x, suit, W / 2, H * 0.598, W * 0.082, col)
    }
    x.strokeStyle = 'rgba(26,26,26,0.35)'
    x.lineWidth = Math.max(2, W * 0.005)
    x.beginPath()
    x.moveTo(px, H / 2)
    x.lineTo(px + pw, H / 2)
    x.stroke()
    x.strokeStyle = SUIT_IS_RED[suit] ? 'rgba(184,24,28,0.45)' : 'rgba(26,26,26,0.4)'
    x.strokeRect(px, py, pw, ph)
    return c
  }

  const { size } = pipMetrics()
  for (const p of pipLayout(rank)) {
    const s = (rank === 'A' ? size * ACE_SCALE : size) * W
    x.save()
    x.translate(p.x * W, p.y * H)
    if (p.flip) x.rotate(Math.PI)
    drawSuit(x, suit, 0, 0, s, col)
    x.restore()
  }
  return c
}

/** the deck's back: one design, so every card in the set flips onto the same one */
export function cardBackCanvas(W = 620): HTMLCanvasElement {
  const H = Math.round(W / ASPECT)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const x = c.getContext('2d')!
  const k = W / 620
  x.fillStyle = RED
  x.fillRect(0, 0, W, H)
  x.fillStyle = PAPER
  x.fillRect(22 * k, 22 * k, W - 44 * k, H - 44 * k)
  x.fillStyle = RED
  x.fillRect(38 * k, 38 * k, W - 76 * k, H - 76 * k)
  x.save()
  x.beginPath()
  x.rect(38 * k, 38 * k, W - 76 * k, H - 76 * k)
  x.clip()
  x.strokeStyle = 'rgba(246,242,230,0.5)'
  x.lineWidth = 3 * k
  for (let i = -H; i < W; i += 34 * k) {
    x.beginPath(); x.moveTo(i, 38 * k); x.lineTo(i + H, H - 38 * k); x.stroke()
    x.beginPath(); x.moveTo(i, H - 38 * k); x.lineTo(i + H, 38 * k); x.stroke()
  }
  x.restore()
  return c
}

/** the cut edge: cream stock with the faintest tooth, so 52 of them are not one block */
export function cardEdgeCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 8
  c.height = 64
  const x = c.getContext('2d')!
  x.fillStyle = '#efe9da'
  x.fillRect(0, 0, 8, 64)
  x.fillStyle = 'rgba(150,140,120,0.35)'
  for (let i = 0; i < 64; i += 2) x.fillRect(0, i, 8, 1)
  return c
}

/* -------------------------------------------------------------------------- */
/* link cards                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The calling cards: LinkedIn, Devpost, GitHub, printed on the deck's own stock.
 *
 * These are not ranks and they are not a fifth suit. They are the deck's version
 * of the advertisement card a real pack ships with, which is why they break the
 * one rule every other card here follows: they read one way up. A handle printed
 * point symmetrically is a handle nobody can read, and the whole reason these
 * exist is to be read and clicked.
 *
 * The marks are the real ones, in the real brand colours, which is already how
 * the resume folder's link tokens are drawn. An approximated Octocat looks like
 * a mistake, so the paths are the published ones and are rendered through
 * Path2D rather than transcribed into bezier calls.
 */
export type LinkKey = 'linkedin' | 'devpost' | 'github'
export const LINK_KEYS: readonly LinkKey[] = ['linkedin', 'devpost', 'github']

export interface LinkCardSpec {
  label: string
  /** the published mark, on the 24 x 24 viewBox every one of these is authored in */
  mark: string
  /** the brand's own colour, the same convention the folder's link tokens use */
  accent: string
}

export const MARK_VIEWBOX = 24

export const LINK_CARDS: Record<LinkKey, LinkCardSpec> = {
  linkedin: {
    label: 'LinkedIn',
    mark: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
    accent: '#0a66c2',
  },
  devpost: {
    label: 'Devpost',
    mark: 'M6.002 1.61L0 12.004 6.002 22.39h11.996L24 12.004 17.998 1.61zm1.593 4.084h3.947c3.605 0 6.276 1.695 6.276 6.31 0 4.436-3.21 6.302-6.456 6.302H7.595zm2.517 2.449v7.714h1.241c2.646 0 3.862-1.55 3.862-3.861.009-2.569-1.096-3.853-3.767-3.853Z',
    accent: '#003e54',
  },
  github: {
    label: 'GitHub',
    mark: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
    accent: '#181717',
  },
}

/**
 * The handle, DERIVED from the profile URL rather than typed out beside it.
 *
 * Written twice they drift, and a card that prints one handle and opens another
 * is worse than a card with no handle at all. An empty URL prints nothing, which
 * is what the Devpost card does until a profile URL exists for it.
 */
export function handleFor(key: LinkKey, href: string): string {
  if (!href) return ''
  const path = href.replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '')
  const seg = path.split('/')
  if (key === 'linkedin') {
    const i = seg.indexOf('in')
    return i >= 0 && seg[i + 1] ? `/in/${seg[i + 1]}` : ''
  }
  return seg[1] ? `@${seg[1]}` : ''
}

/** one published mark, fitted to a box `s` across and centred on (cx, cy) */
export function drawMark(x: Ctx, key: LinkKey, cx: number, cy: number, s: number, colour?: string) {
  const spec = LINK_CARDS[key]
  x.save()
  x.translate(cx - s / 2, cy - s / 2)
  x.scale(s / MARK_VIEWBOX, s / MARK_VIEWBOX)
  x.fillStyle = colour ?? spec.accent
  x.fill(new Path2D(spec.mark))
  x.restore()
}

/**
 * A calling card's face.
 *
 * Gold rules rather than the suit coloured frame the ranked cards carry, so one
 * of these is recognisable face up in a spread without having to read it.
 */
export function linkCardFaceCanvas(key: LinkKey, href: string, W = 620): HTMLCanvasElement {
  const spec = LINK_CARDS[key]
  const H = Math.round(W / ASPECT)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const x = c.getContext('2d')!
  x.fillStyle = PAPER
  x.fillRect(0, 0, W, H)

  x.strokeStyle = GOLD
  x.lineWidth = Math.max(2, W * 0.0095)
  x.strokeRect(W * FRAME_INSET, W * FRAME_INSET, W * (1 - 2 * FRAME_INSET), H - W * 2 * FRAME_INSET)
  x.lineWidth = Math.max(1, W * 0.004)
  x.strokeRect(W * 0.072, W * FRAME_INSET + H * 0.022, W - W * 0.144, H - W * 2 * FRAME_INSET - H * 0.044)

  // corner marks, one each way up, standing in for a rank and a suit
  for (const flip of [false, true]) {
    x.save()
    if (flip) {
      x.translate(W, H)
      x.rotate(Math.PI)
    }
    // further in than a suit index sits: these marks are solid tiles, not open
    // glyphs, so at the suit's inset they touched the outer rule and read clipped
    drawMark(x, key, W * 0.128, H * 0.138, W * 0.078, spec.accent)
    x.restore()
  }

  /**
   * The mark stands on the paper, with nothing drawn round it.
   *
   * It sat in a gold seal at first, and a ring around a logo that is already a
   * self contained tile fights it: the LinkedIn square and the GitHub circle are
   * their own containers, so the seal was a second one drawn on top. The double
   * rule at the card's edge is the only frame this needs, and losing the ring
   * bought the mark enough room to carry the card on its own.
   */
  const cx = W / 2
  drawMark(x, key, cx, H * 0.386, W * 0.42, spec.accent)

  // name, rule, handle
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  // letterSpacing is not in every canvas implementation; without it the name
  // just sets tighter, which is a look, not a break
  const ls = x as CanvasRenderingContext2D & { letterSpacing?: string }
  const hadLs = ls.letterSpacing
  ls.letterSpacing = `${Math.round(W * 0.014)}px`
  x.fillStyle = INK
  x.font = `700 ${Math.round(W * 0.088)}px ${INDEX_FACE}`
  x.fillText(spec.label.toUpperCase(), cx, H * 0.62)
  ls.letterSpacing = hadLs ?? '0px'

  x.strokeStyle = GOLD
  x.lineWidth = Math.max(1, W * 0.005)
  x.beginPath()
  x.moveTo(cx - W * 0.17, H * 0.67)
  x.lineTo(cx + W * 0.17, H * 0.67)
  x.stroke()

  const handle = handleFor(key, href)
  if (handle) {
    x.fillStyle = spec.accent
    // same face as the index: a handle is mostly letters but it carries digits,
    // and Georgia would set those a quarter short
    x.font = `400 ${Math.round(W * 0.066)}px ${INDEX_FACE}`
    x.fillText(handle, cx, H * 0.72)
  }
  return c
}
