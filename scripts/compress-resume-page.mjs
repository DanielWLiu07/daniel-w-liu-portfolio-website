/** Requires Poppler's pdftoppm. Keep PDF/JPEG originals; encode fresh PDF pixels losslessly. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFile, stat } from 'node:fs/promises'
import sharp from 'sharp'

const png = execFileSync('pdftoppm', ['-f', '1', '-singlefile', '-scale-to-x', '1583', '-scale-to-y', '2048', '-png', 'public/assets/resume.pdf'], { maxBuffer: 32 * 1024 * 1024 })
const webp = await sharp(png).webp({ lossless: true, effort: 6 }).toBuffer()
const original = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const decoded = await sharp(webp).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
assert.deepEqual(decoded.info, original.info)
assert.ok(decoded.data.equals(original.data), 'WebP must preserve every freshly rendered PDF pixel')
const before = (await stat('public/resume/resume-page1.jpg')).size
assert.ok(webp.length < before)
await writeFile('public/resume/resume-page1-lossless.webp', webp)
console.log({ before, after: webp.length, saved: before - webp.length, width: decoded.info.width, height: decoded.info.height })
