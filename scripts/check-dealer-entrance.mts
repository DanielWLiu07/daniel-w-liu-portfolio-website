import assert from 'node:assert/strict'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {clone} from 'three/addons/utils/SkeletonUtils.js'
import {Group,MeshStandardMaterial,PerspectiveCamera,SkinnedMesh,Texture,Vector3} from 'three'
import {dealerPart,dealerPlacement,isDealerSkull,poseDealerAtTable} from '../components/resume/casino/dealer-pose'
import {DEALER_HAT_LIFT,DEALER_HAT_VISIBLE,DEALER_ENTRANCE_SPEED,DEALER_ENTRANCE_END,DEALER_HEAD_SEATED,DEALER_HAT_LAND,DEALER_IDLE_START,DealerEntranceRig,dealerEntranceTime,blendEntranceFace,dealerEntrance,entranceFace} from '../components/resume/casino/dealer-entrance'
import {DealerFaceRig,facePose} from '../components/resume/face/face-rig'
import {FACE_DEFAULTS} from '../components/resume/face/face-settings'
import {IMPACT_DEPART} from '../components/resume/casino/impact-eye-motion'

assert.ok(DEALER_ENTRANCE_END<3.8 && DEALER_HAT_LAND<3,'Assembly and hat placement finish promptly after impact')
// Placement and recovery must join with continuous velocity, including the
// exact seating frames where an abruptly started sine bounce used to jerk.
for(const authored of [1.48,1.95,2.12,2.30,2.70,3.50,3.58,4.40,4.57,4.91]) {
 const age=dealerEntranceTime(authored),dt=.0001
 const before=dealerEntrance(age-dt),at=dealerEntrance(age),after=dealerEntrance(age+dt)
 for(const key of ['headOffset','hatOffset'] as const) {
  const incoming=at[key].clone().sub(before[key]).divideScalar(dt)
  const outgoing=after[key].clone().sub(at[key]).divideScalar(dt)
  assert.ok(incoming.distanceTo(outgoing)<.03,`${key} joins smoothly at ${authored}`)
 }
}
const corner=dealerEntranceTime(4.05),dt=.001
assert.ok(dealerEntrance(corner+dt).hatOffset.distanceTo(dealerEntrance(corner-dt).hatOffset)/(2*dt)>.15,'Hat keeps moving through its overhead arc rather than pausing before sliding sideways')
const loader=new GLTFLoader();loader.register(()=>({name:'TEXTURES',loadTexture:()=>Promise.resolve(new Texture())}))
const data=readFileSync('public/models/casino-dealer-v3.glb')
const source=await loader.parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'')
const root=clone(source.scene);poseDealerAtTable(root)
const meshes:SkinnedMesh[]=[];root.traverse(o=>{if((o as SkinnedMesh).isSkinnedMesh)meshes.push(o as SkinnedMesh)})
const vertices=(m:SkinnedMesh)=>{m.skeleton.update();return Array.from({length:m.geometry.attributes.position.count},(_,i)=>m.getVertexPosition(i,new Vector3()).applyMatrix4(m.matrixWorld).toArray())}
const before=new Map(meshes.map(m=>[m.name,vertices(m)]))
const entrance=new DealerEntranceRig(root),face=new DealerFaceRig(root)
for(const m of meshes) if(['Hat','Hatband'].includes(dealerPart(m))) {
  const after=vertices(m),original=before.get(m.name)!
  assert.ok(original.every((v,i)=>new Vector3(...v).distanceTo(new Vector3(...after[i]))<1e-6),'Private hat binding must preserve rest geometry')
}
const head=root.getObjectByName('Head')!,hat=root.getObjectByName('DealerHatEntrance')!
const headHome=head.position.clone(),hatHome=hat.position.clone().add(new Vector3(0,DEALER_HAT_LIFT,0))
const headWorldHome=head.getWorldPosition(new Vector3())
const body=root.getObjectByName('Root')!,bodyHome=body.position.clone()
const lengths=['Left','Right'].flatMap(side=>['Arm','ForeArm'].map((suffix,i)=>{
 const a=root.getObjectByName(side+suffix)!,b=root.getObjectByName(side+['ForeArm','Hand'][i])!
 return {a,b,length:a.getWorldPosition(new Vector3()).distanceTo(b.getWorldPosition(new Vector3()))}
}))
const apply=(age:number)=>{
 entrance.reset()
 const state=dealerEntrance(age),idle=facePose(FACE_DEFAULTS,Math.max(0,age-DEALER_IDLE_START))
 face.apply(age<DEALER_ENTRANCE_END?blendEntranceFace(entranceFace(FACE_DEFAULTS,age),idle,state.idle):idle)
 entrance.apply(age)
 return state
}
for(const age of [0,1/12,2/12,3/12,4/12]) {
 assert.ok(Math.abs(dealerEntrance(age).headOffset.x)<.007,'Impact acting stays centred')
 const expression=entranceFace(FACE_DEFAULTS,age).expressions
 assert.ok(expression.blinkLeft>.98 && expression.blinkRight===0,'Impact wink is held for two complete 12 fps exposures')
 assert.equal(dealerEntrance(age).bodyReveal,0,'Wink happens while only the skull is visible')
 assert.equal(expression.socketWideLeft,0,'Winking socket cannot also be wide open')
 assert.ok(expression.browRaiseRight>.65 && expression.smile>.4,'Opposite brow and grin reinforce the wink')
}
assert.ok(dealerEntrance(dealerEntranceTime(1.3)).headOffset.y>.08,'Placement includes a readable lift before seating')
assert.equal(entranceFace(FACE_DEFAULTS,.6).expressions.blinkLeft,0,'Wink releases before the hand assembly')
for(let age=0;age<DEALER_ENTRANCE_END;age+=1/24) {
 const state=dealerEntrance(age),pose=entranceFace(FACE_DEFAULTS,age)
 assert.ok(pose.head.every(v=>Math.abs(v)<30),'Head acting stays restrained beneath the independent hat flourish')
 if(age>=dealerEntranceTime(1.95))assert.ok(state.hatOffset.y<1.71,'The hat flourish stays close enough to the dealer to remain readable')
}
assert.ok(dealerEntrance(dealerEntranceTime(2.02)).hatTurn-dealerEntrance(dealerEntranceTime(3.50)).hatTurn>6,'Hat completes its visible spin before descent')
assert.ok(Math.abs(dealerEntrance(dealerEntranceTime(3.62)).hatTurn)<1e-8,'Hat aligns before crown contact')
for(const start of [.8,1.3,1.8,2.3,2.8].map(dealerEntranceTime)) {
 const poses=Array.from({length:13},(_,i)=>entranceFace(FACE_DEFAULTS,start+i/24))
 const span=(values:number[])=>Math.max(...values)-Math.min(...values)
 assert.ok(span(poses.map(p=>p.head[2]))>1,'Head keeps acting through assembly')
 assert.ok(span(poses.map(p=>p.jaw[0]))>.025,'Jaw does not freeze between entrance beats')
 assert.ok(span(poses.map(p=>p.scale[1]))>.015,'Skull keeps subtle elastic movement')
}
apply(dealerEntranceTime(2.3))
for(const m of meshes) if(['Hat','Hatband'].includes(dealerPart(m))) {
  assert.ok(m.skeleton.bones[0]===hat,'Hat must be bound to its independent joint')
  const airborne=vertices(m)[0]
  apply(DEALER_HAT_LAND)
  const landed=vertices(m)[0]
  assert.ok(new Vector3(...airborne).distanceTo(new Vector3(...landed))>.25,'The actual skinned hat travels independently before landing')
  apply(dealerEntranceTime(2.3))
}
const previousElbows=new Map<string,Vector3>()
const previousFingers=new Map<string,Vector3>()
// Keep the same sampling density along the path at the quicker playback rate.
for(let age=-.1;age<DEALER_ENTRANCE_END+.3;age+=1/(48*DEALER_ENTRANCE_SPEED)) {
 const state=apply(age)
 for(const side of ['Left','Right']) {
  const position=root.getObjectByName(side+'ForeArm')!.getWorldPosition(new Vector3())
  const previous=previousElbows.get(side)
  if(previous) assert.ok(position.distanceTo(previous)<.045,`${side} elbow moves continuously at ${age.toFixed(3)}: ${position.distanceTo(previous)}`)
  previousElbows.set(side,position)
  const hand=root.getObjectByName(side+'Hand')!
  for(const digit of ['Thumb','Index','Middle','Ring','Pinky']) {
   const name=side+digit+'3',finger=hand.worldToLocal(root.getObjectByName(name)!.getWorldPosition(new Vector3()))
   const old=previousFingers.get(name)
   if(old) assert.ok(finger.distanceTo(old)<.025,`${name} must not snap during grip/release at ${age.toFixed(3)}`)
   previousFingers.set(name,finger)
  }
 }
 if(age>=dealerEntranceTime(2.42)) assert.ok(head.position.distanceTo(headHome)<1e-8,'Seated skull stays attached to its neck')
 if(age<IMPACT_DEPART) {assert.equal(state.bodyReveal,0);assert.equal(state.hatVisible,false)}
 if(age<0) assert.equal(state.visible,false)
 for(const {a,b,length} of lengths) assert.ok(Math.abs(a.getWorldPosition(new Vector3()).distanceTo(b.getWorldPosition(new Vector3()))-length)<1e-6,'Arm IK must not stretch limbs')
 for(const mesh of meshes) {
  mesh.skeleton.update()
  for(let i=0;i<mesh.geometry.attributes.position.count;i+=37) assert.ok(mesh.getVertexPosition(i,new Vector3()).toArray().every(Number.isFinite))
 }
 if(age>=0 && age<=DEALER_HEAD_SEATED) {
  const headPoint=root.worldToLocal(head.getWorldPosition(new Vector3()))
  assert.ok(Math.abs(headPoint.x-headWorldHome.x)<.007 && headPoint.distanceTo(headWorldHome)<.12,'Skull lifts for placement while staying centred')
  if(age<IMPACT_DEPART) for(const m of meshes) if(['Waistcoat','Collar','Neck'].includes(dealerPart(m))) {
    const top=Math.max(...vertices(m).map(v=>v[1]))
    assert.ok(top<1.01,`${m.name} begins below the tabletop; top=${top}`)
  }
 }
}
const poseAt=(age:number)=>{apply(age);return meshes.flatMap(m=>vertices(m).filter((_,i)=>i%53===0).flat())}
const first=poseAt(.73);poseAt(3.7);assert.ok(poseAt(.73).every((v,i)=>Math.abs(v-first[i])<1e-7),'Scrubbing/replay gives the same geometry within floating-point precision')
entrance.reset();face.neutralize()
assert.ok(head.position.distanceTo(headHome)<1e-9 && hat.position.distanceTo(hatHome)<1e-9 && hat.quaternion.w===1,'Reset restores head attachment and hat for live input')
assert.ok(body.position.distanceTo(bodyHome)<1e-9,'Live input reset restores body height')
assert.ok(!source.scene.getObjectByName('DealerHatEntrance'),'Cached model has no private entrance joint')

