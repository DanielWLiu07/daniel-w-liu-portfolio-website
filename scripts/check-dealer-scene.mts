import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { Euler, Group, MeshStandardMaterial, PerspectiveCamera, SkinnedMesh, Texture, Vector3 } from 'three'
import { DEALER_HAND_HEIGHT, dealerActing, dealerPart, dealerPlacement, isDealerSkull, poseDealerAtTable } from '../components/resume/casino/dealer-pose'
import { DEALER_DEFAULTS } from '../components/resume/casino/dealer-layout'
import { IMPACT_DEPART, IMPACT_DURATION, impactBurstMotion } from '../components/resume/casino/impact-eye-motion'

const bytes = readFileSync('public/models/casino-dealer-v2.glb')
const loader = new GLTFLoader()
loader.register(() => ({ name: 'HEADLESS_TEXTURES', loadTexture: () => Promise.resolve(new Texture()) }))
const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
const actor = new Group()
const model = clone(gltf.scene)
poseDealerAtTable(model)
for (const [side,sign] of [['Left',1],['Right',-1]] as const) {
  const wrist = model.getObjectByName(`${side}Hand`)!.getWorldPosition(new Vector3())
  assert.ok(wrist.distanceTo(new Vector3(sign*.27,DEALER_HAND_HEIGHT,.405)) < 1e-5, `${side} wrist misses target`)
}
const placement = dealerPlacement(0,-2.5,.7)
assert.equal(placement.scale, 4.5, 'Larger default dealer retains the waist anchor')
// Size and rotation keep the waist anchored; offsets translate that anchor exactly.
for (const size of [.25, 2, 5]) {
  const controls = { ...DEALER_DEFAULTS, dealerSize: size, dealerX: 1.5, dealerY: .6, dealerZ: -2, dealerYaw: 45, dealerPitch: 15, dealerRoll: -10 }
  const home = dealerPlacement(0, -2.5, .7, .7, controls)
  const anchor = new Vector3(0, 1.01, .33).multiplyScalar(home.scale)
    .applyEuler(new Euler(...home.rotation)).add(new Vector3(...home.position))
  assert.ok(anchor.distanceTo(new Vector3(1.5, .6, -5.2)) < 1e-10, 'Controls shift the waist pivot')
}
actor.position.fromArray(placement.position)
actor.scale.setScalar(placement.scale)
actor.add(model)
actor.updateMatrixWorld(true)
const meshes: object[] = []
let closestRail = Infinity
model.traverse((object) => {
  if (!(object instanceof SkinnedMesh)) return
  object.skeleton.update()
  const vertices: number[][] = []
  const uv = object.geometry.getAttribute('uv')
  const uvs: number[][] = []
  for (let i=0;i<object.geometry.getAttribute('position').count;i++) {
    const v=object.getVertexPosition(i,new Vector3()).applyMatrix4(object.matrixWorld)
    assert.ok(v.toArray().every(Number.isFinite))
    vertices.push(v.toArray())
    if (uv) uvs.push([uv.getX(i),uv.getY(i)])
    if (object.name.startsWith('Hand')) closestRail=Math.min(closestRail,Math.hypot(v.y+.7*.225,v.z+2.5))
  }
  const material=object.material as MeshStandardMaterial
  meshes.push({name:object.name,vertices,uvs,indices:object.geometry.index ? Array.from(object.geometry.index.array) : Array.from({length:vertices.length},(_,i)=>i),material:material.name})
})
assert.ok(closestRail > .345, `Hands intersect the rail: ${closestRail}`)
assert.equal(dealerActing(-1).visible,false)
assert.equal(dealerActing(-.0001).visible,false)
assert.equal(dealerActing(0).visible,true, 'Skull must be present on the first impact frame')
const skullParts = new Set<string>(), bodyParts = new Set<string>()
model.traverse((object) => {
  if (!(object instanceof SkinnedMesh)) return
  ;(isDealerSkull(object) ? skullParts : bodyParts).add(dealerPart(object))
})
assert.deepEqual([...skullParts].sort(), ['Jaw', 'Skull'], 'All skull submeshes including the mouth belong to the impact')
assert.ok(bodyParts.has('Hat') && bodyParts.has('Hatband') && bodyParts.has('Shirt'), 'Hat and clothes wait for the body reveal')
for (const age of [0, 1/24, IMPACT_DEPART]) assert.equal(dealerActing(age).bodyReveal, 0)
for (let age = IMPACT_DEPART; age <= IMPACT_DURATION; age += .007) {
  assert.equal(dealerActing(age).bodyReveal, impactBurstMotion(age).reveal, 'Body stays on the compositor reveal clock')
}
assert.equal(dealerActing(IMPACT_DURATION).bodyReveal,1)
assert.equal(dealerActing(3).visible,true, 'Skull stays with the revealed body')
assert.equal(dealerActing(-1).bodyReveal,0, 'Replay resets the body')
assert.ok(dealerActing(4.42).blink>.7)
assert.equal(dealerActing(5).blink,0)
// Verify portrait and desktop silhouettes stay inside the frame.
for (const aspect of [1500/900,390/844]) {
  const fit=Math.min(1,aspect/(1500/900))
  const home=dealerPlacement(0,-2.5,.7,fit)
  const camera=new PerspectiveCamera(25,aspect,.1,200)
  camera.position.set(0,4.6,12.5)
  camera.lookAt(0,1.4,-.6)
  camera.updateMatrixWorld(true)
  const hat=new Vector3(0,home.position[1]+1.8*home.scale,home.position[2]).project(camera)
  const left=new Vector3(-.43*home.scale,.4,home.position[2]).project(camera)
  assert.ok(Math.abs(hat.x)<.95 && Math.abs(hat.y)<.95 && Math.abs(left.x)<.95,`Dealer leaves frame at ${aspect}`)
  console.log(`Aspect ${aspect.toFixed(3)}: hat NDC y=${hat.y.toFixed(3)}`)
}
writeFileSync('blender-bridge/casino-dealer-v2/scene-pose.json',JSON.stringify({meshes,camera:{position:[0,4.6,12.5],target:[0,1.4,-.6],fov:25},table:{feltR:9.84,rail:.7,chordZ:-2.5},placement}))
console.log(`Dealer scene: both wrists solved, minimum hand-to-rail distance ${closestRail.toFixed(3)} m, intro/entrance/blink states and responsive framing passed.`)
