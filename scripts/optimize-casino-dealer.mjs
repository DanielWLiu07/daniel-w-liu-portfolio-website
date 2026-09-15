/** Lossless delivery copy. Never rewrites the authored GLB or changes geometry/rigging.
 * Run after regenerating the dealer: node scripts/optimize-casino-dealer.mjs
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const manifest = JSON.parse(await readFile('public/models/casino-dealer-v3.json', 'utf8'))
const sourcePath = `public${manifest.model.split('?')[0]}`
const source = await readFile(sourcePath)
assert.equal(source.readUInt32LE(0), 0x46546c67)
const jsonLength = source.readUInt32LE(12)
const original = JSON.parse(source.subarray(20, 20 + jsonLength))
const gltf = structuredClone(original)
assert.equal(gltf.buffers.length, 1, 'Expected one embedded GLB buffer')
const bin = source.subarray(28 + jsonLength)
const replacements = new Map()
let originalImageBytes = 0, optimizedImageBytes = 0
for (const [index, image] of gltf.images.entries()) {
  assert.equal(image.mimeType, 'image/png')
  const view = gltf.bufferViews[image.bufferView]
  const png = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
  const webp = await sharp(png).webp({ lossless: true, effort: 6 }).toBuffer()
  // This is pixel-identical compression, including full resolution and alpha.
  const before = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const after = await sharp(webp).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  assert.deepEqual(after.info, before.info)
  assert.ok(after.data.equals(before.data), 'Decoded texture pixels must be identical')
  assert.ok(webp.length < png.length, 'Compression must actually save bytes')
  replacements.set(image.bufferView, webp)
  image.mimeType = 'image/webp'
  for (const texture of gltf.textures) if (texture.source === index) {
    texture.extensions = { ...texture.extensions, EXT_texture_webp: { source: index } }
    delete texture.source
  }
  originalImageBytes += png.length; optimizedImageBytes += webp.length
}
gltf.extensionsUsed = [...new Set([...(gltf.extensionsUsed ?? []), 'EXT_texture_webp'])]
gltf.extensionsRequired = [...new Set([...(gltf.extensionsRequired ?? []), 'EXT_texture_webp'])]
const chunks = []
let offset = 0
for (const [index, view] of gltf.bufferViews.entries()) {
  const previous = original.bufferViews[index]
  const data = replacements.get(index) ?? bin.subarray(previous.byteOffset ?? 0, (previous.byteOffset ?? 0) + previous.byteLength)
  view.byteOffset = offset; view.byteLength = data.length
  chunks.push(data)
  const padding = (4 - data.length % 4) % 4
  chunks.push(Buffer.alloc(padding)); offset += data.length + padding
}
const packed = Buffer.concat(chunks)
gltf.buffers[0].byteLength = packed.length
// Every non-image view, accessor, skin and morph target retains its exact data.
for (const [index, view] of gltf.bufferViews.entries()) if (!replacements.has(index)) {
  const old = original.bufferViews[index]
  assert.ok(packed.subarray(view.byteOffset, view.byteOffset + view.byteLength)
    .equals(bin.subarray(old.byteOffset ?? 0, (old.byteOffset ?? 0) + old.byteLength)))
}
for (const key of ['accessors', 'meshes', 'skins', 'animations', 'nodes']) assert.deepEqual(gltf[key], original[key])
const json = Buffer.from(JSON.stringify(gltf))
const paddedJson = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)])
const header = Buffer.alloc(20), binHeader = Buffer.alloc(8)
header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4)
header.writeUInt32LE(28 + paddedJson.length + packed.length, 8)
header.writeUInt32LE(paddedJson.length, 12); header.writeUInt32LE(0x4e4f534a, 16)
binHeader.writeUInt32LE(packed.length); binHeader.writeUInt32LE(0x004e4942, 4)
const output = Buffer.concat([header, paddedJson, binHeader, packed])
const digest = buffer => createHash('sha256').update(buffer).digest('hex')
const outputPath = 'public/models/casino-dealer-v3-web.glb'
// Another working pane may be rebuilding the source. Never publish a stale pair.
assert.equal(digest(await readFile(sourcePath)), digest(source), 'Dealer changed during compression; rerun')
assert.deepEqual(JSON.parse(await readFile('public/models/casino-dealer-v3.json', 'utf8')), manifest)
await writeFile(outputPath, output)
await writeFile('public/models/casino-dealer-v3-web.json', JSON.stringify({
  sourceModel: manifest.model, sourceSha256: digest(source),
  model: `/models/casino-dealer-v3-web.glb?v=${digest(output).slice(0, 12)}`,
  sourceBytes: source.length, bytes: output.length, originalImageBytes, optimizedImageBytes,
  texture: 'lossless WebP; identical decoded pixels; geometry and rig unchanged',
}, null, 2) + '\n')
console.log(JSON.stringify({ sourceBytes: source.length, bytes: output.length, saved: source.length - output.length, originalImageBytes, optimizedImageBytes }))
