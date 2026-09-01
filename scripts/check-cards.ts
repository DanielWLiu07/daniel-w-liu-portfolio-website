/**
 * Is this actually a deck?
 *
 * A playing card set has rules, so they can be asserted rather than eyeballed:
 *   52 cards, four suits of thirteen, no duplicates
 *   hearts and diamonds red, spades and clubs black
 *   a rank prints its face value in pips: the seven has seven, the ten has ten
 *   the layout is point symmetric, so the card reads the same from either end
 *   pips below the middle print upside down
 *   every pip is inside the pip field and clear of the corner indices
 *   no two pips overlap
 *
 * A deck with a six laid out as a five plus one, or a ten whose centre pips are
 * upright, renders perfectly and is wrong to anyone who plays.
 *
 *   npx tsx scripts/check-cards.ts
 */
import {
  ACE_SCALE,
  ASPECT,
  CORNER,
  COURT_PANEL,
  COURT_REGALIA,
  COURTS,
  FRAME_INSET,
  INDEX_MARGIN,
  indexSafeWidth,
  HALF_TURN_ODD,
  LINK_CARDS,
  LINK_KEYS,
  MARK_VIEWBOX,
  handleFor,
  PIP_FIELD,
  RANKS,
  SUITS,
  SUIT_IS_RED,
  cardId,
  deck,
  pipCount,
  pipLayout,
  pipMetrics,
} from '../components/resume/casino/card-art'

const fail: string[] = []
const d = deck()

// 52 cards, four suits of thirteen, no duplicates
if (d.length !== 52) fail.push(`expected 52 cards, got ${d.length}`)
const ids = new Set(d.map(cardId))
if (ids.size !== d.length) fail.push(`duplicate cards: ${d.length - ids.size}`)
for (const s of SUITS) {
  const n = d.filter((c) => c.suit === s).length
  if (n !== 13) fail.push(`suit ${s} has ${n} cards`)
}
if (SUITS.filter((s) => SUIT_IS_RED[s]).length !== 2) fail.push('there must be exactly two red suits')

// a rank prints its face value
for (const r of RANKS) {
  const ps = pipLayout(r)
  const want = pipCount(r)
  if (ps.length !== want) fail.push(`${r} lays out ${ps.length} pips, wants ${want}`)
}
const total = RANKS.reduce((a, r) => a + pipLayout(r).length, 0)
// A + 2..10 = 1 + 54 = 55 per suit
if (total !== 55) fail.push(`a suit prints ${total} pips, wants 55`)
for (const r of COURTS) if (pipLayout(r).length) fail.push(`court ${r} lays out pips`)

// point symmetry: rotating the card 180 degrees must land the layout on itself.
// That is what makes a card readable from either end, and it fails loudly if a
// row fraction is mistyped. The seven is the standard exception and is asserted
// as an exception: exactly one unpartnered pip, not "whatever it happens to be".
const EPS = 1e-9
for (const r of RANKS) {
  const ps = pipLayout(r)
  let odd = 0
  for (const p of ps) {
    const hit = ps.find((q) => Math.abs(q.x - (1 - p.x)) < EPS && Math.abs(q.y - (1 - p.y)) < EPS)
    if (!hit) {
      odd++
      continue
    }
    if (hit.flip === p.flip && Math.abs(p.y - 0.5) > EPS) {
      fail.push(`${r}: a pip and its half turn partner are printed the same way up`)
    }
  }
  const want = HALF_TURN_ODD[r] ?? 0
  if (odd !== want) {
    fail.push(`${r}: ${odd} pips have no partner under a half turn, expected ${want}`)
  }
}

// pips below the middle print upside down, the ones above do not
for (const r of RANKS) {
  for (const p of pipLayout(r)) {
    if (p.y > 0.5 + EPS && !p.flip) fail.push(`${r}: pip at y ${p.y.toFixed(3)} is below the middle and upright`)
    if (p.y < 0.5 - EPS && p.flip) fail.push(`${r}: pip at y ${p.y.toFixed(3)} is above the middle and inverted`)
    if (Math.abs(p.y - 0.5) < EPS && p.flip) fail.push(`${r}: the middle pip is inverted`)
  }
}

