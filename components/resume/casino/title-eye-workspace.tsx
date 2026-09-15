'use client'

import { useEffect, useRef, useState } from 'react'
import type { PanelSchema } from 'blender-to-threejs'
import { usePanel, usePanelHost } from '@/components/panels/use-panels'
import { titleEyeEditor } from './title-eye-editor'
import { addTitleEye, EYE_BOUNDS, getTitleEyes, previewTitleEyes, rememberTitleEyes, removeTitleEye, resetTitleEye, saveTitleEyes, setTitleEye, setTitleEyePreview, subscribeTitleEyes, undoTitleEyes, type EyePlacement } from './title-eye-layout'
import { EYE_INKS, type EyeInk } from './eye'

const ID = 'casino-title-eyes'
const OPTIONS = { url: (id: string) => `/panel/${id}?theme=terminal` }
const angles = new Set(['roll', 'tilt', 'yaw'])
const fields = ['x', 'y', 'depth', 'size', 'tilt', 'yaw', 'roll', 'sx', 'sy'] as const
const labels = { x: 'Horizontal', y: 'Vertical', depth: 'Depth', size: 'Size', tilt: 'Rotation X (degrees)', yaw: 'Rotation Y (degrees)', roll: 'Rotation Z (degrees)', sx: 'Scale X', sy: 'Scale Y' }
const SCHEMA: PanelSchema = { id: ID, title: 'Colored eye placement', width: 440, height: 840, controls: [
  { kind: 'section', label: 'Scene collection · Eyes' },
  { kind: 'button', key: 'add', label: '+ Add eye' },
  { kind: 'button', key: 'duplicate', label: 'Duplicate selected' },
  { kind: 'button', key: 'delete', label: 'Delete selected' },
  { kind: 'tree', key: 'objects', label: 'Outliner', visibility: false },
  { kind: 'snippet', key: 'selection', label: 'Selected eye' },
  { kind: 'section', label: 'Object properties' },
  { kind: 'select', key: 'ink', label: 'Ink color', options: EYE_INKS.map(ink => ({ value: ink, label: ink[0].toUpperCase() + ink.slice(1) })) },
  ...fields.map(key => ({ kind: 'slider' as const, key, label: labels[key], min: angles.has(key) ? -180 : EYE_BOUNDS[key][0], max: angles.has(key) ? 180 : EYE_BOUNDS[key][1], step: angles.has(key) ? 0.5 : 0.001 })),
  { kind: 'toggle', key: 'preview', label: 'Preview blinking and drift' },
  { kind: 'button', key: 'undo', label: 'Undo' },
  { kind: 'button', key: 'reset', label: 'Reset selected eye' },
  { kind: 'button', key: 'save', label: 'Save all eye placements' },
  { kind: 'snippet', key: 'status', label: 'Status' },
  { kind: 'snippet', key: 'values', label: 'Copy placements' },
] }
const selectedIndex = () => {
  const index = Number(titleEyeEditor.selectedId()?.split(':')[1] ?? -1)
  return getTitleEyes()[index]?.removed ? -1 : index
}

