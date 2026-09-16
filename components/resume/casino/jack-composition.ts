/** Headline-led collage, paired with the royal-flush Hearts artwork. */
export const JACK_HEADLINE_SPAN = 2.25
export const JACK_REVEAL_RATE = 1.3
export const JACK_GRID = { columns: 9, rows: 7, width: 1.3, originCol: 4, originRow: 3 } as const
export const JACK_GRID_CENTRES = [[3, 3], [4, 3], [5, 3], [3, 4]] as const
export const JACK_SEED_LEAD = .4
/** One clean upward deal, fully offscreen at birth and flat before propagation. */
export function jackSeedAt(time: number, offscreenDistance: number) {
  const u = Math.max(0, Math.min(1, (time + JACK_SEED_LEAD) / (JACK_SEED_LEAD + .1)))
  const catchU = Math.max(0, Math.min(1, (u - .64) / .36))
  const catchEase = catchU * catchU * (3 - 2 * catchU)
  const travel = 1 - Math.max(0, 1 - u / .64) ** 3
  return { y: offscreenDistance * (travel - 1) + .16 * (1 - catchEase) * travel,
    yaw: 1.05 * (travel - 1), roll: -.28 * (1 - travel) + .065 * Math.sin(Math.PI * catchU) * (1 - catchU),
    visible: time >= -JACK_SEED_LEAD }
}

/** Analytic gravity and linear air drag, without a live physics solver. */
export function jackFallAt(time: number, index: number, launchY = 0) {
  const age = Math.max(0, time - (index * 17 % 11) * .009)
  const drag = .28 + (index * 7 % 5) * .055
  const drift = (1 - Math.exp(-drag * age)) / drag
  const side = ((index * 13 % 17) - 8) * .11
  const spin = ((index * 7 % 13) - 6) * .33
  // A hit supplies angular velocity up front; air resistance then slows it.
  // Broadside paper develops a gentle, bounded pitch as it loses upward speed.
  const flutterAge = Math.max(0, age - .3)
  const flutter = (1 - Math.exp(-flutterAge * flutterAge * 3))
    * Math.sin(flutterAge * (2.4 + index % 3 * .25))
  return { x: side * drift, y: launchY * drift - 40 / drag * (age - drift),
    yaw: spin * (1 - Math.exp(-1.1 * age)) / 1.1,
    pitch: flutter * (.22 + index % 4 * .045) * (index % 2 ? -1 : 1),
    roll: side * .65 * (age - drift), active: age > 0 }
}

/** Local punch through the wall, followed by the existing drag/gravity fall. */
export function jackBlastAt(time: number, index: number, x: number, y: number, chipSpeed = 0) {
  const distance = Math.hypot(x, y)
  const age = time - Math.min(.22, distance * .025)
  // Only the loosened paper near the puncture inherits the rising chip's
  // momentum. The wall itself never follows the camera or the chip.
  const pickup = Math.exp(-distance * distance / 50) * (1.08 + (index * 11 % 7) * .035)
  const fall = jackFallAt(age, index, chipSpeed * pickup)
  const launch = Math.max(0, age - (index * 17 % 11) * .009)
  const impulse = 17 / (1 + distance * distance * .5)
  const dragTravel = (1 - Math.exp(-2.1 * launch)) / 2.1
  const radius = Math.max(.45, distance)
  const turnU = Math.min(1, launch / .34)
  const turn = turnU * turnU * (3 - 2 * turnU)
  const direction = index % 4 < 2 ? 1 : -1
  const faceTurn = index % 2 === 0 ? direction * Math.PI : 0
  // Alternate broadside faces/backs during the readable upward beat, with
  // different pitch/roll on each card rather than a synchronized wall of backs.
  const pitch = (((index * 7) % 11) - 5) * .065 * turn + fall.pitch
  const roll = (((index * 11) % 13) - 6) * .09 * turn + fall.roll
  return { ...fall, x: fall.x + x / radius * impulse * dragTravel,
    y: fall.y + y / radius * impulse * dragTravel,
    pitch, roll,
    yaw: faceTurn * turn + fall.yaw * .35 + (x < 0 ? -1 : 1) * impulse * dragTravel * .12 }
}
/** Keeper flourish returns smoothly to its moving grid anchor at the word cue. */
export function jackKeeperAt(_time: number, _index: number, _revealAt: number) {
  return { x: 0, y: 0, yaw: 0,
    tilt: 0, roll: 0, lift: 0 }
}
/** Traveling domino folds on shared beats. The destination becomes the next
 * starting cell: no returning home or spinning around a stationary centre.
 */
