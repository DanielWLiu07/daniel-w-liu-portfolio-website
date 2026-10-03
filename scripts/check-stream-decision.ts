import assert from 'node:assert/strict'
import { canHandOff, isWeakDevice, wantsStream } from '../components/resume/stream/stream-config'
import { decide, type ServerView } from '../lib/stream/fleet'

// --- who streams ---------------------------------------------------------------
const strong = { gpu: {}, deviceMemory: 8, hardwareConcurrency: 10 }
const weak = { deviceMemory: 4, hardwareConcurrency: 4 } // no WebGPU
assert.equal(wantsStream('?stream=1', strong, 'off'), false, 'off means off, even when forced')
assert.equal(wantsStream('', strong, 'opt-in'), false, 'opt-in: not without ?stream=1')
assert.equal(wantsStream('?stream=1', strong, 'opt-in'), true, 'opt-in: ?stream=1 streams')
assert.equal(wantsStream('?stream=0', weak, 'all'), false, '?stream=0 always renders locally')
assert.equal(wantsStream('', weak, 'weak'), true, 'weak mode streams to weak devices')
assert.equal(wantsStream('', strong, 'weak'), false, 'weak mode leaves capable devices local')
assert.equal(wantsStream('', strong, 'all'), true, 'all: everyone starts streamed')
assert.equal(isWeakDevice({ gpu: {}, hardwareConcurrency: 8 }), false, 'unknown memory is not weak')
assert.equal(isWeakDevice({ hardwareConcurrency: 16 }), true, 'no WebGPU is weak')
assert.equal(isWeakDevice(strong, '?streamDevice=weak'), true, 'testing override')

// --- when a capable device hands off to local -----------------------------------
assert.equal(canHandOff({ localReady: false, introStarted: false }), false, 'never before local is ready')
assert.equal(canHandOff({ localReady: true, introStarted: false }), true, 'ready before the show: local plays it from the top')
assert.equal(canHandOff({ localReady: true, introStarted: true }), false, 'never mid-show (the intro does not resume from a jumped clock)')

// --- the front door: where to stream, what to start -------------------------------
const opts = { minFreeSeats: 2, maxServers: 2, seatsPerServer: 2 }
const pool = (warm: number, busy = 0, draining: string | null = null) => ({ seats: warm + busy, busy, warm, draining })
const srv = (id: string, state: ServerView['state'], p: ServerView['pool'] = null): ServerView => ({ id, url: `https://${id}`, state, pool: p })

let d = decide([srv('a', 'stopped'), srv('b', 'stopped')], opts)
assert.deepEqual([d.url, d.reason, d.start], [null, 'waking', ['a']], 'all asleep: wake one, visitor renders locally')

d = decide([srv('a', 'starting'), srv('b', 'stopped')], opts)
assert.deepEqual([d.url, d.reason, d.start], [null, 'waking', []], 'one booting covers minFree: nothing else to start')

d = decide([srv('a', 'running', pool(4)), srv('b', 'stopped')], opts)
assert.deepEqual([d.url, d.reason, d.start], ['https://a', 'ok', []], 'plenty of warm seats')

d = decide([srv('a', 'running', pool(2, 2)), srv('b', 'stopped')], opts)
assert.deepEqual([d.url, d.start], ['https://a', ['b']], 'taking the second-to-last seat leaves 1 < 2 free: start b before the limit')

d = decide([srv('a', 'running', pool(0, 4)), srv('b', 'stopped')], opts)
assert.deepEqual([d.url, d.reason, d.start], [null, 'waking', ['b']], 'full: local now, b on its way')

d = decide([srv('a', 'running', pool(1, 3)), srv('b', 'running', pool(3, 1))], opts)
assert.equal(d.url, 'https://b', 'most warm seats wins')

d = decide([srv('a', 'running', pool(0, 4)), srv('b', 'running', pool(0, 4))], opts)
assert.deepEqual([d.url, d.reason, d.start], [null, 'full', []], 'at maxServers: no more starts')

d = decide([srv('a', 'running', pool(3, 0, 'spot interruption')), srv('b', 'stopped')], opts)
assert.deepEqual([d.url, d.start], [null, ['b']], 'a draining server takes no visitors; its replacement starts')

d = decide([srv('a', 'running', null), srv('b', 'stopped')], opts)
assert.deepEqual([d.url, d.reason, d.start], [null, 'waking', []], 'running but not answering yet (seats warming) counts as booting')

console.log('PASS: stream decisions (who streams, handoff moment, front door)')
