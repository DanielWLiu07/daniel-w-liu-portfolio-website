import assert from 'node:assert/strict'
import { Group, Matrix4, Object3D, Quaternion, Vector3 } from 'three'
import { chipTableHull, createChipPile } from '../components/resume/casino/interactive-chip-pile'
import { createChipController } from '../components/resume/casino/chip-pile-controller'

async function main() {
const table = chipTableHull(20, -15, new Matrix4().makeRotationX(-Math.PI / 2))
for (const recipientDie of [false, true]) {
  const homes = [
    { position: new Vector3(-2, .5, 0), quaternion: new Quaternion(), radius: .5, height: 1, die: true },
    { position: new Vector3(0, recipientDie ? .5 : .065, 0), quaternion: new Quaternion(), radius: .55, height: recipientDie ? 1.1 : .13, die: recipientDie },
  ]
  const world = await createChipPile(homes, .55, .13, table, true)
  const objects = homes.map(() => new Object3D())
  world.kick(0, new Vector3(1, -.025, 0))
  let received = false, penetration = 0
  for (let i = 0; i < 480; i++) {
    world.step(1 / 120, objects)
    received ||= world.velocity(1).x > .1
    penetration = Math.min(penetration, world.contactDistance(0, 1))
    assert.ok(objects.every(o => o.position.y > 0), 'Props stay above the tabletop')
  }
  assert.ok(received, 'Untouched chip or die receives collision momentum')
  assert.ok(penetration > -.015, `No deep overlap: ${penetration}`)
  world.dispose()
  console.log({ recipientDie, received, penetration })
}
// The visible rail rises above the felt. A small, slow chip must hit it instead
// of passing through; high impulses remain free to launch over the bumper.
const rail = { radius: 3, chord: -2, tube: .35, y: 0 }
const railWorld = await createChipPile([{ position: new Vector3(2.35, .05, 0), quaternion: new Quaternion(), radius: .2, height: .1 }], .2, .1,
  chipTableHull(3.35, -2.35, new Matrix4().makeRotationX(-Math.PI / 2)), true, -6, rail)
const chip = new Object3D()
railWorld.kick(0, new Vector3(1, 0, 0), .25)
let farthest = 0
for (let i = 0; i < 360; i++) { railWorld.step(1 / 120, [chip]); farthest = Math.max(farthest, chip.position.x) }
assert.ok(farthest < 2.7, `Chip meets raised rail: ${farthest}`)
railWorld.dispose()
// Same controller owns dice and chips even under different render transforms.
const controller = createChipController(() => ({ radius: 20, chord: -15, matrix: new Matrix4().makeRotationX(-Math.PI / 2) }), () => .55)
const parent = new Group(), other = new Group(), die = new Object3D(), target = new Object3D()
parent.position.x = -2; parent.rotation.y = .7; parent.add(die); other.add(target)
die.position.y = .5; target.position.y = .065
const removeDie = controller.register({ root: parent, meshes: [die], radius: .5, height: 1, die: true })
const removeChip = controller.register({ root: other, meshes: [target], radius: .55, height: .13 })
assert.ok(!controller.active, 'Registration never initializes physics')
controller.impact(die.getWorldPosition(new Vector3()), 0, new Vector3(1, -.025, 0), die)
for (let i = 0; i < 200 && !controller.active; i++) await new Promise(resolve => setTimeout(resolve, 5))
assert.ok(controller.active)
for (let i = 0; i < 480; i++) controller.step(1 / 120, 10 + i / 120)
assert.ok(target.position.x > .1, 'Targeted die hit collides with untouched chip')
controller.step(1 / 120, 0)
assert.ok(!controller.active, 'Replay releases shared physics')
removeDie(); removeChip(); controller.dispose()
console.log('PASS: shared dice/chip contacts, tabletop, raised rail, lazy activation and replay')

}
void main()
