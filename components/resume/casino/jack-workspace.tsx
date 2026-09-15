'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Control, PanelBinding, PanelSchema, PanelValue } from 'blender-to-threejs'
import { usePanel, usePanelHost } from '@/components/panels/use-panels'
import { BACKDROP_KEYS, getTune, pushUndo, recentre, saveTune, setTune, tweakEntries, TUNE_CHOICES, TUNE_DEFAULTS, TUNE_RANGES, undoTune, useTune, type Tune } from './tune'
import { JACK_COMPOSITION } from './jack-composition'
import { TUNE_LABELS } from './tune-panel'
import { JACK_ART_KEYS, JACK_EDITOR_KEYS, JACK_LETTER_PREFIXES, JACK_PARTS, JACK_TIMING_KEYS, jackSceneEditor } from './jack-scene-editor'
import { jackClockSnapshot, jackEditorTime, setJackClock, subscribeJackClock } from './jack-editor-clock'

const MAIN = 'casino-jack'
const ART = 'casino-jack-lettering'
const TIME = 'casino-jack-timing'
const BACKGROUND = 'casino-background'
const URL_OPTIONS = { url: (id: string) => `/panel/${id}?${new URLSearchParams({ theme: 'terminal', tabs: `${MAIN}:Layout|${ART}:Lettering|${TIME}:Timing|${BACKGROUND}:Background` })}` }
const rotations = new Set<keyof Tune>(['jkCardTilt', 'jkJackR', 'jkOfR', 'jkAllR', 'jkTrR'])
const factor = (key: keyof Tune) => rotations.has(key) ? 180 / Math.PI : 1
function schema(id: string, title: string, keys: (keyof Tune)[], playback = false): PanelSchema {
  const fields: Control[] = keys.map(key => {
    const choices = TUNE_CHOICES[key]
    const label = `${key === 'jkFanSpread' ? 'Four Jacks · spread' : key === 'jkFanAngle' ? 'Four Jacks · fan angle' : TUNE_LABELS[key] ?? key}${rotations.has(key) ? ' (degrees)' : ''}`
    if (choices) return { kind: 'select', key, label, options: choices.map((label, i) => ({ value: String(i), label })) }
    const [min, max, step] = TUNE_RANGES[key], scale = factor(key)
    return { kind: 'slider', key, label, min: min * scale, max: max * scale, step: rotations.has(key) ? 0.5 : step }
  })
  return { id, title, width: 480, height: 900, controls: [
    { kind: 'tree', key: 'objects', label: 'Intro hierarchy', visibility: false },
    { kind: 'snippet', key: 'selection', label: 'Selection / transform' },
    { kind: 'button', key: 'hearts', label: 'Use layered Hearts composition' },
    { kind: 'section', label: title }, ...fields,
    ...(playback ? [
      { kind: 'section', label: 'Preview timeline' },
      { kind: 'slider', key: 'previewTime', label: 'Seek (seconds)', min: 0, max: 12, step: 0.01 },
      { kind: 'readout', key: 'currentTime', label: 'Current time', precision: 2, unit: 's' },
      { kind: 'toggle', key: 'playing', label: 'Play' },
      { kind: 'toggle', key: 'loop', label: 'Loop' },
      { kind: 'button', key: 'replay', label: 'Replay intro' },
      { kind: 'button', key: 'hold', label: 'Hold title' },
    ] as Control[] : []),
    ...(id === ART ? [{ kind: 'button', key: 'tidy', label: 'Tidy lettering' }] as Control[] : []),
    { kind: 'section', label: 'Settings' },
    { kind: 'button', key: 'undo', label: 'Undo' },
    { kind: 'button', key: 'save', label: 'Save title' },
    { kind: 'button', key: 'reset', label: 'Reset these controls' },
    { kind: 'snippet', key: 'status', label: 'Status' },
    { kind: 'snippet', key: 'values', label: 'Copy title settings' },
  ] }
}
const ART_SCHEMA = schema(ART, 'Lettering', JACK_ART_KEYS.filter(key => key !== 'jkFanSpread' && key !== 'jkFanAngle'))
const TIME_SCHEMA = schema(TIME, 'Arrival timing', JACK_TIMING_KEYS, true)
const BACKGROUND_SCHEMA = schema(BACKGROUND, 'Background', BACKDROP_KEYS)

