import assert from 'node:assert/strict'
import { Box3, Vector3 } from 'three'
import { fitChipInGap } from '../components/resume/casino/chip-home'

// Measured closed folder at its final authored pose, after its deal completes.
const folder = new Box3(new Vector3(-1.589607586, 0, -0.697411146), new Vector3(1.942659573, 0.13, 2.597411146))
for (const size of [0.8, 1.6, 2.4]) for (const rail of [0.3, 0.7, 1.2]) {
  const rear = -2.5 + rail / 2
  for (const z of [-4, -1.6, -0.65, 1, 4]) {
    const home = fitChipInGap({ x: 0, z: 0, size }, 0, z, size, rear, folder)
    const hoverRadius = home.size * 0.55 * 1.18
    assert.equal(home.x, 0, 'coin never gets diverted sideways around the arriving folder')
    assert(home.z - hoverRadius >= rear + 0.079999, 'full hover clears rail')
    assert(home.z + hoverRadius <= folder.min.z - 0.079999, 'full hover clears closed resume')
    assert(home.size <= size, 'fit never enlarges the authored coin')
    assert.equal(home.z, (rear + folder.min.z) / 2, 'lands in the gap')
  }
}
const free = fitChipInGap({ x: 0, z: 0, size: 1 }, 0, 0.5, 1, -Infinity, new Box3())
assert.deepEqual(free, { x: 0, z: 0.5, size: 1 }, 'scenes without a rear rail retain authored placement')
console.log('PASS centered landing gap, full-hover rail/resume clearance, authored scale cap and fallback scene')