const { size, clearest, tightest, clamped } = pipMetrics()

// every pip sits inside the pip field, with its whole mark on the card
for (const r of RANKS) {
  for (const p of pipLayout(r)) {
    const s = (r === 'A' ? size * ACE_SCALE : size) / 2
    const sy = s * ASPECT
    if (p.x - s < 0.02 || p.x + s > 0.98) fail.push(`${r}: a pip runs off the card sideways`)
    if (p.y - sy < 0.02 || p.y + sy > 0.98) fail.push(`${r}: a pip runs off the card vertically`)
    if (r !== 'A' && (p.x < PIP_FIELD.x0 - EPS || p.x > PIP_FIELD.x1 + EPS)) fail.push(`${r}: a pip is outside the pip field`)
    if (r !== 'A' && (p.y < PIP_FIELD.y0 - EPS || p.y > PIP_FIELD.y1 + EPS)) fail.push(`${r}: a pip is outside the pip field`)
  }
}

// no two pips overlap, judged on their bounding squares
for (const r of RANKS) {
  const ps = pipLayout(r)
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const dx = Math.abs(ps[i].x - ps[j].x)
      const dy = Math.abs(ps[i].y - ps[j].y) / ASPECT
      if (dx < size && dy < size) fail.push(`${r}: two pips overlap (${dx.toFixed(3)}, ${dy.toFixed(3)} apart, size ${size.toFixed(3)})`)
    }
  }
}

// the index block clears the printed frame. The rank glyph is measured and
// shrunk at draw time so it cannot cross; what has to hold here is that there is
// a box left to shrink INTO, and that the suit mark under it, whose size is
// fixed, clears on its own.
if (indexSafeWidth() <= 0.02) {
  fail.push(`the index has no room between the frame and its centre: ${indexSafeWidth().toFixed(4)}`)
}
{
  const halfSuit = CORNER.suitSize / 2
  if (CORNER.x - halfSuit < FRAME_INSET + INDEX_MARGIN * 0.5) {
    fail.push(`the corner suit mark crosses the frame: ${(CORNER.x - halfSuit).toFixed(4)} vs ${FRAME_INSET}`)
  }
  const suitBottom = CORNER.suit + halfSuit / ASPECT
  if (suitBottom > 0.5) fail.push('the corner index reaches past the middle of the card')
  const rankTop = CORNER.rank - (CORNER.rankSize * 0.7) / 2
  if (rankTop < FRAME_INSET * ASPECT + INDEX_MARGIN * ASPECT) {
    fail.push(`the rank glyph crosses the frame vertically: ${rankTop.toFixed(4)}`)
  }
}

// the COURT PANEL clears the index on both diagonals. The rank glyph is centred
// on CORNER.x and may be as wide as the safe box allows, so the panel has to
// start right of that, or the letter runs through the panel's frame. It did.
{
  const halfIndex = Math.max(indexSafeWidth() / 2, CORNER.suitSize / 2)
  const needs = CORNER.x + halfIndex + 0.018
  if (COURT_PANEL.x0 < needs) {
    fail.push(`the court panel starts at ${COURT_PANEL.x0} and the index reaches ${needs.toFixed(4)}`)
  }
  if (COURT_PANEL.x1 > 1 - needs) {
    fail.push(`the court panel ends at ${COURT_PANEL.x1} and the turned index reaches ${(1 - needs).toFixed(4)}`)
  }
  // the plate is clipped to the panel, so anything reaching past its edge is cut
  // off at the frame rather than drawn wrong. This is the invariant that broke
  // when the panel was narrowed to clear the index.
  const regalia = COURT_REGALIA.x + COURT_REGALIA.reach
  const room = COURT_PANEL.x1 - 0.5 - 0.008
  if (regalia > room) {
    fail.push(`the regalia reaches ${regalia.toFixed(4)} from the centre and the panel allows ${room.toFixed(4)}`)
  }
  if (COURT_PANEL.x0 + COURT_PANEL.x1 !== 1) fail.push('the court panel is not centred')
  if (COURT_PANEL.y0 + COURT_PANEL.y1 !== 1) fail.push('the court panel is not centred vertically')
}

