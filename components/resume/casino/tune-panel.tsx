'use client'

import { useState } from 'react'
import { TUNE_DEFAULTS, TUNE_RANGES, setTune, tuneQuery, useTune, type Tune } from './tune'

/** plain-language names, so the sliders read as what they do in the shot rather than as field names */
const LABEL: Partial<Record<keyof Tune, string>> = {
  fldFit: 'zoom out',
  fldUp: 'up / down',
  fldSide: 'left / right',
  fldLean: 'tilt up / down',
  fldSpin: 'turn left / right',
  fldTurn: 'how far it opens',
  fldTilt: 'mouse aim',
  fldFloat: 'float',
  fldRise: 'hover lift',
}

/** the keys on show whose value is no longer the default */
function moved(t: Tune, keys: (keyof Tune)[]): (keyof Tune)[] {
  return keys.filter((k) => t[k] !== TUNE_DEFAULTS[k])
}

async function toClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // clipboard API can be refused even on localhost; a selected textarea still works
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

/**
 * Slider panel: edits the casino layout live and hands the result back out as text to paste.
 *
 * `only` narrows it to one set of knobs, which is what ?fld uses to put the presented folder's own controls
 * on the site itself without the other twenty sliders in the way.
 */
export default function TunePanel({ only, title }: { only?: (keyof Tune)[]; title?: string }) {
  const t = useTune()
  const [flash, setFlash] = useState('')
  const keys = only ?? (Object.keys(TUNE_RANGES) as (keyof Tune)[])
  const ks = moved(t, keys)
  const changed = ks.map((k) => `${k}=${t[k]}`).join('&')
  const asTs = ks.map((k) => `${k}: ${t[k]}`).join(', ')

  const copy = async (label: string, text: string) => {
    const ok = await toClipboard(text)
    setFlash(ok ? `copied ${label}` : 'copy blocked, select the box below')
    setTimeout(() => setFlash(''), 1600)
  }

  const btn: React.CSSProperties = {
    font: '11px/1 ui-monospace, monospace',
    background: '#2f2f2f',
    color: '#eee',
    border: '1px solid #4a4a4a',
    borderRadius: 5,
    padding: '5px 7px',
    cursor: 'pointer',
  }

  return (
    <div
      style={{
        position: 'fixed',
        right: 12,
        top: 72,
        bottom: 12,
        zIndex: 50,
        background: 'rgba(20,20,20,0.86)',
        color: '#eee',
        font: '12px/1.4 ui-monospace, monospace',
        padding: '10px 12px',
        borderRadius: 8,
        width: only ? 330 : 300,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      {title && <div style={{ opacity: 0.7, letterSpacing: 0.4 }}>{title}</div>}
      <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
        {keys.map((k) => {
          const [min, max, step] = TUNE_RANGES[k]
          const on = t[k] !== TUNE_DEFAULTS[k]
          return (
            <label key={k} style={{ display: 'grid', gridTemplateColumns: only ? '112px 1fr 46px' : '58px 1fr 46px', gap: 6, alignItems: 'center', marginBottom: 4 }}>
              <span style={{ color: on ? '#7fd6a0' : '#eee' }} title={k}>{(only && LABEL[k]) || k}</span>
              <input type="range" min={min} max={max} step={step} value={t[k]} onChange={(e) => setTune({ [k]: Number(e.target.value) })} />
              <span style={{ textAlign: 'right', color: on ? '#7fd6a0' : '#eee' }}>{t[k].toFixed(3)}</span>
            </label>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        <button type="button" style={btn} onClick={() => copy('changed', changed)} disabled={!changed}>
          copy changed
        </button>
        {!only && (
          <button type="button" style={btn} onClick={() => copy('all', tuneQuery())}>
            copy all
          </button>
        )}
        <button type="button" style={btn} onClick={() => copy('TS', asTs)} disabled={!changed}>
          copy as TS
        </button>
        <button type="button" style={btn} onClick={() => setTune(Object.fromEntries(keys.map((k) => [k, TUNE_DEFAULTS[k]])) as Partial<Tune>)}>
          reset
        </button>
      </div>

      {/* the same text in a real field: selectable and copyable by hand if the clipboard API is refused */}
      <textarea
        readOnly
        value={changed ? `?${changed}` : '(nothing changed yet)'}
        onFocus={(e) => e.currentTarget.select()}
        style={{
          width: '100%',
          height: 56,
          resize: 'vertical',
          background: '#111',
          color: '#9fe3b8',
          border: '1px solid #3a3a3a',
          borderRadius: 5,
          font: '11px/1.35 ui-monospace, monospace',
          padding: 6,
          boxSizing: 'border-box',
        }}
      />
      <div style={{ minHeight: 14, opacity: 0.85, color: flash.startsWith('copied') ? '#7fd6a0' : '#e6b86a' }}>{flash}</div>
    </div>
  )
}
