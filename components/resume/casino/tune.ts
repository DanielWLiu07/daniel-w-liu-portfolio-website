'use client'

/**
 * Live layout knobs for the casino set. Values come from URL params (?chip=1.6&table=9.5...),
 * and with ?tune a slider panel edits them in place. A tiny external store so the scene
 * (inside the Canvas) and the panel (DOM) share one source without prop drilling.
 */
import { useSyncExternalStore } from 'react'

export interface Tune {
  /** chip diameter multiplier */
  chip: number
  /** table diameter (world units) */
  table: number
  /** rail width past the felt */
  rail: number
  /** dealer edge offset behind the arc centre (negative = away from camera) */
  chord: number
  /** camera height above the felt */
  camY: number
  /** camera distance toward the viewer */
  camZ: number
  /** height of the camera's aim point above the felt */
  lookY: number
  /** the one lamp: height above the felt and cone half-angle (degrees) */
  lampH: number
  lampCone: number
  /** reveal front noise (1 = pomme); higher = blotchier, more painterly */
  revealNoise: number
  /** reveal radial weight (1 = pomme); higher = one front travelling out (wet bloom) */
  revealRadial: number
  /** width of the wet front */
  revealSoft: number
  /** the title rainbow: outer radius, angular span (rad), letter size, centre height above the felt, gap to the inner arc */
  titleR: number
  titleSpan: number
  titleSize: number
  titleY: number
  titleGap: number
  /** world units per letter slot (arc length follows the text; radius sets the curve) */
  titleSpacing: number
  /** stroke thickness in canvas px */
  titleWeight: number
  /* The presented folder, in the SCREEN's own axes rather than the world's. It builds its pose from the
     camera's basis and frames itself off the camera's fov and aspect, so every one of these is a plain
     up/down or left/right in the shot and a proportion rather than a position: they hold on any window
     shape and at any camera angle. */
  /** how much room to leave around the spread: 1 fills the frame exactly, higher pulls it back */
  fldFit: number
  /** move it UP the screen (negative: down), as a fraction of its own height */
  fldUp: number
  /** move it RIGHT across the screen (negative: left), as a fraction of its own width */
  fldSide: number
  /** tilt up/down: positive tips the TOP toward you, negative leans it back so you read up its face */
  fldLean: number
  /** turn left/right: positive turns it to the right, bringing its left edge toward you */
  fldSpin: number
  /** how far the cover swings, as a fraction of a half turn: below 1 leaves a visible crease */
  fldTurn: number
  /** how hard the pointer tips it (radians at the screen edge). Rotation only: the pointer never moves it */
  fldTilt: number
  /** the idle float: how far it rises and falls, as a fraction of its own height */
  fldFloat: number
  /** how far hovering lifts it, as a fraction of its own height */
  fldRise: number
}

export const TUNE_DEFAULTS: Tune = { chip: 1.6, table: 24, rail: 0.7, chord: -4.5, camY: 4.6, camZ: 12.5, lookY: 1.4, lampH: 7.5, lampCone: 33, revealNoise: 0.3, revealRadial: 2.2, revealSoft: 0.3, titleR: 6.5, titleSpan: 2.1, titleSize: 2.0, titleY: -2.6, titleGap: 1.4, titleSpacing: 0.62, titleWeight: 6, fldFit: 1.18, fldUp: -0.05, fldSide: 0, fldLean: -0.28, fldSpin: 0, fldTurn: 0.945, fldTilt: 0.09, fldFloat: 0.014, fldRise: 0.035 }

export const TUNE_RANGES: Record<keyof Tune, [number, number, number]> = {
  chip: [0.5, 4, 0.05],
  table: [4, 60, 0.1],
  rail: [0.1, 2, 0.05],
  chord: [-20, 2, 0.05],
  camY: [1, 40, 0.1],
  camZ: [3, 60, 0.1],
  lookY: [-2, 8, 0.1],
  lampH: [2, 20, 0.1],
  lampCone: [8, 80, 0.5],
  revealNoise: [0, 3, 0.05],
  revealRadial: [0, 5, 0.05],
  revealSoft: [0.02, 0.6, 0.01],
  titleR: [1, 8, 0.05],
  titleSpan: [0.5, 3.1, 0.02],
  titleSize: [0.5, 4, 0.05],
  titleY: [-2, 6, 0.05],
  titleGap: [0.3, 3, 0.05],
  titleSpacing: [0.2, 1.6, 0.01],
  titleWeight: [1, 14, 0.5],
  fldFit: [0.9, 2.2, 0.01],
  fldUp: [-0.5, 0.5, 0.005],
  fldSide: [-0.5, 0.5, 0.005],
  fldLean: [-0.9, 0.9, 0.01],
  fldSpin: [-0.9, 0.9, 0.01],
  fldTurn: [0.7, 1, 0.005],
  fldTilt: [0, 0.4, 0.005],
  fldFloat: [0, 0.08, 0.002],
  fldRise: [0, 0.2, 0.005],
}

/** just the presented folder, for the slim panel on the site itself (?fld) */
export const FOLDER_KEYS: (keyof Tune)[] = ['fldFit', 'fldUp', 'fldSide', 'fldLean', 'fldSpin', 'fldTurn', 'fldTilt', 'fldFloat', 'fldRise']

function fromUrl(): Tune {
  const t = { ...TUNE_DEFAULTS }
  if (typeof window === 'undefined') return t
  const q = new URLSearchParams(window.location.search)
  for (const k of Object.keys(t) as (keyof Tune)[]) {
    const v = q.get(k)
    if (v !== null && !Number.isNaN(Number(v))) t[k] = Number(v)
  }
  return t
}

let state: Tune = TUNE_DEFAULTS
let loaded = false
const subs = new Set<() => void>()

function ensure() {
  if (!loaded && typeof window !== 'undefined') {
    state = fromUrl()
    loaded = true
  }
  return state
}

export function getTune(): Tune {
  return ensure()
}

export function setTune(patch: Partial<Tune>) {
  state = { ...ensure(), ...patch }
  for (const s of subs) s()
}

export function useTune(): Tune {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => ensure(),
    () => TUNE_DEFAULTS,
  )
}

/** the current values as a query string, to paste back into the URL */
export function tuneQuery(): string {
  const t = ensure()
  return (Object.keys(t) as (keyof Tune)[]).map((k) => `${k}=${t[k]}`).join('&')
}

/** the table reveal runs on pomme's soak curve slowed by this factor (0.6 = the bloom takes ~7 s to the far corners) */
export const REVEAL_TIME_SCALE = 2.0
