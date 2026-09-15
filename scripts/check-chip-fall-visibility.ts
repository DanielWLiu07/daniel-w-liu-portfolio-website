import assert from 'node:assert/strict'
import { DoubleSide, Matrix4, Mesh, MeshBasicMaterial, Object3D, Quaternion, Raycaster, Vector3 } from 'three'
import { cycloramaGeometry, ROOM_FLOOR_DROP } from '../components/resume/casino/room-geometry'
import { chipTableHull, createChipPile } from '../components/resume/casino/interactive-chip-pile'

async function check() {
  const geometry = cycloramaGeometry(120, 40, -20, 9, 240)
  const material = new MeshBasicMaterial({ side: DoubleSide })
  const room = new Mesh(geometry, material)
  const camera = new Vector3(0, 4.6, 12.5)
  const blocked = (point: Vector3, floorY: number) => {
    room.position.y = floorY; room.updateMatrixWorld(true)
    const ray = new Raycaster(camera, point.clone().sub(camera).normalize(), 0, camera.distanceTo(point) - 0.01)
    return ray.intersectObject(room).length > 0
  }
  assert.ok(blocked(new Vector3(0, -0.3, -4), -0.06), 'Reproduces immediate old-background occlusion')
  for (const x of [-10, 0, 10]) for (const y of [-0.3, -1, -3]) {
    assert.ok(!blocked(new Vector3(x, y, -4), -ROOM_FLOOR_DROP), 'Backdrop does not erase a falling chip')
  }
  const position = new Vector3(0, 0.065, -0.4)
  const physics = await createChipPile([{ position, quaternion: new Quaternion() }], 0.55, 0.13,
    chipTableHull(2, -1, new Matrix4().makeRotationX(-Math.PI / 2)), false, -ROOM_FLOOR_DROP)
  const mesh = new Object3D()
  physics.kick(0, new Vector3(0, -0.05, -1))
  let fell = false, moving = true
  for (let i = 0; i < 3600 && moving; i++) {
    moving = physics.step(1 / 120, [mesh])
    if (mesh.position.y < -1) fell = true
    assert.ok(mesh.visible, 'Chip remains present throughout fall and landing')
  }
  assert.ok(fell && !moving, 'Chip falls and settles on the actual room floor')
  assert.ok(mesh.position.y > -ROOM_FLOOR_DROP && mesh.position.y < -ROOM_FLOOR_DROP + 0.6)
  physics.dispose(); geometry.dispose(); material.dispose()
  console.log('PASS: reproduced background occlusion, clear fall path, visible fall and physical floor landing')
}
void check()
