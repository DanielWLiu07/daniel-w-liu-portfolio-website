import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { signTicket, TICKET_TTL_MS } from '../lib/stream/ticket'
// The server's verifier, extracted verbatim from server.mjs.
const src = readFileSync(new URL('../experiments/pixel-stream/server.mjs', import.meta.url), 'utf8')
const fn = src.slice(src.indexOf('function verifyTicket'), src.indexOf('/** May this viewer page'))
const TICKET_SECRET = 'test-secret'
const verifyTicket = new Function('createHmac', 'timingSafeEqual', 'TICKET_SECRET', `${fn}; return verifyTicket`)(createHmac, timingSafeEqual, TICKET_SECRET)
const t = signTicket(TICKET_SECRET, 'device-a')
assert.equal(verifyTicket(t, 'device-a'), true, 'a fresh ticket for this device passes')
assert.equal(verifyTicket(t, 'device-b'), false, 'another device cannot use it')
assert.equal(verifyTicket(t.slice(0, -2) + 'xx', 'device-a'), false, 'a tampered signature fails')
assert.equal(verifyTicket(signTicket('other-secret', 'device-a'), 'device-a'), false, 'signed with another secret fails')
assert.equal(verifyTicket(signTicket(TICKET_SECRET, 'device-a', Date.now() - TICKET_TTL_MS - 1), 'device-a'), false, 'an expired ticket fails')
assert.equal(verifyTicket('', 'device-a'), false, 'no ticket fails')
assert.equal(verifyTicket('9999999999999.abc', 'device-a'), false, 'a made-up ticket fails')
console.log('PASS: seat tickets (site signs, server verifies, forgeries and expiry rejected)')
