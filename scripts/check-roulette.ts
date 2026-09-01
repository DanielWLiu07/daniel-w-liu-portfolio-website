/**
 * Is this actually a roulette wheel?
 *
 * A wheel has rules, so they can be asserted rather than eyeballed:
 *   37 pockets, 0 through 36, each exactly once
 *   red and black STRICTLY alternate all the way round, with 0 the only green
 *   zero sits between 26 and 32
 *   high and low alternate everywhere but one place, between 10 and 5
 *   the 18 red numbers are the standard set
 *   the ball always ends inside a pocket, never on a fret and never off the head
 *   the ball is on the track while it is fast and in a pocket once it is slow
 *   the motion is continuous: no teleport between one instant and the next
 *
 * A wheel with the numbers in the wrong order renders perfectly and is wrong to
 * anyone who has stood at a table.
 *
 *   npx tsx scripts/check-roulette.ts
 */
import {
  DEFAULTS,
  DIMS,
  POCKETS,
  POCKET_ARC,
  POCKET_RADIUS,
  RED_NUMBERS,
  WHEEL_ORDER,
  cycleAt,
  pocketColour,
  resultOf,
  spinAt,
} from '../components/resume/casino/roulette'

const fail: string[] = []

// 37 pockets, 0..36, each exactly once
if (POCKETS !== 37) fail.push(`expected 37 pockets, got ${POCKETS}`)
const seen = new Set(WHEEL_ORDER)
if (seen.size !== WHEEL_ORDER.length) fail.push('the wheel repeats a number')
for (let n = 0; n <= 36; n++) if (!seen.has(n)) fail.push(`the wheel is missing ${n}`)

// the standard red set
if (RED_NUMBERS.size !== 18) fail.push(`expected 18 red numbers, got ${RED_NUMBERS.size}`)
for (const n of RED_NUMBERS) if (n < 1 || n > 36) fail.push(`${n} cannot be red`)
if (pocketColour(0) !== 'green') fail.push('zero must be green')
const blacks = WHEEL_ORDER.filter((n) => pocketColour(n) === 'black').length
if (blacks !== 18) fail.push(`expected 18 black numbers, got ${blacks}`)

// red and black strictly alternate around the wheel, skipping the green zero
{
  const ring = WHEEL_ORDER.filter((n) => n !== 0).map(pocketColour)
  // zero sits between 26 and 32, so the sequence either side of it must still
  // flip: dropping the green out of the ring is what makes that testable
  for (let i = 0; i < ring.length; i++) {
    if (ring[i] === ring[(i + 1) % ring.length]) {
      fail.push(`two ${ring[i]} pockets are adjacent at position ${i}`)
      break
    }
  }
}

// zero sits between 26 and 32. A one number signature of the real sequence.
{
  const z = WHEEL_ORDER.indexOf(0)
  const before = WHEEL_ORDER[(z - 1 + POCKETS) % POCKETS]
  const after = WHEEL_ORDER[(z + 1) % POCKETS]
  if (!(before === 26 && after === 32) && !(before === 32 && after === 26)) {
    fail.push(`zero sits between ${before} and ${after}, should be 26 and 32`)
  }
}

// high (19-36) and low (1-18) alternate everywhere except ONE place, between 10
// and 5. This is a real property of the single zero wheel and it is what tells
// the true sequence apart from a plausible looking shuffle of it.
//
// The often repeated claim that consecutive numbers sit opposite each other is
// NOT one of its properties. Asserting it here failed, and measuring said why:
// only 3 of the 18 pairs are near opposite, and with 37 pockets nothing has an
// exact opposite anyway.
{
  const ring = WHEEL_ORDER.filter((n) => n !== 0)
  const breaks: string[] = []
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    if (a <= 18 === b <= 18) breaks.push(`${a}/${b}`)
  }
  // the pair straddling where zero was removed is an artefact of removing it
  const real = breaks.filter((p) => p !== '26/32' && p !== '32/26')
  if (real.length !== 1 || real[0] !== '10/5') {
    fail.push(`high/low should break once, at 10/5; breaks at ${real.join(', ') || 'nowhere'}`)
  }
}

