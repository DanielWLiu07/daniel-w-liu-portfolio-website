import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Group, Mesh, MeshBasicMaterial } from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { CardRenderLayers, cardRenderLayer } from '../components/resume/casino/card-render-layers'

const scene = new Group(), paper = new Group(), foreground = new Group()
paper.userData.cardRenderLayer = 1
foreground.userData.cardRenderLayer = 2
const stock = new Mesh(undefined, new MeshBasicNodeMaterial())
const word = new Mesh(undefined, new MeshBasicNodeMaterial())
stock.add(word); paper.add(stock); scene.add(paper, foreground)
assert.equal(cardRenderLayer(word), 1)
foreground.add(stock)
assert.equal(cardRenderLayer(word), 2, 'layer follows current parent, not a stale cache')
paper.add(stock)
paper.userData.cardRenderLayer = 0
assert.equal(cardRenderLayer(word), 0, 'replaying intact wall restores native depth')
const layers = new CardRenderLayers()
const unconverted = new Mesh(undefined, new MeshBasicMaterial())
scene.add(unconverted)
layers.prepare(scene)
assert.equal(stock.material.depthNode, layers.depth)
assert.equal(word.material.depthNode, layers.depth)
const version = stock.material.version
layers.prepare(scene)
assert.equal(stock.material.version, version, 'no recompilation every frame')
assert.equal(stock.material.depthTest, true, 'retain self-occlusion')
for (const distance of [.1, 1, 10, 17, 40, 100, 1000]) {
  const order = distance / (distance + 20)
  const paperDepth = .2 + order * .2
  const propDepth = order * .15
  assert.ok(propDepth < .2 && paperDepth >= .2 && paperDepth < .4)
}
const intro = readFileSync('components/resume/casino/jack-intro.tsx', 'utf8')
assert.ok(!intro.includes('b.depth.behindForeground('), 'never push paper into the physical table to layer it')
const comp = readFileSync('components/resume/casino/compositor-post.tsx', 'utf8')
assert.ok(comp.includes('comp.setPositionDepth(cardLayers.depth)'), 'position AOV matches painted visibility')
console.log('PASS: inherited layers, replay, stable materials, self-depth, disjoint depth bands and matching position AOV')
