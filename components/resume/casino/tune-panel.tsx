'use client'

import { useEffect, useState } from 'react'
import { tweakEntries, resetTweaks, TUNE_CHOICES, TUNE_DEFAULTS, TUNE_RANGES, clearSavedTune, letterCount, propCount, propsJson, recentre, resetLetters, resetProps, saveTune, setTune, tuneQuery, undoTune, useTune, type Tune } from './tune'

/** plain-language names, so the sliders read as what they do in the shot rather than as field names */
const LABEL: Partial<Record<keyof Tune, string>> = {
  fldFit: 'zoom out',
  fldUp: 'up / down',
  fldSide: 'left / right',
  fldLean: 'tilt up / down',
  fldSpin: 'turn left / right',
  fldTurn: 'how far it opens',
  fldTilt: 'mouse aim',
  fldMove: 'mouse move',
  fldFloat: 'float',
  fldRise: 'hover lift',
  jkFit: 'overall size',
  jkCardX: 'card left / right',
  jkCardY: 'card up / down',
  jkCardW: 'card size',
  jkCardTilt: 'card tilt',
  jkJackS: 'JACK size',
  jkOfX: 'of left / right',
  jkOfY: 'of up / down',
  jkOfS: 'of size',
  jkAllX: 'ALL left / right',
  jkAllY: 'ALL up / down',
  jkAllS: 'ALL size',
  jkTrX: 'TRADES left / right',
  jkTrY: 'TRADES up / down',
  jkTrS: 'TRADES size',
  jkTCardIn: 'time: card thrown',
  jkTCardLand: 'time: card lands',
  jkTJack: 'time: JACK in',
  jkTOf: 'time: of in',
  jkTAll: 'time: ALL in',
  jkTTrades: 'time: TRADES in',
  jkJackX: 'JACK left / right',
  jkJackY: 'JACK up / down',
  jkFontJack: 'JACK font',
  jkFontOf: 'of font',
  jkFontAll: 'ALL font',
  jkFontTrades: 'TRADES font',
  jkJackR: 'JACK roll',
  jkOfR: 'of roll',
  jkAllR: 'ALL roll',
  jkTrR: 'TRADES roll',
  jkSeed: 'reroll the note',
  jkLockX: 'whole line left / right',
  jkLockY: 'whole line up / down',
  jkFlick: 'coin flicks at (s)',
  jkHold: 'coin hangs at the top (s)',
  jkApex: 'coin flies up to',
  jkPeak: 'coin at the peak (0 = centred)',
  jkDelay: 'camera waits (s)',
  jkOver: 'camera turns after coin (s)',
  jkSink: 'camera follows down after (s)',
  jkRise: 'coin climb takes (s)',
  jkFall: 'camera falls from',
  jkFallFor: 'the drop takes (s)',
  jkEaseUp: 'going up',
  jkWind: 'camera winds up (2 = tracks coin)',
  jkEaseDown: 'coming down',
  jkEaseCoin: 'coin easing',
  jkDive: 'camera dives (2 = natural)',
  jkSpinUp: 'coin flip off the thumb',
  jkSpinTop: 'coin flip at the top',
  jkSpinLand: 'coin flip on landing',
  suit0X: 'spade across', suit0Y: 'spade up',
  suit1X: 'heart across', suit1Y: 'heart up',
  suit2X: 'diamond across', suit2Y: 'diamond up',
  suit3X: 'club across', suit3Y: 'club up',
  jkShot: 'jack: shot on the chart (0/1)',
  jkStep: 'jack: exposures a pose is held',
  jkHand: 'jack: how far a scrap lands off',
  suitSize: 'suit size',
  hitEyeN: 'how many eyes',
  hitEyeSize: 'eye size',
  suitFrom: 'how far in they start',
  jkLag: 'title holds back',
  jkInitial: 'first letter bigger',
  jkVary: 'letter size spread',
  jkScatter: 'off the line',
  jkSteps: 'poses per word',
  jkSpeed: 'how slow it creeps',
  eyN: 'how many eyes',
  eySize: 'eye size',
  eyCover: 'how much of the frame',
  eyDist: 'how far in front',
  eyFade: 'eyes fade',
  eyAt: 'eyes: first opens at (s)',
  eyStagger: 'eyes: first to last (s)',
  eyWake: 'eyes: one takes (s)',
  eyEvery: 'eyes: seconds between blinks',
  eyWeight: 'eyes: line weight',
  eyPaper: 'eyes: paper wobble',
  eyGaze: 'eyes: how far they look',
  titleR: 'arc radius',
  titleGap: 'gap between the lines',
  titleSize: 'letter size',
  titleSpacing: 'letter spacing',
  titleWeight: 'letter weight',
  titleY: 'title height',
  ttAX: 'ALWAYS BET ON: left / right',
  ttAY: 'ALWAYS BET ON: up / down',
  ttAS: 'ALWAYS BET ON: size',
  ttAR: 'ALWAYS BET ON: roll',
  ttBX: 'DANIEL W LIU: left / right',
  ttBY: 'DANIEL W LIU: up / down',
  ttBS: 'DANIEL W LIU: size',
  ttBR: 'DANIEL W LIU: roll',
  ttChips: 'how many chips',
  ttChipS: 'chip size',
  ttDice: 'how many dice',
  ttDiceS: 'dice size',
  ttPropX: 'chips and dice: left / right',
  ttPropZ: 'chips and dice: near / far',
  ttSpread: 'chips and dice: how scattered',
  ttSeed: 'reroll the scatter',
  smFps: 'stop motion: exposures a second',
  smTravel: 'stop motion: slide takes (s)',
  smFrom: 'stop motion: slides in from',
  smBoil: 'stop motion: trembles while moving',
  smTurn: 'stop motion: how much it turns',
  wdBeat: 'word: gap between words (s)',
  wdStep: 'word: exposures a pose is held',
  wdFrom: 'word: comes in from',
  wdTurn: 'word: arrives turned by (rad)',
  wdSwing: 'word: how much the path bows',
  wdDrag: 'word: turn lags by (poses)',
  wdDir: 'word: entry direction bias (rad)',
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
  // Ctrl+Z / Cmd+Z. Every gesture pushes one entry before it changes anything, so an undo lands on the
  // state before the whole drag rather than partway through it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.key === 'z' && (e.metaKey || e.ctrlKey)) || e.shiftKey) return
      const el = e.target as HTMLElement | null
      if (el && /^(input|textarea|select)$/i.test(el.tagName)) return
      e.preventDefault()
      setFlash(undoTune() ? 'undo' : 'nothing to undo')
      setTimeout(() => setFlash(''), 1200)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const keys = only ?? (Object.keys(TUNE_RANGES) as (keyof Tune)[])
  /**
   * Whether THIS panel owns the props.
   *
   * Keyed off the knobs it is showing rather than off its title. The chips and
   * dice are dragged on the table whatever panel is open, so a panel that can
   * see their knobs and cannot copy or reset their placements is a panel you can
   * lose work in: ?tune could move them and had no way to get them back out.
   */
  const hasProps = keys.includes('ttChips')
  const ks = moved(t, keys)
  /**
   * Placements live in the sparse tweak store, not in the tune, so they have to be copied EXPLICITLY.
   *
   * A copy button that returns only the sliders would quietly drop everything that was dragged, which is
   * most of the work on a placer. `burst` is empty unless something has been moved, so a panel that has no
   * placements is unaffected.
   */
  const burst = [...tweakEntries('suit:'), ...tweakEntries('eye:')]
    .map(([k, v]) => `${k} { dx: ${v.dx.toFixed(3)}, dy: ${v.dy.toFixed(3)}, s: ${v.s.toFixed(3)}, r: ${v.r.toFixed(3)} }`)
    .join('\n')
  // the ? belongs to the query half only: the placements are not URL parameters and pasting them as if
  // they were would produce something that looks like a link and is not one
  const query = ks.map((k) => `${k}=${t[k]}`).join('&')
  const changed = [query && `?${query}`, burst].filter(Boolean).join('\n')
  const asTs = [ks.map((k) => `${k}: ${t[k]}`).join(', '), burst].filter(Boolean).join('\n')

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

  /**
   * The panel covers part of the stage, and on a placer that means sprites you cannot reach.
   *
   * A separate window was the other option and is worse: the scene would still be in THIS one, so every
   * drag would mean looking away from what you are dragging, and the tune state would need syncing across
   * two documents. Getting out of the way solves the same problem with none of that - hide it, move the
   * thing, bring it back. Both controls are also on keys so they work while a modal transform is running.
   */
  const [hidden, setHidden] = useState(false)
  const [side, setSide] = useState<'right' | 'left'>('right')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && /^(input|textarea|select)$/i.test(el.tagName)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'h') setHidden((v) => !v)
      else if (e.key === '[') setSide((v) => (v === 'right' ? 'left' : 'right'))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => setHidden(false)}
        style={{ ...btn, position: 'fixed', [side]: 12, top: 72, zIndex: 50 }}
      >
        show panel (h)
      </button>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        [side]: 12,
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {title && <div style={{ opacity: 0.7, letterSpacing: 0.4, flex: 1 }}>{title}</div>}
        <button type="button" style={btn} onClick={() => setSide((v) => (v === 'right' ? 'left' : 'right'))} title="move the panel to the other side">
          {side === 'right' ? 'left' : 'right'}
        </button>
        <button type="button" style={btn} onClick={() => setHidden(true)} title="hide the panel">
          hide
        </button>
      </div>
      {hasProps && (
        <div style={{ opacity: 0.55, fontSize: 11, lineHeight: 1.35, marginBottom: 2 }}>
          drag a chip or a die to place it &middot; <b>shift</b>-drag to size &middot; <b>alt</b>-drag to spin
          <br />
          a dragged one keeps its place when the scatter is rerolled &middot; <b>copy props</b> hands them back
        </div>
      )}
      {title === 'jack of all trades' && (
        <div style={{ opacity: 0.55, fontSize: 11, lineHeight: 1.35, marginBottom: 2 }}>
          drag to move &middot; shift-drag to size &middot; <b>alt</b>-drag for ONE letter
          <br />
          <b>g</b> move <b>s</b> size <b>r</b> roll &middot; then <b>x</b>/<b>y</b> axis, type a number,
          enter confirms, esc cancels &middot; cmd-z undo
        </div>
      )}
      <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
        {keys.map((k) => {
          const [min, max, step] = TUNE_RANGES[k]
          const on = t[k] !== TUNE_DEFAULTS[k]
          const choices = TUNE_CHOICES[k]
          return (
            <label key={k} style={{ display: 'grid', gridTemplateColumns: only ? '112px 1fr 46px' : '58px 1fr 46px', gap: 6, alignItems: 'center', marginBottom: 4 }}>
              <span style={{ color: on ? '#7fd6a0' : '#eee' }} title={k}>{(only && LABEL[k]) || k}</span>
              {/* a key with a CHOICES entry is a set of named things, not a range: a font is picked, not dialled */}
              {choices ? (
                <select
                  value={Math.round(t[k])}
                  onChange={(e) => setTune({ [k]: Number(e.target.value) })}
                  style={{ gridColumn: 'span 2', font: '11px/1.3 ui-monospace, monospace', background: '#2a2a2a', color: on ? '#7fd6a0' : '#eee', border: '1px solid #4a4a4a', borderRadius: 4, padding: '3px 4px' }}
                >
                  {choices.map((c, i) => (
                    <option key={c} value={i}>{c}</option>
                  ))}
                </select>
              ) : (
                <>
                  <input type="range" min={min} max={max} step={step} value={t[k]} onChange={(e) => setTune({ [k]: Number(e.target.value) })} />
                  <span style={{ textAlign: 'right', color: on ? '#7fd6a0' : '#eee' }}>{t[k].toFixed(3)}</span>
                </>
              )}
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
        {/* Keeps them across reloads, which is what makes this an editor rather than a demo: dialling a
            beat is a dozen passes over the same three seconds and losing it to a refresh each time is
            what makes that unbearable. Only the moved keys are stored, so a default that changes in the
            source later is picked up rather than pinned to whatever it was the day it was saved. */}
        <button
          type="button"
          style={{ ...btn, background: '#24402f', borderColor: '#3f6b4f' }}
          onClick={() => {
            const n = saveTune(keys)
            setFlash(n < 0 ? 'save blocked (private mode?)' : n === 0 ? 'saved: nothing changed' : `saved ${n} value${n === 1 ? '' : 's'}`)
            setTimeout(() => setFlash(''), 1800)
          }}
        >
          save
        </button>
        <button
          type="button"
          style={btn}
          onClick={() => {
            recentre()
            setFlash('recentred on the current bounds')
            setTimeout(() => setFlash(''), 1600)
          }}
        >
          recentre
        </button>
        <button
          type="button"
          style={btn}
          onClick={() => {
            resetLetters()
            setFlash('letters back to their words')
            setTimeout(() => setFlash(''), 1600)
          }}
        >
          reset letters
        </button>
        <button
          type="button"
          style={btn}
          onClick={() => {
            resetTweaks('suit:')
            resetTweaks('eye:')
            setFlash('burst back to its defaults')
            setTimeout(() => setFlash(''), 1600)
          }}
        >
          reset burst
        </button>
        {/* the props are dragged rather than dialled, so they need their own way
            out: the sliders' copy box only carries knobs that moved */}
        {hasProps && (
          <>
            <button type="button" style={btn} onClick={() => copy('placed props', propsJson())}>
              copy props ({propCount()})
            </button>
            <button
              type="button"
              style={btn}
              onClick={() => {
                resetProps()
                setFlash('props back to the scatter')
                setTimeout(() => setFlash(''), 1600)
              }}
            >
              reset props
            </button>
          </>
        )}
        <button
          type="button"
          style={btn}
          onClick={() => {
            clearSavedTune()
            setTune(Object.fromEntries(keys.map((k) => [k, TUNE_DEFAULTS[k]])) as Partial<Tune>)
            setFlash('cleared the save')
            setTimeout(() => setFlash(''), 1800)
          }}
        >
          clear save
        </button>
      </div>

      {/* the same text in a real field: selectable and copyable by hand if the clipboard API is refused.
          The props are DRAGGED rather than dialled so they are not in the query, and the whole reason this
          box exists applies to them at least as much: without them here, a refused clipboard means the
          placements cannot be got out at all. */}
      <textarea
        readOnly
        value={
          [changed, propCount() ? `props ${propsJson()}` : ''].filter(Boolean).join('\n') ||
          '(nothing changed yet)'
        }
        onFocus={(e) => e.currentTarget.select()}
        style={{
          width: '100%',
          height: 78,
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
      {title === 'jack of all trades' && letterCount() > 0 && (
        <div style={{ opacity: 0.6, fontSize: 11 }}>{letterCount()} letter{letterCount() === 1 ? '' : 's'} moved off its word</div>
      )}
      <div style={{ minHeight: 14, opacity: 0.85, color: flash.startsWith('copied') ? '#7fd6a0' : '#e6b86a' }}>{flash}</div>
    </div>
  )
}
