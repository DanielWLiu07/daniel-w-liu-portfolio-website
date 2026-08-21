'use client'

import { TUNE_RANGES, setTune, tuneQuery, useTune, type Tune } from './tune'

/** ?tune slider panel: edits the casino layout live; the query line at the bottom is the shareable result */
export default function TunePanel() {
  const t = useTune()
  const keys = Object.keys(TUNE_RANGES) as (keyof Tune)[]
  return (
    <div
      style={{
        position: 'fixed',
        right: 12,
        top: 72,
        zIndex: 50,
        background: 'rgba(20,20,20,0.82)',
        color: '#eee',
        font: '12px/1.4 ui-monospace, monospace',
        padding: '10px 12px',
        borderRadius: 8,
        width: 260,
      }}
    >
      {keys.map((k) => {
        const [min, max, step] = TUNE_RANGES[k]
        return (
          <label key={k} style={{ display: 'grid', gridTemplateColumns: '48px 1fr 44px', gap: 6, alignItems: 'center', marginBottom: 4 }}>
            <span>{k}</span>
            <input type="range" min={min} max={max} step={step} value={t[k]} onChange={(e) => setTune({ [k]: Number(e.target.value) })} />
            <span style={{ textAlign: 'right' }}>{t[k].toFixed(2)}</span>
          </label>
        )
      })}
      <div style={{ marginTop: 6, wordBreak: 'break-all', opacity: 0.8 }}>?{tuneQuery()}</div>
    </div>
  )
}
