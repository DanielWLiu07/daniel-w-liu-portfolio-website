/** Deliver the authored vector plates at the same 720x1080 texture resolution. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import sharp from 'sharp'
const base = 'public/textures/royal-flush'
await mkdir(`${base}/delivery`, { recursive: true })
const assets = {}
for (const file of (await readdir(base)).filter(name => name.endsWith('.svg')).sort()) {
  const source = await readFile(`${base}/${file}`, 'utf8')
  assert.ok(!/<(?:script|image|foreignObject)\b/i.test(source), 'Vector-only self-contained artwork')
  const root = source.match(/<svg\b[^>]*>/s)?.[0]
  assert.ok(root)
  const width = Number(root.match(/\bwidth="([\d.]+)"/)?.[1]), height = Number(root.match(/\bheight="([\d.]+)"/)?.[1])
  assert.ok(width > 0 && height > 0)
  let resized = root.replace(/\bwidth="[^"]*"/, 'width="720"').replace(/\bheight="[^"]*"/, 'height="1080"')
  if (!/\bviewBox=/.test(resized)) resized = resized.replace(/>$/, ` viewBox="0 0 ${width} ${height}">`)
  const output = source.replace(root, `${resized}<rect width="${width}" height="${height}" fill="white"/>`)
  // Same artwork and raster dimensions; white stock matches old flattened WebP.
  const originalPixels = await sharp(Buffer.from(source), { density: 72 * 720 / width }).resize(720, 1080).flatten({ background: 'white' }).raw().toBuffer()
  const deliveredPixels = await sharp(Buffer.from(output)).flatten({ background: 'white' }).raw().toBuffer()
  assert.equal(originalPixels.length, deliveredPixels.length)
  let squaredError = 0
  for (let i = 0; i < originalPixels.length; i++) squaredError += (originalPixels[i] - deliveredPixels[i]) ** 2
  const rasterRMSE = Math.sqrt(squaredError / originalPixels.length)
  console.log(file, { rasterRMSE })
  assert.ok(rasterRMSE < .05, `${file}: raster comparison exceeds .05/255`)
  const data = Buffer.from(output), name = file.replace('.svg', '')
  const old = await readFile(`${base}/${name}.webp`)
  const hash = createHash('sha256').update(data).digest('hex').slice(0, 12)
  await writeFile(`${base}/delivery/${file}`, data)
  assets[name] = { url: `/textures/royal-flush/delivery/${file}?v=${hash}`, width: 720, height: 1080, originalWebpBytes: old.length, svgBytes: data.length, gzipBytes: gzipSync(data).length, rasterRMSE }
}
const totals = Object.values(assets).reduce((s, a) => ({ webpBytes: s.webpBytes + a.originalWebpBytes, gzipBytes: s.gzipBytes + a.gzipBytes }), { webpBytes: 0, gzipBytes: 0 })
await writeFile(`${base}/delivery/manifest.json`, JSON.stringify({ assets, totals }, null, 2) + '\n')
console.log({ cards: Object.keys(assets).length, ...totals })
