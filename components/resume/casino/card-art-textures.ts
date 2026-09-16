import { Loader, SRGBColorSpace, TextureLoader, type Texture } from 'three'

/** Artwork is immutable and owned by the page-level cache, not individual actors. */
export function createCardArtworkCache(load: (url: string) => Promise<Texture>) {
  type Resource = { promise: Promise<Texture>; texture?: Texture; error?: unknown }
  const entries = new Map<string, Resource>()
  const get = (url: string) => {
    let entry = entries.get(url)
    if (!entry) {
      const resource: Resource = { promise: Promise.resolve().then(() => load(url)) }
      resource.promise = resource.promise.then(texture => {
        resource.texture = texture
        return texture
      }, error => { resource.error = error; throw error })
      // React may abandon a suspended actor before it subscribes again.
      void resource.promise.catch(() => {})
      entries.set(url, resource)
      entry = resource
    }
    return entry
  }
  return {
    load: (url: string) => get(url).promise,
    read(url: string): Texture {
      const entry = get(url)
      if (entry.texture) return entry.texture
      if (entry.error) throw entry.error
      throw entry.promise
    },
  }
}

const artwork = createCardArtworkCache(async url => {
  const texture = await new TextureLoader().loadAsync(url)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = url.includes('casino-back') ? 8 : 4
  return texture
})
export const loadCardArtwork = artwork.load
export const readCardArtwork = artwork.read

/** R3F and imperative intro builders consume the same decoded GPU texture. */
export class CardArtworkLoader extends Loader<Texture> {
  load(url: string, onLoad: (texture: Texture) => void, _onProgress?: (event: ProgressEvent) => void, onError?: (error: unknown) => void): void {
    void loadCardArtwork(url).then(onLoad, error => onError?.(error))
  }
}
