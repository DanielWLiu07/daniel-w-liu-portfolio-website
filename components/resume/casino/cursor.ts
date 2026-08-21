/**
 * One writer for the pointer cursor.
 *
 * Several things in the scene are clickable (the folder, the link tokens on its leaf) and each ran its own
 * `document.body.style.cursor = ...` every frame, so whichever wrote last won: hovering a token set the
 * pointer and the folder's own loop cleared it on the same frame. Claims are counted instead, and the
 * cursor is only cleared when nothing holds one.
 */
const claims = new Set<string>()

export function claimPointer(id: string, on: boolean): void {
  if (typeof document === 'undefined') return
  const had = claims.size > 0
  if (on) claims.add(id)
  else claims.delete(id)
  const has = claims.size > 0
  if (has !== had) document.body.style.cursor = has ? 'pointer' : ''
}

/** drop a claim without touching the cursor state of others (on unmount) */
export function releasePointer(id: string): void {
  claimPointer(id, false)
}