/** Same schema/transport/module shell as the model workspace; no bespoke control UI. */
export default function JackWorkspace() {
  const host = usePanelHost(URL_OPTIONS)
  const tune = useTune()
  const [selection, setSelection] = useState(jackSceneEditor.selectedId())
  const [blocked, setBlocked] = useState(false)
  const note = useRef('Select a word or card in the Outliner or viewport. G move · R roll · S scale.')
  const keys = useMemo<(keyof Tune)[]>(() => {
    const part = JACK_PARTS.find(part => part.id === selection)
    return part ? [part.x, part.y, part.s, part.r, ...('font' in part ? [part.font] : [])] : ['jkFit', 'jkLockX', 'jkLockY']
  }, [selection])
  const mainSchema = useMemo(() => schema(MAIN, selection ?? 'Whole title', keys, true), [selection, keys])
  function binding(allowed: (keyof Tune)[]): PanelBinding {
    return {
      get: () => ({ ...Object.fromEntries(allowed.map(key => [key, TUNE_CHOICES[key] ? String(getTune()[key]) : getTune()[key] * factor(key)])), previewTime: jackClockSnapshot().time, playing: jackClockSnapshot().playing, loop: jackClockSnapshot().loop }),
      set: (raw: string, value: PanelValue) => {
        if (raw === 'previewTime') { const time = Number(value); if (Number.isFinite(time)) setJackClock({ time, playing: false }); return }
        if (raw === 'playing' || raw === 'loop') { setJackClock({ [raw]: value === true }); return }
        const key = raw as keyof Tune, n = Number(value)
        if (!allowed.includes(key) || !Number.isFinite(n)) return
        pushUndo([key])
        setTune({ [key]: Math.max(TUNE_RANGES[key][0], Math.min(TUNE_RANGES[key][1], n / factor(key))) })
        note.current = 'Unsaved title changes.'
      },
      press: action => {
        if (action === 'hearts') {
          pushUndo(Object.keys(JACK_COMPOSITION) as (keyof Tune)[])
          setTune(JACK_COMPOSITION); recentre()
          note.current = 'Hearts composition applied. Undo restores your layout; Save title keeps it.'
        }
        if (action === 'save') note.current = saveTune(JACK_EDITOR_KEYS, { letterPrefixes: JACK_LETTER_PREFIXES, props: false }) < 0 ? 'Browser storage unavailable.' : 'Title saved in this browser.'
        if (action === 'undo') undoTune()
        if (action === 'reset') { pushUndo(allowed); setTune(Object.fromEntries(allowed.map(key => [key, TUNE_DEFAULTS[key]]))); note.current = 'Controls reset. Save to keep.' }
        if (action === 'replay') setJackClock({ time: 0, playing: true })
        if (action === 'hold') { const t = getTune(); setJackClock({ time: Math.min(t.jkFlick - 0.05, Math.max(t.jkTJack, t.jkTOf, t.jkTAll, t.jkTTrades) + 1.4), playing: false }) }
        if (action === 'tidy') {
          const patch = { jkFontJack: 2, jkFontOf: 2, jkFontAll: 2, jkFontTrades: 2, jkInitial: 1.05, jkVary: 0.08, jkScatter: 0.12 }
          pushUndo(Object.keys(patch) as (keyof Tune)[]); setTune(patch); note.current = 'Tidy lettering applied. Undo to restore.'
        }
      },
      trees: () => ({ objects: jackSceneEditor.tree() }),
      select: (key, id, visible) => {
        if (key === 'objects' && visible === undefined) {
          jackSceneEditor.select(id)
          document.querySelector<HTMLCanvasElement>('.jack-editor-mode canvas')?.focus()
        }
      },
      snippets: () => ({
        status: note.current,
        selection: `${jackSceneEditor.selectedId() ?? 'Whole title'}${jackSceneEditor.gesture() ? ` · ${jackSceneEditor.gesture()!.mode}` : ''}\n2D title: G (X/Y) move · R roll · S uniform scale. Type a value; Enter confirms; Esc cancels.`,
        values: JSON.stringify({ tune: Object.fromEntries(JACK_EDITOR_KEYS.map(key => [key, getTune()[key]])), letters: Object.fromEntries(JACK_LETTER_PREFIXES.flatMap(prefix => tweakEntries(prefix))) }, null, 2),
      }),
    }
  }
  usePanel(host, mainSchema, binding(keys))
  usePanel(host, ART_SCHEMA, binding(JACK_ART_KEYS))
  usePanel(host, TIME_SCHEMA, binding(JACK_TIMING_KEYS))
  usePanel(host, BACKGROUND_SCHEMA, binding(BACKDROP_KEYS))
  useEffect(() => { for (const id of [MAIN, ART, TIME, BACKGROUND]) host?.refresh(id) }, [host, tune])
  useEffect(() => jackSceneEditor.onChange(() => { setSelection(jackSceneEditor.selectedId()); for (const id of [MAIN, ART, TIME]) host?.refresh(id) }), [host])
  useEffect(() => subscribeJackClock(() => { for (const id of [MAIN, TIME]) host?.refresh(id) }), [host])
  useEffect(() => {
    const previewLoop = new URLSearchParams(window.location.search).has('loop')
    setJackClock(previewLoop ? { duration: 3.5, time: 0, playing: true, loop: true } : { duration: 12 })
    return () => { setJackClock({ playing: false }) }
  }, [])
  useEffect(() => {
    const timer = setInterval(() => {
      const time = jackEditorTime(), clock = jackClockSnapshot()
      host?.readouts(MAIN, { currentTime: time }); host?.readouts(TIME, { currentTime: time })
      if (clock.playing && !clock.loop && time >= clock.duration) setJackClock({ playing: false })
    }, 100)
    return () => { clearInterval(timer) }
  }, [host])
  return <>
    <aside className="jack-module-region"><iframe title="Jack intro module workspace" src={URL_OPTIONS.url(MAIN)} /></aside>
    <div className="jack-workspace-launch">
      <button onClick={() => setBlocked(!host?.open(MAIN))}>↗ Detach intro workspace</button>
      <span> Select in viewport or Outliner · G / R / S · Enter confirm · Esc cancel</span>
      {blocked && <p>Popup blocked. Open <a href={URL_OPTIONS.url(MAIN)} target="_blank" rel="noreferrer">the workspace</a> in a new tab.</p>}
    </div>
  </>
}