export default function TitleEyeWorkspace() {
  const host = usePanelHost(OPTIONS)
  const [blocked, setBlocked] = useState(false)
  const pendingSelection = useRef<string | null>(null)
  const newInk = useRef<EyeInk>('gold')
  const dock = useRef<HTMLIFrameElement>(null)
  const note = useRef('Placements save in this browser. Copy the values to make them site defaults.')
  usePanel(host, SCHEMA, {
    get: () => {
      const eye = getTitleEyes()[selectedIndex()] ?? { x: 0, y: 0, size: 0.12, roll: 0, ink: newInk.current }
      return { ...Object.fromEntries(fields.map(key => [key, (eye[key] ?? (key === 'sx' || key === 'sy' ? 1 : 0)) * (angles.has(key) ? 180 / Math.PI : 1)])), ink: eye.ink, preview: previewTitleEyes() }
    },
    set: (key, value) => {
      if (key === 'preview') { setTitleEyePreview(value === true); return }
      if (key === 'ink' && EYE_INKS.includes(value as EyeInk)) {
        newInk.current = value as EyeInk
        if (selectedIndex() >= 0) { rememberTitleEyes(); setTitleEye(selectedIndex(), { ink: value as EyeInk }) }
        return
      }
      if (selectedIndex() < 0) return
      if (!Object.hasOwn(EYE_BOUNDS, key) || !Number.isFinite(Number(value))) return
      rememberTitleEyes()
      setTitleEye(selectedIndex(), { [key]: Number(value) * (angles.has(key) ? Math.PI / 180 : 1) } as Partial<EyePlacement>)
      note.current = 'Unsaved placements.'
    },
    press: action => {
      const index = selectedIndex()
      if (action === 'add' || (action === 'duplicate' && index >= 0)) {
        pendingSelection.current = `eye:${getTitleEyes().length}`
        addTitleEye(newInk.current, action === 'duplicate' ? index : undefined)
      }
      if (action === 'delete' && index >= 0) {
        titleEyeEditor.select(null)
        removeTitleEye(index)
        const next = getTitleEyes().findIndex(eye => !eye.removed)
        if (next >= 0) titleEyeEditor.select(`eye:${next}`)
      }
      if (action === 'undo') undoTitleEyes()
      if (action === 'reset' && index >= 0) resetTitleEye(index)
      if (action === 'save') note.current = saveTitleEyes() ? 'Saved in this browser. Reload /resume to use these placements.' : 'Storage unavailable. Copy the placements below.'
    },
    trees: () => ({ objects: titleEyeEditor.tree() }),
    select: (key, id) => { if (key === 'objects') { titleEyeEditor.select(id); document.querySelector<HTMLCanvasElement>('.casino-stage canvas')?.focus() } },
    snippets: () => ({ selection: `${selectedIndex() < 0 ? 'No eye selected · add an eye or select in the Outliner' : `Eye ${String(selectedIndex() + 1).padStart(2, '0')} · ${getTitleEyes()[selectedIndex()].ink}`}\n${titleEyeEditor.gesture() ? `${titleEyeEditor.gesture()!.mode.toUpperCase()} · ${titleEyeEditor.gesture()!.axis ?? 'free'} · ${titleEyeEditor.gesture()!.orientation ?? 'global'}` : 'Move the pointer into the scene to use G / R / S'}\nX/Y/Z axis · repeat for local · Shift precision · Ctrl snap\nEnter/click confirms · Esc/right-click cancels · Ctrl/Cmd Z undo\nStarting a transform pauses eye motion.`, status: note.current, values: JSON.stringify(getTitleEyes(), null, 2) }),
  })
  useEffect(() => {
    const frame = dock.current
    let stop = () => {}
    const bind = () => {
      stop()
      const child = frame?.contentWindow
      if (!frame || !child) return
      // Keep the modal controller's pointer origin accurate when selecting in
      // the embedded Outliner before moving back into the viewport.
      const move = (event: PointerEvent) => {
        const rect = frame.getBoundingClientRect()
        window.dispatchEvent(new PointerEvent('pointermove', { clientX: rect.left + event.clientX, clientY: rect.top + event.clientY, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey }))
      }
      child.addEventListener('pointermove', move)
      stop = () => child.removeEventListener('pointermove', move)
    }
    bind(); frame?.addEventListener('load', bind)
    return () => { stop(); frame?.removeEventListener('load', bind) }
  }, [])
  useEffect(() => {
    const refresh = () => host?.refresh(ID)
    let layout = getTitleEyes()
    const stopStore = subscribeTitleEyes(() => {
      if (layout !== getTitleEyes()) { layout = getTitleEyes(); note.current = 'Unsaved placements.' }
      refresh()
    }), stopEditor = titleEyeEditor.onChange(() => {
      const pending = pendingSelection.current
      if (pending && titleEyeEditor.tree().some(node => node.id === pending)) {
        pendingSelection.current = null
        titleEyeEditor.select(pending)
      }
      refresh()
    })
    return () => { stopStore(); stopEditor() }
  }, [host])
  useEffect(() => {
    setTitleEyePreview(true)
    return () => setTitleEyePreview(false)
  }, [])
  return <>
  <aside className="eye-module-region"><iframe ref={dock} title="Eye placement workspace" src={OPTIONS.url(ID)} /></aside>
  <div className="eye-workspace-launch">
    <button onClick={() => setBlocked(!host?.open(ID))}>↗ Eye placement editor</button>
    <span> · Select an eye · G move · R roll · S size</span>
    {blocked && <p>Open <a href={OPTIONS.url(ID)} target="_blank" rel="noreferrer">the controls</a> in a separate window.</p>}
  </div>
  </>
}
