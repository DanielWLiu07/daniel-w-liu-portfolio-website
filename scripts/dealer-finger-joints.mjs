import assert from 'node:assert/strict'
import { Matrix4, SphereGeometry, Vector3 } from 'three'

/** Close visible spaces between the closed phalange shells with skinned joints.
 * Appended to the existing hand primitive: no extra material or draw call.
 */
export function addFingerJoints(meshName, attributes, indices, skin, nodes, inverseBinds) {
  const side = meshName === 'HandLeft' ? 'Left' : 'Right'
  const arrays = Object.fromEntries(Object.entries(attributes).map(([name, values]) => [name, Array.from(values)]))
  const widths = { POSITION: 3, NORMAL: 3, TEXCOORD_0: 2, JOINTS_0: 4, WEIGHTS_0: 4 }
  for (const name of Object.keys(arrays)) assert.ok(widths[name], `Unsupported hand attribute ${name}`)
  const outputIndices = Array.from(indices), sourceVertices = arrays.POSITION.length / 3
  let joints = 0
  for (const digit of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) for (const segment of [1, 2, 3]) {
    const bone = skin.joints.findIndex(id => nodes[id].name === `${side}${digit}${segment}`)
    assert.ok(bone >= 0)
    const matrix = new Matrix4().fromArray(inverseBinds, bone * 16).invert()
    const center = new Vector3().setFromMatrixPosition(matrix)
    // Small round knuckles overlap the ends without thickening entire fingers.
    const radius = digit === 'Thumb' ? .0085 : digit === 'Pinky' ? .0065 : .0075
    let nearest = 0, distance = Infinity
    for (let v = 0; v < sourceVertices; v++) {
      const d = new Vector3().fromArray(arrays.POSITION, v * 3).distanceToSquared(center)
      if (d < distance) { distance = d; nearest = v }
    }
    const sphere = new SphereGeometry(radius, 8, 4), base = arrays.POSITION.length / 3
    for (let v = 0; v < sphere.attributes.position.count; v++) {
      const p = new Vector3().fromBufferAttribute(sphere.attributes.position, v).add(center)
      const n = new Vector3().fromBufferAttribute(sphere.attributes.normal, v)
      arrays.POSITION.push(...p.toArray()); arrays.NORMAL.push(...n.toArray())
      arrays.TEXCOORD_0?.push(arrays.TEXCOORD_0[nearest * 2], arrays.TEXCOORD_0[nearest * 2 + 1])
      // A spherical joint follows one bone rigidly, so flexion cannot tear it.
      arrays.JOINTS_0.push(bone, 0, 0, 0); arrays.WEIGHTS_0.push(1, 0, 0, 0)
    }
    for (const index of sphere.index.array) outputIndices.push(base + index)
    sphere.dispose(); joints++
  }
  return { attributes: Object.fromEntries(Object.entries(arrays).map(([name, values]) => [name, new attributes[name].constructor(values)])), indices: Uint16Array.from(outputIndices), joints }
}
