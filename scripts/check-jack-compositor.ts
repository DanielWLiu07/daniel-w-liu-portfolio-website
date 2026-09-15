import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { skipsPosition } from '../node_modules/blender-to-threejs/src/comp/decal'

const source = readFileSync('components/resume/casino/jack-intro.tsx', 'utf8')
assert.ok(source.includes('k.mat.color.setScalar(1)'), 'card wall remains fully bright')
assert.ok(source.includes('L.mesh.quaternion.premultiply(piece.mesh.quaternion)'), 'word uses its carrier card hinge')
assert.ok(source.includes('projection * carriedScale'), 'word scales together with its card')
assert.equal((source.match(/asCard\(new THREE.Mesh/g) ?? []).length, 6, 'hero, three-carrier factory and grid each register both sides')
assert.ok(!/asDecal\(new THREE.Mesh\((shape|snakeGeo)/.test(source), 'solid cards must not be marked as decals')
assert.equal(skipsPosition({ userData: { compForcePosition: true }, material: { transparent: true } }), false)
assert.equal(skipsPosition({ userData: { compNoPosition: true }, material: { transparent: true } }), true)
const scene = readFileSync('components/resume/casino/casino-scene.tsx', 'utf8')
assert.ok(scene.includes('fx.current.impactAge < 4.5'), 'position pass refreshes throughout the pre-impact intro, including seeking')
console.log('PASS: both sides of solid Jack cards enter position effects; alpha lettering stays excluded; intro position refresh remains enabled')
