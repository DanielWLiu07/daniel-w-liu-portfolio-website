'use client'

import { useState } from 'react'
import { saveTune, setTune, TUNE_DEFAULTS, useTune } from './tune'
import { DEALER_DEFAULTS, DEALER_ALL_KEYS, DEALER_LABELS, DEALER_RANGES, DEALER_MOTION_DEFAULTS, DEALER_MOTION_LABELS, DEALER_MOTION_RANGES } from './dealer-layout'

import { FACE_CONTROLS, FACE_DEFAULTS, saveFaceSettings, setFaceSettings, useFaceSettings } from '../face/face-settings'

const ALL_RANGES={...DEALER_RANGES,...DEALER_MOTION_RANGES}
const ALL_LABELS={...DEALER_LABELS,...DEALER_MOTION_LABELS}

export default function CasinoLayoutPanel({ characterOnly=false }: {characterOnly?:boolean}) {
  const face=useFaceSettings()
  const keys=characterOnly?DEALER_ALL_KEYS:[...DEALER_ALL_KEYS,'chipX','chipZ','chord'] as const
  const tune = useTune()
  const [message, setMessage] = useState('')
  const [hidden, setHidden] = useState(false)
  const controls = [
    ...DEALER_ALL_KEYS.map((key) => ({ key, label: ALL_LABELS[key], min: ALL_RANGES[key][0], max: ALL_RANGES[key][1], step: ALL_RANGES[key][2], value: tune[key], sign: 1 })),
    ...(!characterOnly? [{ key: 'chipX' as const, label: 'Red chip · left / right', min: -4, max: 4, value: tune.chipX, sign: 1 },
    { key: 'chipZ' as const, label: 'Red chip · back / front', min: -6, max: 2, value: tune.chipZ, sign: 1 },
    // The D-shaped table's chord changes only the back cut. Its front arc,
    // radius, height and every actor's world position remain unchanged.
    { key: 'chord' as const, label: 'Table · reach toward the back', min: 2.5, max: Math.max(2.5, tune.table * 0.41 * 0.95), value: -tune.chord, sign: -1 }]:[]),
  ]
  const button = 'rounded border border-white/25 px-3 py-1.5 text-xs hover:bg-white/10'
  return (
    <aside aria-label={characterOnly?'Character controls':'Casino layout controls'} className="fixed right-4 top-20 z-50 max-h-[calc(100dvh-6rem)] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-white/20 bg-neutral-950/90 p-4 text-sm text-white shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-medium">{characterOnly?'Character':'Casino layout'}</h1>
        <button type="button" className={button} onClick={() => setHidden(!hidden)}>{hidden ? 'Show' : 'Hide'}</button>
      </div>
      {!hidden && <>
        <p className="my-3 text-xs leading-relaxed text-white/60">Size, move and turn the whole character. Head, jaw and body share a 30-second performance at normal speed. Set body movement to zero to pause it.</p>
        <div className="space-y-4">
          {controls.map((control) => {
            const { key, label, min, max, value, sign } = control
            return (
            <label key={key} className="block">
              <span className="mb-1 flex justify-between gap-2 text-xs"><span>{label}</span><output>{value.toFixed(2)}</output></span>
              <input aria-label={label} className="w-full accent-emerald-400" type="range" min={min} max={max} step={'step' in control ? control.step : 0.05} value={value} onChange={(event) => { setTune({ [key]: Number(event.target.value) * sign }); setMessage('Unsaved changes') }} />
            </label>
          )})}
        </div>
        {characterOnly && <div className="mt-5 space-y-3 border-t border-white/20 pt-4">
          <h2 className="text-xs font-medium">Head &amp; jaw</h2>
          <label className="flex gap-2 text-xs"><input type="checkbox" checked={face.idle} onChange={e=>setFaceSettings({idle:e.target.checked})} />Animate head and face</label>
          <label className="flex gap-2 text-xs"><input type="checkbox" checked={face.followMouse} onChange={e=>setFaceSettings({followMouse:e.target.checked})} />Look toward the mouse</label>
          {FACE_CONTROLS.filter(c=>['skullSize','jawOpen','amount','speed'].includes(c.key)).map(c=><label key={c.key} className="block text-xs">
            <span className="flex justify-between"><span>{c.key==='speed'?'Animation speed · head + body':c.label}</span><output>{face[c.key].toFixed(2)}</output></span>
            <input aria-label={c.label} className="w-full accent-emerald-400" type="range" min={c.min} max={c.max} step={c.step} value={face[c.key]} onChange={e=>setFaceSettings({[c.key]:Number(e.target.value)})} />
          </label>)}
        </div>}
        <p className="mt-3 text-xs text-white/50">Larger back / front values move him toward you. The default keeps him at the table’s back edge.</p>
        <button type="button" className={`${button} mt-3`} onClick={() => { setTune({ dealerZ: DEALER_DEFAULTS.dealerZ }); setMessage('Character returned to the table. Save to keep it.') }}>Return to table depth</button>
        <div className="mt-4 flex gap-2">
          <button type="button" className={`${button} bg-emerald-900/60`} onClick={() => { const saved=saveTune([...keys])>=0; const faceSaved=!characterOnly||saveFaceSettings(); setMessage(saved&&faceSaved?'Character settings saved in this browser.':'Saving is unavailable in this browser.') }}>Save settings</button>
          <button type="button" className={button} onClick={() => { setTune({ ...DEALER_DEFAULTS, ...DEALER_MOTION_DEFAULTS, ...(!characterOnly?{chipX:TUNE_DEFAULTS.chipX,chipZ:TUNE_DEFAULTS.chipZ,chord:TUNE_DEFAULTS.chord}:{}) }); if(characterOnly) setFaceSettings({...FACE_DEFAULTS}); setMessage('Layout reset. Save to keep it.') }}>{characterOnly?'Reset character':'Reset layout'}</button>
        </div>
        <p role="status" className="mt-2 min-h-4 text-xs text-emerald-200">{message}</p>
      </>}
    </aside>
  )
}