const actor=new Group();actor.add(root)
for(const aspect of [1500/900,390/844]) {
 const p=dealerPlacement(0,-2.5,.7,Math.min(1,aspect/(1500/900)))
 actor.position.fromArray(p.position);actor.scale.setScalar(p.scale);actor.updateMatrixWorld(true)
 const camera=new PerspectiveCamera(25,aspect,.1,200);camera.position.set(0,4.6,12.5);camera.lookAt(0,1.4,-.6);camera.updateMatrixWorld(true)
 let bounds=0
 for(let age=0;age<DEALER_ENTRANCE_END;age+=1/24) {
  const state=apply(age)
  for(const m of meshes) if(isDealerSkull(m) || (['Hat','Hatband'].includes(dealerPart(m))&&state.hatVisible)) {
   m.skeleton.update()
   for(let i=0;i<m.geometry.attributes.position.count;i+=19) {
    const world=m.getVertexPosition(i,new Vector3()).applyMatrix4(m.matrixWorld)
    if(age>DEALER_HAT_LAND+.1) assert.ok(world.z< -2.5,'Default skull/hat remain behind the table edge')
    const v=world.project(camera)
    const isHat=['Hat','Hatband'].includes(dealerPart(m))
    if(isHat && Math.abs(age-DEALER_HAT_VISIBLE)<1/24) assert.ok(v.y>1,'Hat becomes renderable entirely above the frame, never appearing beside the head')
    if(!isHat || age>=dealerEntranceTime(3.50)) bounds=Math.max(bounds,Math.abs(v.x),Math.abs(v.y))
   }
  }
 }
 console.log(`Entrance ${aspect.toFixed(3)}: skull/hat screen bound ${bounds.toFixed(3)}`)
 assert.ok(bounds<1,'Skull stays framed; arriving hat is fully framed before landing')
}
actor.remove(root);root.updateWorldMatrix(true,true)
const times=[0,.125,.25,.333,.5,.86,1.4,2.12,2.54,3.04,3.8]
const parts=meshes.map(m=>({name:m.name,part:dealerPart(m),material:(m.material as MeshStandardMaterial).name,
 indices:m.geometry.index?Array.from(m.geometry.index.array):Array.from({length:m.geometry.attributes.position.count},(_,i)=>i),
 uvs:Array.from({length:m.geometry.attributes.uv?.count??0},(_,i)=>[m.geometry.attributes.uv.getX(i),m.geometry.attributes.uv.getY(i)])}))
const frames=times.map(age=>{
 const state=apply(age)
 return {age,parts:meshes.map(m=>({name:m.name,visible:isDealerSkull(m)||(['Hat','Hatband'].includes(dealerPart(m))?state.hatVisible:state.bodyReveal>0),vertices:vertices(m)}))}
})
mkdirSync('blender-bridge/casino-dealer-v3',{recursive:true})
writeFileSync('blender-bridge/casino-dealer-v3/entrance-study.json',JSON.stringify({parts,frames}))
console.log('Entrance: isolated impact wink, private hat binding/travel, palm target, fixed limbs, finite geometry, replay/reset and table placement framing passed. Wrote eleven study poses.')
