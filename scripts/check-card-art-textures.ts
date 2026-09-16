import assert from 'node:assert/strict'
import { Texture } from 'three'
import { createCardArtworkCache } from '../components/resume/casino/card-art-textures'

async function check() {
  let loads = 0
  const texture = new Texture()
  let finish!: (texture: Texture) => void
  const cache = createCardArtworkCache(() => { loads++; return new Promise(resolve => { finish = resolve }) })
  const intro = cache.load('back'), dealer = cache.load('back')
  assert.equal(intro, dealer, 'concurrent actors share one request')
  assert.throws(() => cache.read('back'), error => error === intro, 'Suspense waits on the same request')
  await Promise.resolve()
  finish(texture)
  assert.equal(await intro, texture)
  assert.equal(cache.read('back'), texture)
  assert.equal(await cache.load('back'), texture, 'remount reuses the texture instead of uploading another copy')
  assert.equal(loads, 1)
  const other = cache.load('face')
  await Promise.resolve()
  const face = new Texture()
  finish(face)
  assert.equal(await other, face)
  assert.notEqual(cache.read('back'), cache.read('face'), 'different prints stay independent')
  const error = new Error('Artwork failed')
  const failed = createCardArtworkCache(() => Promise.reject(error))
  await assert.rejects(failed.load('missing'), error)
  assert.throws(() => failed.read('missing'), error, 'failed Suspense loads throw rather than loop forever')
  texture.dispose(); face.dispose()
  console.log('PASS: shared requests, Suspense, remount reuse, independent prints and rejected artwork')
}
void check()
