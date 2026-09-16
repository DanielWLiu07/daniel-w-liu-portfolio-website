import manifest from '@/public/textures/royal-flush/delivery/manifest.json'

const assets: Record<string, { url: string }> = manifest.assets
/** Shared URLs keep the intro, flying cards and dealer on the same art/cache. */
export function cardArtUrl(name: string): string {
  const asset = assets[name]
  if (!asset) throw new Error(`Missing card artwork: ${name}`)
  return asset.url
}
