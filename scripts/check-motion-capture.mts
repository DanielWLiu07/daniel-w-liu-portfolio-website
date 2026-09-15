import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { AnimationMixer, Mesh, MeshStandardMaterial, Quaternion, Texture, Vector3 } from 'three'
import { DealerRetargeter, skullExpressions } from '../components/resume/motion/retarget'
import { parseTake, sampleTake, takeClip } from '../components/resume/motion/takes'
import { sceneMotionActive, validPose } from '../components/resume/motion/scene-bridge'
import type { CaptureFrame, Landmark, MotionSession, MotionTake } from '../components/resume/motion/types'

const loader = new GLTFLoader()
loader.register(() => ({ name: 'HEADLESS_TEXTURES', loadTexture: () => Promise.resolve(new Texture()) }))
const asset = process.argv[2] === 'v3' ? 'casino-dealer-v3' : 'casino-dealer-v2'
const data = readFileSync(`public/models/${asset}.glb`)
const gltf = await loader.parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '')
const model = clone(gltf.scene), rig = new DealerRetargeter(model)
const rest = rig.sample(0)
const landmark = (v: Vector3): Landmark => ({ x: v.x, y: -v.y, z: -v.z, visibility: 1 })
const pos = (name: string) => rig.bones.get(name)!.getWorldPosition(new Vector3())
const pose: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }))
for (const [i, name] of [[11, 'LeftArm'], [12, 'RightArm'], [13, 'LeftForeArm'], [14, 'RightForeArm'], [15, 'LeftHand'], [16, 'RightHand'], [23, 'LeftUpLeg'], [24, 'RightUpLeg']] as const) pose[i] = landmark(pos(name))
// Raise the left arm, leaving the right arm at its bind direction.
const shoulder = pos('LeftArm'), elbow = pos('LeftForeArm'), wrist = pos('LeftHand')
const raised = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), .65)
pose[13] = landmark(elbow.clone().sub(shoulder).applyQuaternion(raised).add(shoulder))
pose[15] = landmark(wrist.clone().sub(shoulder).applyQuaternion(raised).add(shoulder))
const frame: CaptureFrame = { pose, face: [], leftHand: [], rightHand: [], expressions: { eyeBlinkLeft: .8, mouthSmileLeft: .6, mouthSmileRight: .4, jawOpen: .7 }, aspect: 4/3 }
const lengths = new Map([...rig.bones].map(([name, bone]) => [name, bone.position.length()]))
for (let i=0; i<100; i++) rig.update(frame, 1/60, .08)
const aimed = pos('LeftForeArm').sub(pos('LeftArm')).normalize()
const target = new Vector3(pose[13].x-pose[11].x, -(pose[13].y-pose[11].y), -(pose[13].z-pose[11].z)).normalize()
assert.ok(aimed.dot(target) > .999, 'Left arm follows the captured direction')
assert.ok(rig.bones.get('LeftArm')!.quaternion.angleTo(new Quaternion().fromArray(rest.bones.LeftArm)) > .5)
for (const [name, bone] of rig.bones) {
  assert.equal(bone.position.length(), lengths.get(name), 'Retargeting preserves limb lengths')
  assert.ok(Math.abs(bone.quaternion.length()-1) < 1e-6)
}
const moved = rig.sample(1)
assert.ok(moved.expressions.blinkLeft > .79 && moved.expressions.blinkRight === 0, 'Blink sides stay independent')
assert.ok(Math.abs(moved.expressions.smile-.5) < .001 && moved.expressions.jawOpen > .69)
assert.ok(validPose(moved))
assert.equal(validPose({ ...moved, bones: { Head: [NaN, 0, 0, 1] } }), false)
assert.equal(skullExpressions({ jawOpen: 10 }).jawOpen, 1)

// Hand landmarks have no visibility score; zero must not reject their coordinates.
const hand: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }))
hand[0] = { ...landmark(pos('LeftHand')), visibility: 0 }
for (const [finger, first] of [['Thumb',1],['Index',5],['Middle',9],['Ring',13],['Pinky',17]] as const) {
  for (let joint=1;joint<=3;joint++) hand[first+joint-1] = { ...landmark(pos(`Left${finger}${joint}`)), visibility: 0 }
  const last = pos(`Left${finger}3`), previous = pos(`Left${finger}2`)
  hand[first+3] = { ...landmark(last.clone().add(last.clone().sub(previous))), visibility: 0 }
}
hand[8] = { ...hand[7], z: hand[7].z + .03 }
for (let i=0;i<100;i++) rig.update({ ...frame, leftHand: hand }, 1/60, .08)
assert.ok(rig.bones.get('LeftIndex3')!.quaternion.angleTo(new Quaternion().fromArray(moved.bones.LeftIndex3)) > .2, 'Fingertip curl follows valid hand data without visibility scores')
const curled = rig.sample(2)
if (asset === 'casino-dealer-v3') {
  // Cartoon face takes also carry nonuniform head scale and additional sockets.
  curled.scales = { ...curled.scales, Head: [1.2, .9, 1.1] }
  curled.expressions.socketWideLeft = .7
}
for (let i=0;i<150;i++) rig.update(null,1/60,.08)
assert.ok(rig.bones.get('LeftArm')!.quaternion.angleTo(new Quaternion().fromArray(rest.bones.LeftArm)) < .001, 'Lost tracking returns smoothly to neutral')

