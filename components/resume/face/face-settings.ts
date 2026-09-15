'use client'

import { useSyncExternalStore } from 'react'

export const FACE_DEFAULTS = {
  idle: true, followMouse: true, amount: 1, speed: 1, bounce: 1, elasticity: 1, acting: 1,
  jawOpen: .035, jawSide: 0, smile: .16,
  socketLeft: 0, socketRight: -.06, blinkLeft: 0, blinkRight: 0,
  browLeft: .06, browRight: .16, tiltLeft: 0, tiltRight: 0,
  headYaw: 0, headPitch: 0, headRoll: 0,
  skullSize: 1.08, squash: 0, skullWidth: 0,
}
export type FaceSettings = typeof FACE_DEFAULTS
export type FaceNumber = Exclude<keyof FaceSettings, 'idle' | 'followMouse'>
export const FACE_CONTROLS: { key: FaceNumber; label: string; min: number; max: number; step: number; group: string }[] = [
  { key: 'jawOpen', label: 'Jaw open', min: 0, max: 1, step: .01, group: 'Jaw & mouth' },
  { key: 'jawSide', label: 'Jaw side swing', min: -1, max: 1, step: .01, group: 'Jaw & mouth' },
  { key: 'smile', label: 'Frown / smile', min: -1, max: 1, step: .01, group: 'Jaw & mouth' },
  ...(['Left','Right'] as const).flatMap(side => [
    { key: `socket${side}` as FaceNumber, label: `${side} socket · narrow / wide`, min: -1, max: 1, step: .01, group: 'Sockets & brows' },
    { key: `blink${side}` as FaceNumber, label: `${side} socket · close`, min: 0, max: 1, step: .01, group: 'Sockets & brows' },
    { key: `brow${side}` as FaceNumber, label: `${side} brow · down / up`, min: -1, max: 1, step: .01, group: 'Sockets & brows' },
    { key: `tilt${side}` as FaceNumber, label: `${side} socket · tilt`, min: -1, max: 1, step: .01, group: 'Sockets & brows' },
  ]),
  { key: 'headYaw', label: 'Head turn (°)', min: -35, max: 35, step: 1, group: 'Head & skull' },
  { key: 'headPitch', label: 'Head nod (°)', min: -20, max: 20, step: 1, group: 'Head & skull' },
  { key: 'headRoll', label: 'Head tilt (°)', min: -22, max: 22, step: 1, group: 'Head & skull' },
  { key: 'skullSize', label: 'Skull size', min: .75, max: 1.3, step: .01, group: 'Head & skull' },
  { key: 'squash', label: 'Squash / stretch', min: -1, max: 1, step: .01, group: 'Head & skull' },
  { key: 'skullWidth', label: 'Narrow / wide skull', min: -1, max: 1, step: .01, group: 'Head & skull' },
  { key: 'amount', label: 'Idle expressiveness', min: 0, max: 1, step: .01, group: 'Idle animation' },
  { key: 'bounce', label: 'Up / down bounce', min: 0, max: 1.5, step: .05, group: 'Idle animation' },
  { key: 'elasticity', label: 'Continuous skull morphing', min: 0, max: 1.5, step: .05, group: 'Idle animation' },
  { key: 'acting', label: 'Expression changes', min: 0, max: 1.5, step: .05, group: 'Idle animation' },
  { key: 'speed', label: 'Idle speed', min: .5, max: 2, step: .05, group: 'Idle animation' },
]
export const FACE_PRESETS: Record<string, Partial<FaceSettings>> = {
  Neutral: { jawOpen: 0, smile: 0, socketRight: 0, browLeft: 0, browRight: 0 },
  Dealer: {},
  Showtime: { idle: true, amount: 1, bounce: 1.3, elasticity: 1.25, acting: 1.2, speed: 1.1 },
  Curious: { browLeft: .65, browRight: -.1, socketRight: -.35, headRoll: 9, jawOpen: .12 },
  Surprise: { socketLeft: .8, socketRight: .8, browLeft: .65, browRight: .65, jawOpen: .8, squash: .45, headPitch: -7, smile: 0 },
  Laugh: { socketLeft: -.65, socketRight: -.65, jawOpen: .62, smile: .7, headPitch: -5, squash: -.15 },
  Suspicious: { socketLeft: -.3, socketRight: -.45, browLeft: -.55, browRight: -.55, tiltLeft: .45, tiltRight: .45, smile: -.2, headYaw: 8 },
  Wink: { blinkLeft: .95, browRight: .35, smile: .5, jawOpen: .1, headRoll: -5 },
}

export function cleanFaceSettings(raw: unknown): FaceSettings {
  const out = { ...FACE_DEFAULTS }
  if (!raw || typeof raw !== 'object') return out
  const values = raw as Record<string, unknown>
  if (typeof values.idle === 'boolean') out.idle = values.idle
  if (typeof values.followMouse === 'boolean') out.followMouse = values.followMouse
  for (const c of FACE_CONTROLS) {
    const value = values[c.key]
    if (typeof value === 'number' && Number.isFinite(value)) out[c.key] = Math.max(c.min, Math.min(c.max, value))
  }
  return out
}

const KEY = 'casino-face-v1', CHANNEL = 'casino-face-settings-v1'
const ATTENTION_KEY = 'casino-face-attention-v2'
let settings = FACE_DEFAULTS, loaded = false
let channel: BroadcastChannel | null = null
const listeners = new Set<() => void>()
export function getFaceSettings() {
  if (!loaded && typeof window !== 'undefined') {
    loaded = true
    try { settings = cleanFaceSettings(JSON.parse(localStorage.getItem(KEY) ?? 'null')) } catch { settings = { ...FACE_DEFAULTS } }
    // Enable the requested cursor attention once for existing saved faces,
    // including older Neutral presets. Later checkbox choices remain saved.
    try {
      if (!localStorage.getItem(ATTENTION_KEY)) {
        settings = { ...settings, followMouse: true }
        localStorage.setItem(KEY, JSON.stringify(settings))
        localStorage.setItem(ATTENTION_KEY, '1')
      }
    } catch { /* A private window still uses the in-memory setting. */ }
  }
  return settings
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!channel && typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(CHANNEL)
    channel.onmessage = ({ data }) => {
      if (data?.type === 'hello') channel?.postMessage({ type: 'settings', settings: getFaceSettings() })
      if (data?.type === 'settings') {
        settings = cleanFaceSettings(data.settings)
        for (const notify of listeners) notify()
      }
    }
    channel.postMessage({ type: 'hello' })
  }
  return () => { listeners.delete(listener); if (!listeners.size) { channel?.close(); channel = null } }
}
export function useFaceSettings() { return useSyncExternalStore(subscribe, getFaceSettings, () => FACE_DEFAULTS) }
export function setFaceSettings(patch: Partial<FaceSettings>) {
  settings = cleanFaceSettings({ ...getFaceSettings(), ...patch })
  for (const notify of listeners) notify()
  channel?.postMessage({ type: 'settings', settings })
}
export function saveFaceSettings(): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(getFaceSettings())); return true } catch { return false }
}
