/** Smaller delivery art; preserve authored files and every compressed geometry byte. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
const parse = b => { const n = b.readUInt32LE(12); return { json: JSON.parse(b.subarray(20, 20+n)), bin: b.subarray(28+n) } }
const manifest = JSON.parse(await readFile('public/models/casino-dealer-v3-meshopt.json', 'utf8'))
const authored = JSON.parse(await readFile('public/models/casino-dealer-v3.json', 'utf8'))
assert.equal(manifest.sourceModel, authored.model, 'Regenerate meshopt after changing the authored dealer')
const source = await readFile(`public${manifest.model.split('?')[0]}`)
const { json: gltf, bin } = parse(source)
const original = structuredClone(gltf)
const raw = parse(await readFile(`public${authored.model.split('?')[0]}`))
assert.equal(gltf.images.length, 1)
const imageView = raw.json.bufferViews[raw.json.images[0].bufferView]
const image = await sharp(raw.bin.subarray(imageView.byteOffset, imageView.byteOffset+imageView.byteLength))
  .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 76, effort: 6 }).toBuffer()
const chunks = [], copied = new Map(); let offset = 0
function append(data, key) {
  if (copied.has(key)) return copied.get(key)
  const at = offset; copied.set(key, at); chunks.push(data)
  const padding = (4-data.length%4)%4; chunks.push(Buffer.alloc(padding)); offset += data.length+padding
  return at
}
for (const [i, view] of gltf.bufferViews.entries()) {
  if (view.buffer === 0) {
    const isImage = i === gltf.images[0].bufferView
    const data = isImage ? image : bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0)+view.byteLength)
    view.byteOffset = append(data, `view:${i}`); view.byteLength = data.length
  }
  const ext = view.extensions?.EXT_meshopt_compression
  if (ext) {
    assert.equal(ext.buffer, 0)
    const at = ext.byteOffset ?? 0
    ext.byteOffset = append(bin.subarray(at, at+ext.byteLength), `compressed:${at}:${ext.byteLength}`)
  }
}
const packed = Buffer.concat(chunks); gltf.buffers[0].byteLength = packed.length
for (const [i, before] of original.bufferViews.entries()) {
  const after = gltf.bufferViews[i], a = before.extensions?.EXT_meshopt_compression, b = after.extensions?.EXT_meshopt_compression
  if (a) assert.ok(bin.subarray(a.byteOffset, a.byteOffset+a.byteLength).equals(packed.subarray(b.byteOffset,b.byteOffset+b.byteLength)))
  if (before.buffer === 0 && i !== gltf.images[0].bufferView) assert.ok(bin.subarray(before.byteOffset??0,(before.byteOffset??0)+before.byteLength).equals(packed.subarray(after.byteOffset,after.byteOffset+after.byteLength)))
}
for (const key of ['accessors','meshes','skins','animations','nodes']) assert.deepEqual(gltf[key],original[key])
const json = Buffer.from(JSON.stringify(gltf)), padded = Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)])
const header=Buffer.alloc(20), bh=Buffer.alloc(8)
header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+padded.length+packed.length,8)
header.writeUInt32LE(padded.length,12);header.writeUInt32LE(0x4e4f534a,16);bh.writeUInt32LE(packed.length);bh.writeUInt32LE(0x004e4942,4)
const result=Buffer.concat([header,padded,bh,packed]), digest=createHash('sha256').update(result).digest('hex')
assert.ok(result.length < source.length)
await writeFile('public/models/casino-dealer-v3-lean.glb',result)
await writeFile('public/models/casino-dealer-v3-lean.json',JSON.stringify({...manifest,model:`/models/casino-dealer-v3-lean.glb?v=${digest.slice(0,12)}`,bytes:result.length,optimizedImageBytes:image.length,texture:'1024px WebP quality76 from original PNG; geometry/rig/morph data unchanged'},null,2)+'\n')
const names=['casino-back',...['hearts','spades'].flatMap(s=>['10','J','Q','K','A'].map(r=>`${r}-${s}`)),'J-clubs','J-diamonds']
await mkdir('public/textures/royal-flush/delivery',{recursive:true})
let beforeCards=0, afterCards=0
for(const name of names){
  const before=await readFile(`public/textures/royal-flush/${name}.webp`)
  const meta=await sharp(before).metadata()
  // Re-render vector originals rather than recompressing existing JPEG-like artifacts.
  const card=await sharp(`public/textures/royal-flush/${name}.svg`,{density:144}).resize(512,Math.round(512*meta.height/meta.width),{fit:'fill'}).flatten({background:'#ffffff'}).webp({quality:82,effort:6}).toBuffer()
  const chosen=card.length<before.length?card:before
  await writeFile(`public/textures/royal-flush/delivery/${name}.webp`,chosen)
  beforeCards+=before.length;afterCards+=chosen.length
}
console.log({dealerBefore:source.length,dealerAfter:result.length,textureBefore:manifest.optimizedImageBytes,textureAfter:image.length,beforeCards,afterCards})
