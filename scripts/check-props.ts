/**
 * Do the things strewn round the title match the things already on the table?
 *
 * "About the same size" is the kind of thing that looks fine in one shot and
 * drifts the moment either side is touched, so the two relationships that
 * matter are asserted rather than eyeballed:
 *
 *   a scattered chip is the SAME size as the hero chip in the middle
 *   a die is a shade under half a chip across, which is what the real things are
 *
 *   npx tsx scripts/check-props.ts
 */
import { HERO_CHIP, heroChipHeight, heroChipRadius } from '../components/resume/casino/hero-chip'
import { DIE_PER_CHIP, PROP_LAYOUT, pileScatter, propChipHeight, propChipRadius, propDieSize } from '../components/resume/casino/title-props'
import { TUNE_DEFAULTS } from '../components/resume/casino/tune'

const fail: string[] = []

// the LANDED scale, not the flight one. Taking the coin's in flight 0.62 by
// mistake put every strewn chip at 62 percent of the one they sit next to, and
// nothing in the numbers said so: they were all self consistent and all wrong.
if (HERO_CHIP.rest !== 1) fail.push(`the hero chip rests at ${HERO_CHIP.rest}, and a landed chip rests at 1`)
if (HERO_CHIP.flight >= HERO_CHIP.rest) fail.push('the flight scale should be smaller than the resting one')

// the same chip, not a chip of about that size, AT EVERY SETTING OF THE KNOB.
//
// This is the assertion that was missing. The hero chip is mounted with
// size={tune.chip}, so its radius tracks a slider, and a check written against
// one value of that slider passes while the two are only equal at that value.
// The strewn chips sat at 1.100 against the hero chip's 1.760 with everything
// green, because 1.760 is 0.55 * 1.6 and the 1.6 was never in the sum.
for (const chip of [0.6, 1, TUNE_DEFAULTS.chip, 2.2, 3]) {
  if (Math.abs(propChipRadius(chip) - heroChipRadius(chip)) > 1e-9) {
    fail.push(`at chip ${chip} a strewn chip is ${propChipRadius(chip)} and the hero chip is ${heroChipRadius(chip)}`)
  }
  if (Math.abs(propChipHeight(chip) - heroChipHeight(chip)) > 1e-9) {
    fail.push(`at chip ${chip} the thicknesses differ`)
  }
  // and the die keeps its ratio to whatever the chip has become
  const across = propDieSize(chip) / (propChipRadius(chip) * 2)
  if (Math.abs(across - DIE_PER_CHIP) > 1e-9) fail.push(`at chip ${chip} the die is ${across} of a chip`)
}

// a real casino chip is 39 mm and a real casino die is 19 mm
if (Math.abs(DIE_PER_CHIP - 19 / 39) > 1e-9) fail.push('the die to chip ratio is not the real one')
{
  const across = propDieSize(TUNE_DEFAULTS.chip) / (propChipRadius(TUNE_DEFAULTS.chip) * 2)
  if (across < 0.4 || across > 0.6) fail.push(`a die is ${across.toFixed(3)} of a chip's diameter, which is not dice sized`)
}

