import assert from 'node:assert/strict'
import {PerspectiveCamera,Vector3} from 'three'
import {titleDepthTransform} from '../components/resume/casino/title-depth'

for(const aspect of [1500/900,390/844]) for(const eye of [[0,4.6,12.5],[3,5,10],[-2,3,8]]) {
  const camera=new PerspectiveCamera(25,aspect,.1,200)
  camera.position.fromArray(eye);camera.lookAt(0,1.4,-.6);camera.updateMatrixWorld(true)
  const {scale,position}=titleDepthTransform(camera.position)
  for(const point of [[-4,3,0],[4,3,0],[0,4.5,0],[0,2.5,0],[-6,-3,2],[6,8,-2]]) {
    const original=new Vector3(...point),shifted=original.clone().multiplyScalar(scale).add(position)
    const before=original.clone().project(camera),after=shifted.clone().project(camera)
    assert.ok(Math.hypot(before.x-after.x,before.y-after.y)<1e-12,'Depth move must preserve projected position, size and offscreen paths')
    assert.ok(after.z>before.z,'Letter lies farther along the same viewing ray')
  }
}
const {position}=titleDepthTransform(new Vector3(0,4.6,12.5))
assert.ok(position.z< -6,'Default title depth clears the character at the back rail')
console.log('Title depth: unchanged projection across portrait/desktop, camera moves and offscreen letter paths; background depth verified.')
