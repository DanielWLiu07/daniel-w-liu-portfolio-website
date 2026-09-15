'use client'

import { useEffect, useRef, useState } from 'react'
import type { Control, PanelBinding, PanelSchema, PanelValue } from 'blender-to-threejs'
import { usePanel, usePanelHost } from '@/components/panels/use-panels'
import { BACKDROP_KEYS, FLIGHT_KEYS, ROULETTE_KEYS, ROYAL_FLUSH_KEYS, TUNE_CHOICES, TUNE_DEFAULTS, TUNE_RANGES, getTune, saveTune, setTune, useTune, type Tune } from './tune'
import { TUNE_LABELS } from './tune-panel'
import { flightEditor } from './flight-editor'
import { DEALER_ALL_KEYS } from './dealer-layout'

function schema(id: string, title: string, keys: (keyof Tune)[]): PanelSchema {
  const controls: Control[] = keys.map(key => {
    const label = TUNE_LABELS[key] ?? key
    const choices = TUNE_CHOICES[key]
    if (choices) return { kind: 'select', key, label, options: choices.map((label, i) => ({ value: String(i), label })) }
    const [min, max, step] = TUNE_RANGES[key]
    return { kind: 'slider', key, label, min, max, step }
  })
  return { id, title, width: 480, height: 820, controls: [
    { kind: 'tree', key: 'objects', label: 'Scene hierarchy', visibility: false },
    { kind: 'section', label: title }, ...controls,
    { kind: 'section', label: 'Settings' },
    { kind: 'button', key: 'save', label: 'Save in this browser' },
    { kind: 'button', key: 'reset', label: 'Reset this editor' },
    { kind: 'snippet', key: 'status', label: 'Status' },
    { kind: 'snippet', key: 'values', label: 'Copy settings' },
  ] }
}

const ROULETTE = schema('casino-roulette', 'Roulette', ROULETTE_KEYS)
const ROYAL_FLUSH = schema('casino-royal-flush', 'Royal flush', ROYAL_FLUSH_KEYS)
const FLIGHT = schema('casino-flight', 'Chip & camera', FLIGHT_KEYS)
const BACKGROUND = schema('casino-background', 'Background', BACKDROP_KEYS)
const CHARACTER = schema('casino-dealer', 'Character layout', DEALER_ALL_KEYS)
const WINDOW_OPTIONS = {
  url: (id: string) => `/panel/${id}?${new URLSearchParams({
    tabs: `${ROULETTE.id}:Roulette|${ROYAL_FLUSH.id}:Royal flush|${BACKGROUND.id}:Background|${FLIGHT.id}:Chip & camera|${CHARACTER.id}:Character layout|cartoon-face:Cartoon face|motion-capture:Webcam motion`, theme: 'terminal',
  })}`,
}

/** Scene-side bindings only: the reusable tool window owns all control UI. */
export default function FlightWorkspace() {
  const host = usePanelHost(WINDOW_OPTIONS)
  const tune = useTune()
  const note = useRef<Record<string, string>>({})
  const [blocked, setBlocked] = useState(false)
  const [transformStatus, setTransformStatus] = useState('Select a prop in the hierarchy or viewport')
  function binding(panel: PanelSchema, keys: (keyof Tune)[]): PanelBinding {
    return {
      get: () => Object.fromEntries(keys.map(key => [key, TUNE_CHOICES[key] ? String(getTune()[key]) : getTune()[key]])),
      set: (raw: string, value: PanelValue) => {
        const key = raw as keyof Tune
        if (!keys.includes(key)) return
        const v = Number(value)
        if (!Number.isFinite(v)) return
        const [min, max] = TUNE_RANGES[key]
        setTune({ [key]: Math.min(max, Math.max(min, v)) })
        note.current[panel.id] = 'Unsaved changes — preview updates live.'
      },
      press: key => {
        if (key === 'save') note.current[panel.id] = saveTune(keys) < 0 ? 'Browser storage unavailable. Copy settings to keep them.' : 'Saved. These settings survive a scene reload.'
        if (key === 'reset') {
          setTune(Object.fromEntries(keys.map(k => [k, TUNE_DEFAULTS[k]])))
          note.current[panel.id] = 'Defaults restored. Save to keep this reset.'
        }
      },
      snippets: () => ({
        status: note.current[panel.id] ?? 'Preview updates live. Save to keep your changes.',
        values: keys.map(key => `${key}: ${getTune()[key]},`).join('\n'),
      }),
      trees: () => ({ objects: flightEditor.tree() }),
      select: (key, id, visible) => {
        if (key === 'objects' && visible === undefined) flightEditor.select(id)
      },
    }
  }
  usePanel(host, ROULETTE, binding(ROULETTE, ROULETTE_KEYS))
  usePanel(host, ROYAL_FLUSH, binding(ROYAL_FLUSH, ROYAL_FLUSH_KEYS))
  usePanel(host, FLIGHT, binding(FLIGHT, FLIGHT_KEYS))
  usePanel(host, BACKGROUND, binding(BACKGROUND, BACKDROP_KEYS))
  usePanel(host, CHARACTER, binding(CHARACTER, DEALER_ALL_KEYS))
  useEffect(() => {
    host?.refresh(ROULETTE.id)
    host?.refresh(ROYAL_FLUSH.id)
    host?.refresh(FLIGHT.id)
    host?.refresh(BACKGROUND.id)
    host?.refresh(CHARACTER.id)
  }, [host, tune])
  useEffect(() => flightEditor.onChange(() => {
    const gesture = flightEditor.gesture()
    setTransformStatus(gesture
      ? `${gesture.mode.toUpperCase()} · ${gesture.trackball ? 'trackball' : gesture.axis ? `${gesture.orientation} ${gesture.plane ? 'exclude ' : ''}${gesture.axis.toUpperCase()}` : 'free'}${gesture.exact !== null ? ` · ${gesture.exact}${gesture.mode === 'rotate' ? '°' : ''}` : ''}${gesture.snap ? ' · snap' : ''}${gesture.fine ? ' · precision' : ''}`
      : flightEditor.selectedId() === 'roulette' ? 'Roulette selected' : flightEditor.selectedId() === 'royal-flush' ? 'Royal flush selected' : 'Select a prop in the hierarchy or viewport')
    host?.refresh(ROULETTE.id)
    host?.refresh(ROYAL_FLUSH.id)
    host?.refresh(FLIGHT.id)
  }), [host])

  return <div style={{ position: 'fixed', bottom: 18, left: 20, zIndex: 80, font: '12px ui-monospace, monospace', color: '#d6ddd9' }}>
    <div style={{ padding: '8px 10px', marginBottom: 6, background: '#191c20', borderRadius: 6 }}>
      <div aria-live="polite" style={{ color: '#f2c75c', marginBottom: 4 }}>{transformStatus}</div>
      Click a prop · G move · S scale · R rotate<br />
      X / Y / Z axis · repeat axis: local · Shift + axis: plane · R R: trackball<br />
      Shift: precision · Ctrl: snap · type numbers · Enter / click: confirm · Esc: cancel · ⌘ Z: undo
    </div>
    <button type="button" onClick={() => setBlocked(!host?.open(ROULETTE.id))}
      style={{ background: '#191c20', border: '1px solid #47524b', borderRadius: 6, padding: '10px 16px', cursor: 'pointer' }}>
      ↗ Animation workspace
    </button>
    {blocked && <div style={{ paddingTop: 8 }}>Window blocked. Allow pop-ups, then open the workspace again.</div>}
  </div>
}
