import assert from 'node:assert/strict'
import { jackEditorTime, setJackClock } from '../components/resume/casino/jack-editor-clock'
import { beatTime, getTune, saveTune, setLetter, setProp, setTune } from '../components/resume/casino/tune'

const storage = new Map<string, string>([
  ['casino-tune-v1', JSON.stringify({ chipX: 1.2 })],
  ['casino-letters-v1', JSON.stringify({ 'OTHER:0': { dx: 5, dy: 0, s: 1, r: 0 } })],
  ['casino-props-v1', JSON.stringify({ 'chip:0': { x: 9, z: 1, s: 1, r: 0 } })],
])
Object.assign(globalThis, { window: { location: { pathname: '/resume/jack', search: '' }, localStorage: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
} } })
setJackClock({ time: 1, playing: true, loop: false, duration: 8 }, 1000)
assert.equal(jackEditorTime(2500), 2.5)
setJackClock({ playing: false }, 2500)
assert.equal(jackEditorTime(5000), 2.5, 'Pause keeps exact pose')
setJackClock({ time: 0.2, playing: false }, 5000)
assert.equal(beatTime(100), 0.2, 'Seek backwards affects the shared scene clock immediately')
setJackClock({ time: 7, playing: true, loop: true }, 6000)
assert.equal(jackEditorTime(8500), 1.5, 'Loop includes intro beginning')
getTune()
setTune({ jkJackX: 0.5, chipX: 3 })
setLetter('JACK:0', { dx: 0.2 })
setLetter('OTHER:0', { dx: 8 })
setProp('chip:0', { x: 12 }, { x: 9, z: 1, s: 1, r: 0 })
assert.ok(saveTune(['jkJackX'], { letterPrefixes: ['JACK:', 'of:', 'ALL:', 'TRADES:'], props: false }) >= 0)
assert.equal(JSON.parse(storage.get('casino-tune-v1')!).chipX, 1.2, 'Save preserves unrelated saved tune')
assert.equal(JSON.parse(storage.get('casino-tune-v1')!).jkJackX, 0.5)
assert.equal(JSON.parse(storage.get('casino-letters-v1')!)['JACK:0'].dx, 0.2)
assert.equal(JSON.parse(storage.get('casino-letters-v1')!)['OTHER:0'].dx, 5, 'Save leaves unrelated letter edits alone')
assert.equal(JSON.parse(storage.get('casino-props-v1')!)['chip:0'].x, 9, 'Save does not overwrite prop layout')
window.location.pathname = '/resume'
assert.equal(beatTime(1.2), 1.2, 'Public intro keeps its normal clock')
console.log('PASS: editor seek/play/pause/loop and title-only persistence')