// the ball ends inside a pocket, and it is the pocket the state reports
const o = DEFAULTS
let onFret = 0
const results = new Map<number, number>()
for (let cycle = 0; cycle < 400; cycle++) {
  const s = spinAt(o.period, cycle)
  if (s.phase !== 'settled') fail.push(`cycle ${cycle} has not settled by the end of its period`)
  if (s.pocket === null || s.result === null) {
    fail.push(`cycle ${cycle} settled with no pocket`)
    continue
  }
  if (s.result !== WHEEL_ORDER[s.pocket]) fail.push(`cycle ${cycle} reports ${s.result} in pocket ${s.pocket}`)
  results.set(s.result, (results.get(s.result) ?? 0) + 1)
  // the settled ball must sit on a pocket CENTRE in the wheel's own frame, not
  // straddling a fret
  const rel = s.ballAngle - s.wheel
  const off = Math.abs(((rel / POCKET_ARC) % 1 + 1.5) % 1 - 0.5)
  if (off > 1e-9) onFret++
  if (Math.abs(s.ballRadius - POCKET_RADIUS) > 1e-9) fail.push(`cycle ${cycle} settled at radius ${s.ballRadius}`)
  if (s.ballRadius > DIMS.head || s.ballRadius < DIMS.hub) fail.push(`cycle ${cycle} settled off the wheel head`)
}
if (onFret) fail.push(`${onFret} spins settled on a fret rather than in a pocket`)

// the spin visits a decent spread of numbers rather than a handful
if (results.size < 20) fail.push(`400 spins only ever landed on ${results.size} of the 37 numbers`)

// phases run in order, and the ball is where the phase says it is
{
  const steps = 600
  let prevPhase = ''
  const order: string[] = []
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * o.period
    const s = spinAt(t, 3)
    if (s.phase !== prevPhase) {
      order.push(s.phase)
      prevPhase = s.phase
    }
    if (s.phase === 'track' && Math.abs(s.ballRadius - DIMS.track) > 1e-9) {
      fail.push('the ball left the track radius while still on the track')
    }
    if (s.ballRadius > DIMS.bowl) fail.push('the ball went outside the bowl')
    if (s.ballRadius < DIMS.hub - 1e-9) fail.push('the ball went inside the hub')
    if (s.ballHeight < DIMS.floor - 1e-6) fail.push('the ball went through the floor')
  }
  if (order.join(' -> ') !== 'track -> fall -> settled') {
    fail.push(`phases ran ${order.join(' -> ')}, expected track -> fall -> settled`)
  }
}

// continuity: no teleport. The ball's world position must not jump between
// adjacent instants, which is what catches a bad blend across a phase boundary.
{
  const steps = 4000
  let worst = 0
  let worstAt = 0
  let prev: [number, number, number] | null = null
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * o.period
    const s = spinAt(t, 3)
    const p: [number, number, number] = [
      Math.cos(s.ballAngle) * s.ballRadius,
      s.ballHeight,
      Math.sin(s.ballAngle) * s.ballRadius,
    ]
    if (prev) {
      const d = Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2])
      if (d > worst) {
        worst = d
        worstAt = t
      }
    }
    prev = p
  }
  // the ball is fastest on the track: 13.5 rad/s at radius 0.855 over a
  // 15/4000 s step is about 0.043 of the bowl radius, so anything past twice
  // that is a jump and not travel
  const budget = (Math.abs(o.ballSpeed) * DIMS.track * o.period) / steps * 2
  console.log(`largest step in the ball's position: ${worst.toFixed(5)} at t=${worstAt.toFixed(2)}s (budget ${budget.toFixed(5)})`)
  if (worst > budget) fail.push(`the ball jumps ${worst.toFixed(4)} at t=${worstAt.toFixed(2)}s`)
}

