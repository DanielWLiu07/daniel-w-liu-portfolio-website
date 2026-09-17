/** Reuse CSS FontFace objects and share concurrent canvas requests by family. */
const pending = new Map<string, Promise<void>>()
export function loadSharedFont(family: string, url: string, text?: string): Promise<void> {
  const key = text === undefined ? family : `${family}\0${text}`
  const existing = pending.get(key)
  if (existing) return existing
  const promise = (async () => {
    const faces = [...document.fonts].filter(face => face.family.replace(/["']/g, '') === family)
    if (faces.length) {
      // CSS unicode-range subsets only need the faces covering this text.
      // Callers without a text sample retain the full-family loading contract.
      if (text !== undefined) await document.fonts.load(`16px "${family}"`, text)
      else await Promise.all(faces.map(face => face.load()))
      return
    }
    const face = new FontFace(family, `url('${url}')`)
    document.fonts.add(face)
    await face.load()
  })().catch(error => { pending.delete(key); throw error })
  pending.set(key, promise)
  return promise
}
