import { loadSharedFont } from '@/lib/fonts/load-font'

/** The casino uses Latin display text. Extended CSS ranges remain available
 * on demand, without blocking the intro on glyphs it never draws. */
export function loadCasinoFont(family: string, url: string) {
  return loadSharedFont(family, url, family === 'JkFredericka' ? 'JACK OF ALL TRADES Always bet on Daniel W Liu Résumé' : undefined)
}