// the head never jumps. A wheel that snaps back at the seam between two spins is
// the least realistic thing this can do, and no single frame shows it, so it has
// to be checked across the boundary rather than looked at.
{
  const tau = Math.PI * 2
  const wrap = (a: number) => ((a % tau) + tau) % tau
  let worst = 0
  for (let cycle = 0; cycle < 20; cycle++) {
    const before = spinAt(o.period - 1e-4, cycle).wheel
    const after = spinAt(0, cycle + 1).wheel
    // compare the raw angles, not the wrapped ones: continuity here means the
    // running total carries over, and wrapping would hide a whole extra turn
    const gap = Math.abs(after - before)
    if (gap > worst) worst = gap
    const shown = Math.abs(wrap(after) - wrap(before))
    if (shown > 1e-3 && shown < tau - 1e-3) {
      fail.push(`the head jumps ${(shown * 180 / Math.PI).toFixed(0)} degrees between cycle ${cycle} and ${cycle + 1}`)
      break
    }
  }
  console.log(`largest step in the head's angle across a cycle seam: ${worst.toExponential(2)} rad`)
  // and it must actually still be turning at the end of a spin
  const late = spinAt(o.period, 0).wheel - spinAt(o.period - 0.5, 0).wheel
  if (late / 0.5 < 0.5) fail.push(`the head has all but stopped by the end of a spin: ${(late / 0.5).toFixed(2)} rad/s`)
  console.log(`     head speed at the end of a spin: ${(late / 0.5).toFixed(2)} rad/s, so it is still running when the next one starts`)
}

// the cycle clock hands back the same spin the raw one does
{
  const c = cycleAt(o.period * 2.5)
  if (c.cycle !== 2) fail.push(`cycleAt gave cycle ${c.cycle}, expected 2`)
  if (Math.abs(c.t - o.period * 0.5) > 1e-9) fail.push('cycleAt gave the wrong time within the cycle')
  if (resultOf(7) !== spinAt(o.period, 7).result) fail.push('resultOf disagrees with spinAt')
}

if (fail.length) {
  console.error('FAIL')
  for (const f of fail) console.error('  ' + f)
  process.exit(1)
}
console.log(
  `OK: 37 pockets 0-36, red and black strictly alternate, zero sits between 26 and 32, high and low break ` +
    `only at 10/5, ` +
    `the ball always settles in a pocket centre and never on a fret, phases run track -> fall -> settled, ` +
    `and the path is continuous.`,
)
console.log(`     400 spins landed on ${results.size} different numbers.`)

// the wheel has to be buildable: the pocket floor must sit ABOVE the bowl's
// underside, or the whole head is below the table and the felt draws over it.
// This is exactly what broke when the bowl was thinned and base moved up.
if (DIMS.floor <= DIMS.base) {
  console.error(`FAIL\n  the pocket floor ${DIMS.floor} is not above the bowl's base ${DIMS.base}`)
  process.exit(1)
}
if (DIMS.floor + DIMS.fret >= DIMS.wall) {
  console.error(`FAIL\n  the frets stand ${(DIMS.floor + DIMS.fret).toFixed(3)}, at or above the bowl's rim ${DIMS.wall}`)
  process.exit(1)
}
if (!(DIMS.hub < DIMS.head && DIMS.head < DIMS.deflector && DIMS.deflector < DIMS.track && DIMS.track < DIMS.bowl)) {
  console.error('FAIL\n  the radii are not in order hub < head < deflector < track < bowl')
  process.exit(1)
}
console.log(
  `     profile: base ${DIMS.base}, floor ${DIMS.floor}, rim ${DIMS.wall}; radii hub ${DIMS.hub} < head ${DIMS.head} < deflector ${DIMS.deflector} < track ${DIMS.track} < bowl ${DIMS.bowl}.`,
)