const take: MotionTake = { version: 1, model: asset, name: 'Test wave', duration: 2, frames: [rest,moved,curled] }
// A restored or paused take releases the scene; scrubbing is only a brief preview.
const session = { mode:'playback', take, playing:false, frame, receivedAt:1000 } as MotionSession
assert.equal(sceneMotionActive(session,1100),false,'Paused/restored take must not freeze idle')
assert.equal(sceneMotionActive({...session,playing:true},1100),true)
assert.equal(sceneMotionActive(session,1100,1000),true,'Scrub previews a pose')
assert.equal(sceneMotionActive(session,1500,1000),false,'Scrub releases idle again')
assert.equal(sceneMotionActive({...session,mode:'live'},1100),true)
assert.equal(sceneMotionActive({...session,mode:'recording'},1600),false,'Stale tracking releases idle')
assert.equal(sceneMotionActive({...session,mode:'live',frame:null},1100),false)
assert.equal(sceneMotionActive({...session,mode:'idle'},1100),false)
assert.deepEqual(parseTake(JSON.stringify(take)),take)
assert.throws(() => parseTake(JSON.stringify({ ...take, frames: [rest,{ ...moved, time: 0 }] })))
assert.throws(() => parseTake(JSON.stringify({ ...take, model: 'other-rig' })))
assert.ok(validPose(sampleTake(take,.5)))
const clip = takeClip(take,model)
const mixer = new AnimationMixer(model)
mixer.clipAction(clip).play(); mixer.setTime(1)
assert.ok(rig.bones.get('LeftArm')!.quaternion.clone().normalize().angleTo(new Quaternion().fromArray(moved.bones.LeftArm)) < 1e-5, 'Export tracks bind to the real rig')
mixer.stopAllAction(); mixer.uncacheRoot(model)

// Round-trip actual mesh/skin/morph animation. Only bitmap decoding is stubbed.
class HeadlessFileReader {
  result: ArrayBuffer | string | null = null
  onloadend: (() => void) | null = null
  async readAsArrayBuffer(blob: Blob) { this.result = await blob.arrayBuffer(); this.onloadend?.() }
  async readAsDataURL(blob: Blob) { this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`; this.onloadend?.() }
}
Object.assign(globalThis,{ FileReader: HeadlessFileReader })
model.traverse(object => {
  if (!(object instanceof Mesh)) return
  const clear = (material: MeshStandardMaterial) => { const copy=material.clone(); copy.map=null; return copy }
  object.material = Array.isArray(object.material) ? object.material.map(m => clear(m as MeshStandardMaterial)) : clear(object.material as MeshStandardMaterial)
})
const exported = await new GLTFExporter().parseAsync(model,{ binary: true, animations: [takeClip(take,model)] })
assert.ok(exported instanceof ArrayBuffer)
const roundtrip = await loader.parseAsync(exported,'')
assert.equal(roundtrip.animations.length,1)
assert.ok(roundtrip.animations[0].tracks.length >= 58+3, 'Bone and facial tracks survive GLB export')
assert.equal(roundtrip.animations[0].duration,2)
if (asset === 'casino-dealer-v3') {
  const playback=new AnimationMixer(roundtrip.scene)
  playback.clipAction(roundtrip.animations[0]).play(); playback.setTime(1.5)
  assert.ok(roundtrip.scene.getObjectByName('Head')!.scale.distanceTo(new Vector3(1.1,.95,1.05))<1e-5,'GLB round-trip preserves skull squash/scale interpolation')
  let open=-1
  roundtrip.scene.traverse(object=>{const mesh=object as Mesh; const i=mesh.morphTargetDictionary?.socketWideLeft; if(i!==undefined) open=mesh.morphTargetInfluences![i]})
  assert.ok(Math.abs(open-.35)<1e-5,'New socket animation survives the GLB round-trip')
  playback.stopAllAction(); playback.uncacheRoot(roundtrip.scene)
}
console.log('Motion capture: real-rig arm/finger retargeting, fixed limb lengths, facial mapping, dropout recovery, take validation/interpolation, and animated GLB round-trip passed.')
