'use client'

import { EYE_INKS, type EyeInk } from './eye'

export type EyePlacement = { x: number; y: number; size: number; roll: number; depth?: number; tilt?: number; yaw?: number; sx?: number; sy?: number; sz?: number }
export type TitleEye = EyePlacement & { ink: EyeInk; removed?: boolean }
export const TITLE_EYES: (EyePlacement & { ink: EyeInk })[] = [
  {
    x: -0.8160550525700935, y: 0.7430083144368859, size: 0.248,
    roll: 0.23362921745548623, ink: 'red', depth: -7.047314121155779e-18,
    tilt: -1.6174439750177408e-18, yaw: 1.3783209692462872e-17,
  },
  {
    x: -0.8568158586448598, y: 0.3645290060468632, size: 0.12,
    roll: 0.24439077716487653, ink: 'gold', depth: 3.9898639947466563e-17,
    tilt: -4.228961548709524e-19, yaw: 3.44357677344583e-18,
  },
  {
    x: 0.8622415303738318, y: 0.29599277210884356, size: 0.1583376888576711,
    roll: -0.40480135962165453, ink: 'green', depth: 8.890457814381136e-18,
    sx: 1.0000000000000002, sy: 1.0000000000000002, sz: 1.0000000000000002,
    tilt: 5.1588256840579685e-17, yaw: -2.4753437369559124e-17,
  },
  {
    x: 0.8119304906542056, y: 0.7622583616780045, size: 0.2887596909669038,
    roll: -0.44891567851977504, ink: 'blue', tilt: -3.0148212827470585e-17,
    yaw: -7.351886526814445e-18, depth: -6.114900252818245e-17,
    sx: 1, sy: 1, sz: 1,
  },
]
// The approved composition starts a new editing revision; older drafts remain
// in their original storage key rather than overriding the published layout.
export const EYE_STORAGE_KEY = 'casino-title-eyes-v2'
export const EYE_BOUNDS = { x: [-1.5, 1.5], y: [-1.5, 1.5], size: [0.02, 0.6], roll: [-Math.PI, Math.PI], depth: [-12, 12], tilt: [-Math.PI, Math.PI], yaw: [-Math.PI, Math.PI], sx: [-10, 10], sy: [-10, 10], sz: [-10, 10] } as const
const defaults = (): TitleEye[] => TITLE_EYES.map(eye => ({ ...eye }))
let placements = defaults(), loaded = false
let preview = false
const listeners = new Set<() => void>()
const history: TitleEye[][] = []
const emit = () => { listeners.forEach(listener => listener()) }
export const isTitleEyeEditor = () => typeof window !== 'undefined' && window.location.pathname.replace(/\/$/, '') === '/resume/eyes'
export function getTitleEyes() {
  if (!loaded && typeof window !== 'undefined') {
    loaded = true
    try {
      const saved = JSON.parse(localStorage.getItem(EYE_STORAGE_KEY) ?? 'null')
      if (Array.isArray(saved)) placements = saved.map((eye, i) => sanitize(TITLE_EYES[i] ?? { x: 0, y: 0.25, size: 0.12, roll: 0, ink: 'gold' }, eye))
    } catch { /* A missing or invalid saved layout uses the authored defaults. */ }
  }
  return placements
}
function sanitize(eye: TitleEye, patch: Partial<TitleEye>): TitleEye {
  const next = { ...eye }
  for (const key of Object.keys(EYE_BOUNDS) as (keyof EyePlacement)[]) {
    const value = patch?.[key], [min, max] = EYE_BOUNDS[key]
    if (typeof value === 'number' && Number.isFinite(value)) next[key] = Math.max(min, Math.min(max, value))
  }
  if (EYE_INKS.includes(patch?.ink as EyeInk)) next.ink = patch.ink!
  if (typeof patch?.removed === 'boolean') next.removed = patch.removed
  return next
}
export function setTitleEye(index: number, patch: Partial<TitleEye>) {
  const current = getTitleEyes()
  if (!current[index]) return
  placements = current.map((eye, i) => i === index ? sanitize(eye, patch) : eye)
  emit()
}
export const snapshotTitleEyes = () => getTitleEyes().map(eye => ({ ...eye }))
export function rememberTitleEyes(before = snapshotTitleEyes()) { history.push(before); if (history.length > 100) history.shift() }
export function undoTitleEyes() { const previous = history.pop(); if (previous) { placements = previous; emit() } }
export function resetTitleEye(index: number) { rememberTitleEyes(); setTitleEye(index, { ...(TITLE_EYES[index] ?? { x: 0, y: 0.25, size: 0.12, roll: 0 }), depth: 0, tilt: 0, yaw: 0, sx: 1, sy: 1, sz: 1 }) }
/** Preserve object indices in saved layouts and undo history when deleting. */
export function removeTitleEye(index: number) { if (!getTitleEyes()[index]) return; rememberTitleEyes(); setTitleEye(index, { removed: true }) }
export function addTitleEye(ink: EyeInk, source?: number) {
  const current = getTitleEyes(), original = source === undefined ? undefined : current[source]
  rememberTitleEyes()
  const eye = original ? sanitize(original, { x: original.x + 0.08, y: original.y - 0.06, removed: false }) : { x: 0, y: 0.3, size: 0.12, roll: 0, ink }
  const index = current.length
  placements = [...current, eye]
  emit()
  return index
}
export function saveTitleEyes() {
  try { localStorage.setItem(EYE_STORAGE_KEY, JSON.stringify(getTitleEyes())); return true } catch { return false }
}
export function subscribeTitleEyes(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
export const previewTitleEyes = () => preview
export function setTitleEyePreview(value: boolean) { preview = value; emit() }
