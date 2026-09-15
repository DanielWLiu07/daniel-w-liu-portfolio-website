/** Delivery-only copies; retain authored images and dimensions. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

// Card artwork is already efficient WebP; re-encoding saved only 2% while
// introducing generation loss, so preserve those authored bytes.
const normalPath = 'public/models/watercolor_normal.png'
const normal = await readFile(normalPath)
const webp = await sharp(normal).webp({ lossless: true, effort: 6 }).toBuffer()
assert.ok((await sharp(normal).raw().toBuffer()).equals(await sharp(webp).raw().toBuffer()))
assert.ok(webp.length < normal.length)
await writeFile('public/models/watercolor_normal.webp', webp)
console.log(JSON.stringify({ normal: { before: normal.length, after: webp.length } }))
