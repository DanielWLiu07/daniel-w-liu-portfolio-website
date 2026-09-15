/** Additional delivery copies; never overwrite authored artwork or the PDF. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

for (const [source, target, options] of [
  ['public/models/watercolor_normal.png', 'public/models/watercolor_normal-delivery.webp', { nearLossless: true, quality: 60, effort: 6 }],
]) {
  const before = await readFile(source)
  const after = await sharp(before).webp(options).toBuffer()
  const a = await sharp(before).raw().toBuffer()
  const b = await sharp(after).raw().toBuffer()
  assert.equal(a.length, b.length)
  let squared = 0
  for (let i = 0; i < a.length; i++) squared += (a[i] - b[i]) ** 2
  const rmse = Math.sqrt(squared / a.length)
  assert.ok(rmse < 2, 'Normal-map error exceeds delivery budget')
  assert.ok(after.length < before.length)
  await writeFile(target, after)
  console.log({target, before: before.length, after: after.length, rmse})
}
