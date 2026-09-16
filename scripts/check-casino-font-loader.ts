import assert from 'node:assert/strict'
import { loadCasinoFont } from '../components/resume/casino/font-loader'

async function main() {
  let loads = 0, adds = 0
  const pending: (() => void)[] = []
  Object.assign(globalThis, {
    FontFace: class {
      load() { loads++; return new Promise(resolve => pending.push(() => resolve(this))) }
    },
    document: { fonts: { add() { adds++ } } },
  })
  const a = loadCasinoFont('KatieRoze', '/font.woff2')
  const b = loadCasinoFont('KatieRoze', '/font.woff2')
  assert.equal(a, b, 'startup and canvas consumers share one pending load')
  assert.equal(loads, 1)
  pending.shift()!()
  await Promise.all([a, b])
  assert.equal(adds, 1)
  await loadCasinoFont('KatieRoze', '/font.woff2')
  assert.equal(loads, 1, 'completed faces are reused too')
  const c = loadCasinoFont('DifferentFamily', '/font.woff2')
  assert.equal(loads, 2, 'distinct font families remain distinct')
  pending.shift()!(); await c
  console.log('PASS: font startup, concurrent and subsequent consumers share the same FontFace')
}
void main()
