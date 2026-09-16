/** Reuse CSS FontFace objects and share concurrent canvas requests by family. */
const pending = new Map<string, Promise<void>>()
export function loadSharedFont(family: string, url: string): Promise<void> {
  const existing = pending.get(family)
  if (existing) return existing
  const promise = (async () => {
    const faces = [...document.fonts].filter(face => face.family.replace(/["']/g, '') === family)
    if (faces.length) { await Promise.all(faces.map(face => face.load())); return }
    const face = new FontFace(family, `url('${url}')`)
    document.fonts.add(face)
    await face.load()
  })()
  pending.set(family, promise)
  return promise
}