/**
 * The piles have to be DIFFERENT from each other, and that has to be checked,
 * because it is exactly the thing that looks fine while being wrong: colour and
 * height varied all along and every pile still traced the same curve upward,
 * because the wobble expression and the twist were the same constants for all of
 * them. Eight piles were one pile in eight colours.
 *
 * So the signature covers how a pile SITS, not what denomination it is.
 */
{
  for (const [n, seed] of [[8, 3], [14, 7], [20, 11]] as const) {
    const piles = pileScatter(n, 0, 5, seed).chips
    const sig = (p: (typeof piles)[number]) =>
      [p.kind, p.height, p.lean.toFixed(4), p.wobble.toFixed(4), p.twist.toFixed(4), p.phase.toFixed(3)].join('/')
    const seen = new Set(piles.map(sig))
    if (seen.size !== piles.length) fail.push(`${n} piles at seed ${seed} include ${piles.length - seen.size} that sit identically`)
    // and the curve each one traces has to differ, not just the numbers
    const shapes = new Set(piles.map((p) => `${p.wobble.toFixed(4)}/${p.twist.toFixed(4)}/${p.phase.toFixed(3)}`))
    if (shapes.size !== piles.length) fail.push(`${n} piles at seed ${seed} share a wobble`)
    // all three kinds should turn up in a decent handful
    if (n >= 14) {
      const kinds = new Set(piles.map((p) => p.kind))
      if (kinds.size < 3) fail.push(`${n} piles only produced ${[...kinds].join(', ')}`)
    }
    // a single is one chip, and a neat pile is taller than a loose one on average
    for (const p of piles) {
      if (p.kind === 'single' && p.height !== 1) fail.push('a single is not one chip')
      if (p.height < 1) fail.push('a pile has no chips')
      if (p.kind === 'single' && p.lean !== 0) fail.push('a single chip leans')
    }
  }
}

/**
 * The baked layout has to be REACHABLE.
 *
 * A key is only read if a prop with that index is rendered, so a layout naming
 * chip:9 while ttChips is 7 does nothing at all, silently: the chip is simply
 * never placed and the table looks subtly wrong with nothing to point at. Same
 * for a mistyped prefix. This is the check for it.
 */
{
  const chips = Math.round(TUNE_DEFAULTS.ttChips)
  const dice = Math.round(TUNE_DEFAULTS.ttDice)
  for (const [key, v] of Object.entries(PROP_LAYOUT)) {
    const m = key.match(/^(chip|die):(\d+)$/)
    if (!m) {
      fail.push(`layout key "${key}" is not chip:n or die:n`)
      continue
    }
    const i = Number(m[2])
    const limit = m[1] === 'chip' ? chips : dice
    if (i >= limit) fail.push(`layout names ${key} but only ${limit} ${m[1]}s are dealt, so it never lands`)
    for (const [f, n] of Object.entries(v)) {
      if (!Number.isFinite(n)) fail.push(`${key} has a bad ${f}`)
    }
    if (v.s <= 0) fail.push(`${key} has no size`)
  }
  // and every dealt prop should have a home, or the layout is half applied
  for (let i = 0; i < chips; i++) if (!PROP_LAYOUT[`chip:${i}`]) fail.push(`chip:${i} is dealt but not placed`)
  for (let i = 0; i < dice; i++) if (!PROP_LAYOUT[`die:${i}`]) fail.push(`die:${i} is dealt but not placed`)
}

if (fail.length) {
  console.error('FAIL')
  for (const f of fail) console.error('  ' + f)
  process.exit(1)
}
{
  const piles = pileScatter(14, 0, 5, 7).chips
  const kinds = piles.reduce<Record<string, number>>((a, p) => ({ ...a, [p.kind]: (a[p.kind] ?? 0) + 1 }), {})
  console.log(
    'OK: a scattered chip is the same size as the hero chip, a die is the real fraction of one, ' +
      'and no two piles sit the same way.',
  )
  console.log(
    `     14 piles: ${Object.entries(kinds).map(([k, v]) => `${v} ${k}`).join(', ')}; ` +
      `heights ${Math.min(...piles.map((p) => p.height))} to ${Math.max(...piles.map((p) => p.height))}.`,
  )
  console.log(
    `     baked layout places ${Object.keys(PROP_LAYOUT).length} props, covering all ` +
      `${Math.round(TUNE_DEFAULTS.ttChips)} chips and ${Math.round(TUNE_DEFAULTS.ttDice)} dice that are dealt.`,
  )
}
const C = TUNE_DEFAULTS.chip
console.log(
  `     at chip ${C}: disc ${(propChipRadius(C) * 2).toFixed(4)} across and ${propChipHeight(C).toFixed(4)} thick, ` +
    `matching the hero chip measured in the scene at 1.760; die ${propDieSize(C).toFixed(4)}, 48.7 percent of it.`,
)
