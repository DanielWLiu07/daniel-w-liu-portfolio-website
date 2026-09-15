import assert from 'node:assert/strict'
import { Texture } from 'three'
import { compGraph, compileComp, renderComp, watercolorGraph } from 'blender-to-threejs'
import { impactRevealMask, withImpactReveal } from '../components/resume/casino/impact-reveal'

// White represents impact paint; black represents the restored scene. Evaluate the
// actual compositor graph so endpoints and motion include its noise and aspect handling.
const c = compGraph()
const graph = withImpactReveal(c, c.blend(c.uniform('after', 0), [0, 0, 0, 1], [1, 1, 1, 1]))
for (const amount of [0, 1, 2, 5]) for (const [width, height] of [[65, 65], [101, 41], [41, 101]]) {
  let previous: Float32Array | undefined
  for (const progress of [0, 0.001, 0.005, 0.01, 0.02, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
    const ctx = { width, height, uniforms: { after: 1, impactReturn: progress, impactNoise: amount } }
    const { data } = renderComp(graph, ctx)
    assert.deepEqual(renderComp(graph, { ...ctx, time: 123 }).data, data, 'noise does not animate or flicker')
    for (let i = 0; i < data.length; i += 4) {
      assert.equal(data[i + 3], 1, 'reveal never makes the scene transparent')
      if (previous) assert.ok(data[i] <= previous[i] + 1e-6, 'revealed pixels are never covered again')
      if (progress === 0 || progress === 1) assert.equal(data[i], 1 - progress, 'all pixels reach the correct endpoint')
      if (progress <= 0.02 && data[i] < 1) {
        const pixel = i / 4
        const x = ((pixel % width) + 0.5 - width / 2) * 2 / Math.max(width, height)
        const y = (Math.floor(pixel / width) + 0.5 - height / 2) * 2 / Math.max(width, height)
        assert.ok(Math.hypot(x, y) < 0.04, 'first reveal stays tiny and centred, without distant patches even at noise 5')
      }
    }
    const centre = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4
    if (progress >= 0.1) assert.equal(data[centre], 0, 'reveal grows from the centre')
    if (width === height && progress === 0.5) {
      let asymmetric = 0
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (Math.abs(data[(y * width + x) * 4] - data[(x * width + y) * 4]) > 0.1) asymmetric++
      }
      if (amount === 0) assert.equal(asymmetric, 0, 'zero noise produces a clean circle')
      else assert.ok(asymmetric > 50, 'edge has visible irregularity instead of circular symmetry')
    }
    previous = data
  }
}

const paper = new Texture(), sceneTexture = new Texture(), positionTexture = new Texture()
const a = compGraph(), b = compGraph()
const opts = { paper, bleedTaps: 3 as const, compose: 'gouache' as const }
const base = compileComp(watercolorGraph(a, opts), { sceneTexture, positionTexture })
const reveal = compileComp(withImpactReveal(b, watercolorGraph(b, opts)), { sceneTexture, positionTexture })
const body = compileComp(impactRevealMask(compGraph()), { sceneTexture })
assert.equal(body.stages.length, 0, 'Dealer mask compiles inline without a scene render or texture pass')
assert.ok(body.uniforms.impactReturn && body.uniforms.impactNoise, 'Dealer and compositor share reveal controls')
assert.equal(reveal.stages.length, base.stages.length, 'textured reveal adds no render passes')
for (const stage of [...base.stages, ...reveal.stages]) stage.target.dispose()
paper.dispose(); sceneTexture.dispose(); positionTexture.dispose()
console.log('OK: irregular edge, stable monotonic reveal, opaque complete endpoints, portrait/landscape coverage and no extra passes')
