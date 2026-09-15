'use client'

import { SceneEditor } from 'blender-to-threejs'
import type { Object3D } from 'three'
import { BACKDROP_KEYS, getTune, popUndo, pushUndo, setTune, TUNE_RANGES, type Tune } from './tune'
import { jackClockSnapshot } from './jack-editor-clock'

export const jackSceneEditor = new SceneEditor()
export const JACK_PARTS = [
  { id: 'card', name: 'Jack card', x: 'jkCardX', y: 'jkCardY', r: 'jkCardTilt', s: 'jkCardW' },
  { id: 'JACK', name: 'JACK', x: 'jkJackX', y: 'jkJackY', r: 'jkJackR', s: 'jkJackS', font: 'jkFontJack' },
  { id: 'of', name: 'of', x: 'jkOfX', y: 'jkOfY', r: 'jkOfR', s: 'jkOfS', font: 'jkFontOf' },
  { id: 'ALL', name: 'ALL', x: 'jkAllX', y: 'jkAllY', r: 'jkAllR', s: 'jkAllS', font: 'jkFontAll' },
  { id: 'TRADES', name: 'TRADES', x: 'jkTrX', y: 'jkTrY', r: 'jkTrR', s: 'jkTrS', font: 'jkFontTrades' },
] as const
export const JACK_LAYOUT_KEYS: (keyof Tune)[] = ['jkFit', 'jkLockX', 'jkLockY', ...JACK_PARTS.flatMap(part => [part.x, part.y, part.r, part.s, ...('font' in part ? [part.font] : [])])]
export const JACK_ART_KEYS: (keyof Tune)[] = ['jkSeed', 'jkInitial', 'jkVary', 'jkScatter', 'jkFanSpread', 'jkFanAngle']
export const JACK_TIMING_KEYS: (keyof Tune)[] = ['jkTCardIn', 'jkTCardLand', 'jkTJack', 'jkTOf', 'jkTAll', 'jkTTrades']
export const JACK_EDITOR_KEYS = [...JACK_LAYOUT_KEYS, ...JACK_ART_KEYS, ...JACK_TIMING_KEYS, ...BACKDROP_KEYS]
export const JACK_LETTER_PREFIXES = ['JACK:', 'of:', 'ALL:', 'TRADES:']

/** Store-backed planar title transforms. This is 2D authoring, not arbitrary model TRS. */
export function registerJackPart(part: typeof JACK_PARTS[number], object: Object3D, unitsPerPixel: () => number) {
  let start: Partial<Tune> | null = null
  const keys = [part.x, part.y, part.r, part.s]
  const clamp = (key: keyof Tune, value: number) => Math.max(TUNE_RANGES[key][0], Math.min(TUNE_RANGES[key][1], value))
  return jackSceneEditor.add(part.id, object, { name: part.name, transform: {
    enabled: () => !jackClockSnapshot().playing,
    onBegin: () => { start = Object.fromEntries(keys.map(key => [key, getTune()[key]])); pushUndo(keys) },
    onUpdate: gesture => {
      if (!start) return
      const fine = gesture.fine ? 0.15 : 1
      if (gesture.mode === 'move') {
        const dx = gesture.axis === 'y' ? 0 : gesture.exact ?? gesture.dx * unitsPerPixel() * fine
        const dy = gesture.axis === 'x' || (gesture.exact !== null && !gesture.axis) ? 0 : gesture.exact ?? -gesture.dy * unitsPerPixel() * fine
        setTune({ [part.x]: clamp(part.x, start[part.x]! + dx), [part.y]: clamp(part.y, start[part.y]! + dy) })
      } else if (gesture.mode === 'scale') {
        setTune({ [part.s]: clamp(part.s, start[part.s]! * (gesture.exact ?? 1 - gesture.dy * 0.005 * fine)) })
      } else {
        const angle = gesture.exact !== null ? gesture.exact * Math.PI / 180 : gesture.dx * 0.006 * fine
        setTune({ [part.r]: clamp(part.r, start[part.r]! + angle) })
      }
    },
    onCancel: () => { if (start) { setTune(start); popUndo() }; start = null },
    onCommit: () => { start = null },
  } })
}
