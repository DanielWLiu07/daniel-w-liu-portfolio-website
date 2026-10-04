import { createHmac } from 'node:crypto'

/**
 * Seat tickets: the front door signs (device, expiry) with a secret shared only
 * with the render servers, and a server seats a new visitor only with a valid
 * ticket. Without it, anything that finds a server's address (its HTTPS name is
 * public in certificate-transparency logs, and scanners load new names within
 * minutes) could take every seat. Format: `<expiry ms>.<base64url HMAC-SHA256>`.
 * The server checks it in experiments/pixel-stream/server.mjs (verifyTicket).
 */
export const TICKET_TTL_MS = 10 * 60_000

export function signTicket(secret: string, device: string, now = Date.now()): string {
  const exp = now + TICKET_TTL_MS
  const sig = createHmac('sha256', secret).update(`${device}|${exp}`).digest('base64url')
  return `${exp}.${sig}`
}