// the pips clear the corner indices on both diagonals
// the RANK glyph is the wide part of the index, not the suit mark under it, so
// the box a pip has to clear is set by whichever of the two reaches further
const indexHalf = Math.max(CORNER.suitSize / 2, indexSafeWidth() / 2)
const cornerBox = {
  x0: CORNER.x - indexHalf,
  x1: CORNER.x + indexHalf,
  y0: CORNER.rank - CORNER.rankSize / 2,
  y1: CORNER.suit + CORNER.suitSize / ASPECT / 2,
}
for (const r of RANKS) {
  for (const p of pipLayout(r)) {
    const s = (r === 'A' ? size * ACE_SCALE : size) / 2
    for (const flip of [false, true]) {
      const bx = flip ? 1 - cornerBox.x1 : cornerBox.x0
      const bX = flip ? 1 - cornerBox.x0 : cornerBox.x1
      const by = flip ? 1 - cornerBox.y1 : cornerBox.y0
      const bY = flip ? 1 - cornerBox.y0 : cornerBox.y1
      const overlaps = p.x + s > bx && p.x - s < bX && p.y + s * ASPECT > by && p.y - s * ASPECT < bY
      if (overlaps) fail.push(`${r}: a pip runs into the ${flip ? 'bottom' : 'top'} index`)
    }
  }
}

// the ace prints one large pip
if (pipLayout('A').length !== 1) fail.push('the ace must print one pip')
if (ACE_SCALE <= 1) fail.push('the ace pip must be larger than a number card pip')

// the calling cards: real marks, real colours, and links that either work or do
// nothing. A card that prints a handle and opens a different profile is worse
// than one with no handle, so the handle is derived from the URL and checked
// against it here rather than typed beside it.
const seen = new Set<string>()
for (const k of LINK_KEYS) {
  const spec = LINK_CARDS[k]
  if (!spec) {
    fail.push(`link card ${k} has no spec`)
    continue
  }
  if (seen.has(k)) fail.push(`duplicate link card ${k}`)
  seen.add(k)
  if (!spec.label) fail.push(`link card ${k} has no label`)
  if (!/^#[0-9a-f]{6}$/i.test(spec.accent)) fail.push(`link card ${k} accent is not a hex colour: ${spec.accent}`)
  // the published marks are all authored on a 24 unit viewBox, which is what
  // drawMark's scale assumes; a 16 unit path would silently print at 1.5x
  if (!spec.mark.startsWith('M')) fail.push(`link card ${k} mark is not a path`)
  // SVG path data drops the leading zero, so ".027" is a real number and a
  // regex that demands a digit first reads it as 27 and reports a mark that
  // leaves the viewBox when nothing is wrong with the mark
  const nums = spec.mark.match(/-?(?:\d+\.?\d*|\.\d+)/g) ?? []
  const big = nums.map(Number).filter((n) => Math.abs(n) > MARK_VIEWBOX + 1)
  if (big.length) fail.push(`link card ${k} mark leaves the ${MARK_VIEWBOX} unit viewBox: ${big.slice(0, 3).join(', ')}`)
}
for (const [k, href, want] of [
  ['linkedin', 'https://www.linkedin.com/in/someone/', '/in/someone'],
  ['github', 'https://github.com/someone', '@someone'],
  ['devpost', 'https://devpost.com/someone', '@someone'],
  ['github', '', ''],
] as const) {
  const got = handleFor(k, href)
  if (got !== want) fail.push(`handleFor(${k}, "${href}") gave "${got}", wanted "${want}"`)
}

if (fail.length) {
  console.error('FAIL')
  for (const f of fail) console.error('  ' + f)
  process.exit(1)
}
console.log(
  `OK: 52 cards plus ${LINK_KEYS.length} calling cards, four suits of thirteen, every rank prints its own count, the layout is point symmetric, ` +
    `the lower half prints inverted, no pip overlaps another or an index.`,
)
console.log(
  `     pip ${size.toFixed(4)} of the card width${clamped ? ' (clamped)' : ''}; tightest pair is the ${tightest} at ` +
    `${clearest.toFixed(4)}, a margin of ${((clearest - size) / clearest * 100).toFixed(1)} percent.`,
)
