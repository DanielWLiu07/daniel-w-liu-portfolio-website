/** One FontFace/load per family+URL, shared by startup hints and canvas lettering. */
const pending = new Map<string, Promise<void>>()
export function loadCasinoFont(family: string, url: string): Promise<void> {
  const id = `${family}:${url}`
  const existing = pending.get(id)
  if (existing) return existing
  // Use the CSS face already shared by the loading screen and mode selector.
  if (family === 'JkFredericka' && url === '/fonts/FrederickatheGreat-Regular.woff2') {
    const promise = document.fonts.load('16px "JkFredericka"').then(faces => {
      if (!faces.length) throw new Error('Shared Fredericka CSS face is missing')
    }).catch(error => { pending.delete(id); throw error })
    pending.set(id, promise)
    return promise
  }
  const face = new FontFace(family, `url('${url}')`)
  const promise = face.load().then(loaded => { document.fonts.add(loaded) }).catch(error => {
    pending.delete(id)
    throw error
  })
  pending.set(id, promise)
  return promise
}
