/** Preserve source images; regenerate the smaller browser delivery copies. */
import sharp from 'sharp'
import { stat } from 'node:fs/promises'
const jobs = [
  ['public/models/watercolor_normal-delivery.webp', 'public/models/watercolor-normal-optimized.webp', { quality: 92, effort: 6 }, 'webp'],
  ['public/models/paper.png', 'public/models/paper-delivery.webp', { quality: 90, effort: 6 }, 'webp'],
  ['public/experience/images/playstation_logo.png', 'public/experience/images/playstation-logo.webp', { lossless: true, effort: 6 }, 'webp'],
]
for (const [source, output, options, format] of jobs) {
  await sharp(source)[format](options).toFile(output)
  console.log(`${source}: ${(await stat(source)).size} → ${(await stat(output)).size} bytes`)
}