export function jackEchoAt(time: number, col: number, row: number) {
  const rest = { angle: 0, lift: 0, roll: 0, active: false, x: 0, y: 0, axisX: 0, axisY: 0, qx: 0, qy: 0, qz: 0, qw: 1 }
  const start = .80
  const age = Math.max(0, Math.min(time, start + 7 / 3) - start)
  if (time <= start) return rest
  // Continue through the conversion, with selected pairs resting each beat.
  const cycles = Math.min(7, age * 3)
  const step = Math.floor(cycles), u = cycles - step
  let phase = u * u * u * (u * (u * 6 - 15) + 10)
  let cx = col - JACK_GRID.originCol, cy = JACK_GRID.originRow - row
  let turnX = 0, turnY = 0
  let qx = 0, qy = 0, qz = 0, qw = 1
  for (let i = 0; i <= step; i++) {
    // Disjoint adjacent pairs exchange cells. This is a permutation: every
    // vacated cell receives its partner, with no draining or accumulating piles.
    const horizontal = i % 2 === 0
    const offset = Math.floor(i / 2) % 2
    const cell = horizontal ? cx + 4 : 3 - cy
    const direction = (cell + offset) % 2 === 0 ? 1 : -1
    const target = cell + direction
    const lane = horizontal ? 3 - cy : cx + 4
    const pair = Math.floor(Math.min(cell, target) / 2)
    const signature = (lane * 13 + pair * 7 + i * 11) % 9
    const sourceDistance = Math.abs(cx) + Math.abs(cy)
    const targetDistance = Math.abs(cx + (horizontal ? direction : 0)) + Math.abs(cy - (horizontal ? 0 : direction))
    const unfolded = .28 + Math.max(sourceDistance, targetDistance) * .19 <= start + i / 3
    const valid = target >= 0 && target < (horizontal ? 9 : 7) && signature >= 3 && unfolded
    turnX = horizontal && valid ? direction : 0
    turnY = !horizontal && valid ? -direction : 0
    if (i === step) {
      const cohort = (lane * 3 + pair * 5 + i) % 5
      // Occupy most of the interval instead of squeezing every move into a
      // short burst. Different pairs overlap while retaining safe exchanges.
      const onset = cohort * .035
      const duration = .76 + (signature % 3) * .04
      const v = Math.max(0, Math.min(1, (u - onset) / duration))
      phase = Math.max(0, Math.min(1, v * v * v * (v * (v * 6 - 15) + 10)))
    }
    const theta = valid ? Math.PI * (i < step ? 1 : phase) : 0
    // One consistent vertical hinge, even when the card travels vertically.
    // Switching between X/Y half-turns made the printed faces corkscrew.
    const ax = 0, ay = -(turnX || turnY) * Math.sin(theta / 2), aw = Math.cos(theta / 2)
    // Accumulate completed half-turns as orientation, not as extra spins in
    // the current step. One cell of travel always earns exactly one half-turn.
    const nx = aw * qx + ax * qw + ay * qz
    const ny = aw * qy + ay * qw - ax * qz
    const nz = aw * qz + ax * qy - ay * qx
    const nw = aw * qw - ax * qx - ay * qy
    qx = nx; qy = ny; qz = nz; qw = nw
    if (i < step) { cx += turnX; cy += turnY }
  }
  // Phase already has smooth acceleration/deceleration. Easing it twice
  // created a long hesitation followed by a sharp, strobing speed peak.
  const travel = phase
  return { x: cx - (col - JACK_GRID.originCol) + turnX * travel,
    y: cy - (JACK_GRID.originRow - row) + turnY * travel,
    angle: Math.PI * phase, lift: 0,
    roll: 0, axisX: 0, axisY: -(turnX || turnY), active: time < start + 7 / 3 && (turnX !== 0 || turnY !== 0) && phase > 0 && phase < 1, qx, qy, qz, qw }
}

export function jackWallTurnTiming(col: number, row: number) {
  const distance = Math.abs(col - 4) + Math.abs(row - 3)
  const cohort = (col * 7 + row * 3) % 6
  return { start: 1.48 + cohort * .23 + distance * .035, duration: .40 + (cohort % 3) * .04 }
}

/** The title is born at the exact edge-on artwork exchange, not a second beat. */
export function jackTitleCue(index: number) {
  const [col, row] = JACK_GRID_CENTRES[index]
  const timing = jackWallTurnTiming(col, row)
  return timing.start + timing.duration / 2
}

export function jackWallRevealAt(time: number, col: number, row: number) {
  const timing = jackWallTurnTiming(col, row)
  const u = Math.max(0, Math.min(1, (time - timing.start) / timing.duration))
  return u * u * (3 - 2 * u)
}

/** Once the full Jack wall reads, turn each physical card onto its red back. */
export function jackRedBackAt(time: number, col: number, row: number) {
  const cohort = (col * 3 + row * 5) % 7
  const distance = Math.abs(col - 4) + Math.abs(row - 3)
  // The last Jack completes at 3.32: immediately pass into a tight red wave.
  const u = Math.max(0, Math.min(1, (time - 3.335 - cohort * .015 - distance * .005) / .34))
  return Math.max(0, Math.min(1, u * u * u * (u * (u * 6 - 15) + 10)))
}

/** Radial breathing and outward clearance; global winding is disabled. */
export function jackSpiralAt(time: number, x: number, y: number) {
  const angle = 0
  const radius = 1
  return { x: (x * Math.cos(angle) - y * Math.sin(angle)) * radius,
    y: (x * Math.sin(angle) + y * Math.cos(angle)) * radius, angle, scale: radius }
}
export function jackTileAt(time: number, col: number, row: number) {
  const dx = col - JACK_GRID.originCol, dy = row - JACK_GRID.originRow
  const distance = Math.abs(dx) + Math.abs(dy)
  // Every child starts flat on a fully landed, adjacent parent. A shared-edge
  // hinge unfolds it into its empty cell before it can create the next card.
  const horizontal = dx !== 0 && (dy === 0 || Math.abs(dx) >= Math.abs(dy))
  const dirX = horizontal ? Math.sign(dx) : 0
  const dirY = horizontal ? 0 : -Math.sign(dy)
  const cue = 0.10 + distance * 0.19
  const u = Math.max(0, Math.min(1, (time - cue) / 0.18))
  const open = u * u * u * (u * (u * 6 - 15) + 10)
  const falling = 0
  const closing = Math.min(1, falling / .35)
  const curl = closing * closing * (3 - 2 * closing)
  return { cue, dirX, dirY, seed: distance === 0, open, visible: time >= cue && falling < 0.85, flip: Math.PI * (1 - open),
    falling, drop: 12 * falling * falling, turn: -.42 * curl - falling * falling * (.5 + distance * .06),
    tilt: curl * (.32 + (row % 3) * .08), yaw: curl * dx * .07, retreat: curl * .35 + falling * falling * 1.2 }
}
export const JACK_CARRIERS = [
  { x: -0.72, y: 1.00, width: 1.65, roll: 0.24 },
  { x: -1.52, y: -0.22, width: 1.65, roll: 0.32 },
  { x: 0.95, y: 0.70, width: 1.65, roll: -0.25 },
  { x: 1.64, y: -0.58, width: 1.65, roll: -0.34 },
] as const

/** A smooth throw followed by one small, finite wrist correction. */
export function jackDealAt(time: number, index: number) {
  const end = 1.20 - index * 0.08
  if (time >= end) return { progress: 1, turn: 0, settle: 0, flip: 0, moving: false }
  const duration = end - 0.20
  const u = Math.max(0, Math.min(1, time / duration))
  const progress = u * u * u * (u * (6 * u - 15) + 10)
  const v = Math.max(0, Math.min(1, (time - duration) / 0.20))
  const settle = Math.sin(v * Math.PI * 2) * (1 - v) ** 2
  const flipU = Math.max(0, Math.min(1, (time - 0.16 - index * 0.015) / 0.46))
  const flipEase = flipU * flipU * (3 - 2 * flipU)
  return { progress, turn: ([-0.55, 0.65, -0.5, 0.6][index] ?? 0) * (1 - progress) + settle * (index === 3 ? 0.13 : 0.065),
    flip: (Math.PI * (1 - flipEase) - Math.sin(flipU * Math.PI) ** 2 * .32 + settle * .12) * (index % 2 ? -1 : 1),
    settle, moving: time > 0 && time < duration + 0.20 }
}

/** Two crisp cardinal legs; never interpolate X and Y simultaneously. */
export function jackCardinalAt(progress: number, index: number, sx: number, sy: number, tx: number, ty: number) {
  const ease = (v: number) => { const u = Math.max(0, Math.min(1, v)); return u * u * (3 - 2 * u) }
  const first = ease(progress * 2), second = ease(progress * 2 - 1)
  const horizontalFirst = index % 2 === 0
  return { x: sx + (tx - sx) * (horizontalFirst ? first : second),
    y: sy + (ty - sy) * (horizontalFirst ? second : first) }
}

/** Project the departure onto one approach lane: no elbow or mid-flight stop. */
export function jackStraightAt(progress: number, index: number, sx: number, sy: number, tx: number, ty: number) {
  const u = Math.max(0, Math.min(1, progress))
  return index % 2 === 0
    ? { x: sx + (tx - sx) * u, y: ty }
    : { x: tx, y: sy + (ty - sy) * u }
}

/** A near-centre passing lane, followed by the outward shutter landing. */
export function jackCrossingOffset(progress: number, index: number, edgeX: number, edgeY: number, homeX: number, homeY: number) {
  const lane = [[-0.95, 0.40], [0.25, 0.95], [0.95, -0.10], [-0.25, -0.95]][index]
  const x = lane[0] - homeX, y = lane[1] - homeY
  if (progress < 0.5) {
    const v = progress * 2
    return { x: edgeX + (x - edgeX) * v, y: edgeY + (y - edgeY) * v }
  }
  const v = (progress - 0.5) * 2
  const remaining = (1 - v) ** 2
  return { x: x * remaining, y: y * remaining }
}

/** Three quick punctuation cards skim past; no stack or emitter. */
export function jackStormAt(u: number, index: number) {
  return { x: (index === 1 ? -1 : 1) * (-1.6 + 3.2 * u),
    y: [0.65, -0.65, 0.15][index] + Math.sin(u * Math.PI) * 0.2,
    z: -0.6 - index * 0.1, roll: u * 2.2 - 0.7, yaw: u * 3, scale: 0.8 }
}
export const JACK_FAN = [
  { suit: 'clubs', x: -0.72, y: 0.02, roll: 0.42 },
  { suit: 'diamonds', x: -0.35, y: 0.13, roll: 0.21 },
  { suit: 'spades', x: 0.38, y: 0.19, roll: -0.22 },
] as const

/** Hold one face after the catch, then peel out cards in a quick alternating deal.
 * Absolute time makes editor seeking/replay deterministic; no running simulation.
 */
export function jackFanAt(time: number, landedAt: number, index: number, headlineAt = landedAt + 0.22) {
  const order = [1, 2, 0][index] ?? 0
  // Start as the offscreen headline crosses into view, then snap the fan open.
  const start = Math.max(landedAt + 0.22, headlineAt + 0.18) + order * 0.025
  const u = Math.max(0, Math.min(1, (time - start) / 0.44))
  // One continuous pull: zero velocity/acceleration at each end, no reversal.
  const open = u * u * u * (u * (6 * u - 15) + 10)
  const arc = Math.sin(Math.PI * u) ** 2
  return { visible: time > start, open, arc }
}
export const JACK_COMPOSITION = {
  jkFit: 2.00, jkLockX: 0, jkLockY: 0,
  jkFanSpread: 1.45, jkFanAngle: 1.15,
  jkCardX: -1.15, jkCardY: 0.65, jkCardW: 1.30, jkCardTilt: 0.18,
  jkJackX: 0.35, jkJackY: -0.10, jkJackS: 0.86, jkJackR: -0.13,
  jkOfX: -0.43, jkOfY: 0.08, jkOfS: 0.46, jkOfR: -0.15,
  jkAllX: 0.92, jkAllY: 0.24, jkAllS: 0.59, jkAllR: 0.14,
  jkTrX: 0.02, jkTrY: -0.74, jkTrS: 0.65, jkTrR: -0.045,
  jkInitial: 1.12, jkVary: 0.11, jkScatter: 0.15,
  jkFontJack: 0, jkFontOf: 2, jkFontAll: 0, jkFontTrades: 0, jkSeed: 7,
  jkTCardIn: 0.55, jkTCardLand: 1.28,
  jkTJack: jackTitleCue(0), jkTOf: jackTitleCue(1), jkTAll: jackTitleCue(2), jkTTrades: jackTitleCue(3),
  // The red wave completes at ~3.23s: let its finish lead straight into the flick.
  jkFlick: 3.25,
} as const

/** Cancel perspective magnification without flattening the depth ordering. */
export function jackPaperProjection(distance: number, fit: number, depth: number) {
  return Math.max(0.15, (distance - fit * depth) / distance)
}

export type JackBounds = { left: number; right: number; bottom: number; top: number }
/** Center the complete card-and-type silhouette with equal opposing margins. */
export function jackFraming(all: JackBounds, _text: JackBounds) {
  const x = (all.left + all.right) / 2
  const y = (all.bottom + all.top) / 2
  return { x: -x, y: -y, halfWidth: Math.max(x - all.left, all.right - x), halfHeight: Math.max(y - all.bottom, all.top - y) }
}
export function includeJackRect(bounds: JackBounds, x: number, y: number, width: number, height: number, roll: number) {
  const c = Math.abs(Math.cos(roll)), s = Math.abs(Math.sin(roll))
  const hw = (width * c + height * s) / 2, hh = (width * s + height * c) / 2
  bounds.left = Math.min(bounds.left, x - hw); bounds.right = Math.max(bounds.right, x + hw)
  bounds.bottom = Math.min(bounds.bottom, y - hh); bounds.top = Math.max(bounds.top, y + hh)
}
