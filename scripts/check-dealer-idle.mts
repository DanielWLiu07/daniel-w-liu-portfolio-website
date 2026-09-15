import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {Group,PerspectiveCamera,Texture,Vector3,type SkinnedMesh} from 'three'
import {BODY_LOOP_SECONDS,DealerBodyRig,dealerBodyPose,dealerHandGesture,dealerArmPerformance} from '../components/resume/casino/dealer-idle'
import {DealerHandGrip} from '../components/resume/casino/dealer-grip'
import {DealerFaceRig,FACE_LOOP_SECONDS,facePose} from '../components/resume/face/face-rig'
import {FACE_DEFAULTS} from '../components/resume/face/face-settings'
import {dealerPart,dealerPlacement,poseDealerAtTable} from '../components/resume/casino/dealer-pose'

const loader=new GLTFLoader();loader.register(()=>({name:'T',loadTexture:()=>Promise.resolve(new Texture())}))
const bytes=readFileSync('public/models/casino-dealer-v3.glb')
const {scene:root}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
poseDealerAtTable(root)
const body=new DealerBodyRig(root),face=new DealerFaceRig(root)
const head=root.getObjectByName('Head')!,jaw=root.getObjectByName('JawHinge')!
const headPosition=head.position.clone(),jawPosition=jaw.position.clone()
assert.equal(BODY_LOOP_SECONDS,30);assert.equal(FACE_LOOP_SECONDS,30)
assert.deepEqual(dealerBodyPose(0),dealerBodyPose(30))
assert.deepEqual(facePose(FACE_DEFAULTS,0),facePose(FACE_DEFAULTS,30))
assert.notDeepEqual(dealerBodyPose(0),dealerBodyPose(12),'Body has a longer performance')
assert.notDeepEqual(facePose(FACE_DEFAULTS,1.5),facePose(FACE_DEFAULTS,13.5),'Head adds different acting after the first phrase')
face.apply(facePose({...FACE_DEFAULTS,idle:false,jawOpen:.7,headYaw:10},0))
const headRotation=head.quaternion.clone(),jawRotation=jaw.quaternion.clone()
body.apply(7)
assert.deepEqual(head.quaternion.toArray(),headRotation.toArray(),'Body preserves the head local animation')
assert.deepEqual(jaw.quaternion.toArray(),jawRotation.toArray(),'Body preserves the jaw local animation')
const bones=['Spine02','Spine01','Spine','LeftArm','LeftForeArm','RightArm','RightForeArm'].map(name=>{
 const node=root.getObjectByName(name)!;return {node,position:node.position.clone()}
})
body.reset();face.neutralize()
const home=root.getObjectByName('Spine')!.quaternion.clone()
body.apply(7,0);assert.ok(root.getObjectByName('Spine')!.quaternion.angleTo(home)<1e-7,'Body amount zero pauses only the body')
const rises:number[]=[],stretches:number[]=[]
for(let i=0;i<=60;i++) {
 body.reset();body.apply(i/24)
 rises.push(root.getObjectByName('Root')!.position.y)
 stretches.push(root.getObjectByName('Spine02')!.scale.y)
}
assert.ok(Math.max(...rises)-Math.min(...rises)>.025,'The torso has its own visible rise and dip')
assert.ok(Math.max(...stretches)-Math.min(...stretches)>.06,'The chest visibly deforms through its breathing cycle')
const bodyWaves:number[]=[],headWaves:number[]=[]
for(let i=0;i<300;i++) {
 const t=i/10;body.reset();body.apply(t)
 bodyWaves.push(root.getObjectByName('Root')!.position.y)
 headWaves.push(facePose(FACE_DEFAULTS,t).lift)
}
const center=(values:number[])=>{const mean=values.reduce((a,b)=>a+b,0)/values.length;return values.map(v=>v-mean)}
const bw=center(bodyWaves),hw=center(headWaves)
const correlation=bw.reduce((sum,v,i)=>sum+v*hw[i],0)/Math.sqrt(bw.reduce((sum,v)=>sum+v*v,0)*hw.reduce((sum,v)=>sum+v*v,0))
assert.ok(Math.abs(correlation)<.35,'Torso breathing and skull bounce have independent rhythms')
body.reset();face.neutralize()
const palms={Left:new DealerHandGrip(root,'Left'),Right:new DealerHandGrip(root,'Right')}
const rests={Left:palms.Left.point(),Right:palms.Right.point()}
for(const [side,sign] of [['Left',1],['Right',-1]] as const) {
 const thumb=root.getObjectByName(side+'Thumb1')!.getWorldPosition(new Vector3())
 const middle=root.getObjectByName(side+'Middle1')!.getWorldPosition(new Vector3())
 assert.ok((thumb.x-middle.x)*sign<0,`${side} thumb points inward in the palm-down pose`)
 assert.ok(palms[side].frame().normal.y<-.9,`${side} actual palm faces down`)
}
for(let start=0;start<30;start++) {
 const points:{Left:Vector3[];Right:Vector3[]}={Left:[],Right:[]}
 const bodyTravel:Vector3[]=[]
 for(let frame=0;frame<=12;frame++) {
  body.reset();body.apply(start+frame/12)
  bodyTravel.push(head.getWorldPosition(new Vector3()))
  const time=start+frame/12
  assert.ok(dealerHandGesture(time,'Left')*dealerHandGesture(time,'Right')<1e-8,'Hands take turns presenting instead of bobbing together')
  const scale=root.getObjectByName('Spine02')!.scale
  assert.ok(Math.abs(scale.x*scale.y*scale.z-1)<1e-6,'Chest squash and stretch preserves volume')
  for(const side of ['Left','Right'] as const) {
   points[side].push(palms[side].point())
   const forearm=root.getObjectByName(side+'Hand')!.getWorldPosition(new Vector3()).sub(root.getObjectByName(side+'ForeArm')!.getWorldPosition(new Vector3())).normalize()
   const fingers=palms[side].frame().forward
   assert.ok(forearm.angleTo(fingers)<75*Math.PI/180,`${side} wrist stays within its card-holding bend at ${time}`)
   assert.ok(side==='Left'?palms[side].frame().normal.z>.8:palms[side].frame().normal.y<-.8,`${side} palm keeps its poker/chip orientation`)
  }
 }
 assert.ok(Math.max(...bodyTravel.map(p=>p.distanceTo(bodyTravel[0])))>.008,`Body keeps a visible pulse throughout second ${start}`)
 assert.ok(Math.max(...points.Left.map(p=>p.distanceTo(points.Left[0])))>.003,`The raised hand follows body breathing throughout second ${start}`)
 assert.ok(Math.max(...points.Right.map(p=>p.distanceTo(points.Right[0])))>.003,'The chip hand follows the breathing torso independently of the face')
}
assert.ok(rests.Left.distanceTo(rests.Right)>.4,'Hands keep separate resting anchors')
const digits=['Left','Right'].flatMap(side=>['Thumb','Index','Middle','Ring','Pinky'].flatMap(digit=>[1,2,3].map(i=>root.getObjectByName(side+digit+i)!)))
body.reset();body.apply(0)
const digitStart=digits.map(b=>b.quaternion.clone()),motion=digits.map(()=>0)
for(let time=0;time<30;time+=.2) {
 body.reset();body.apply(time)
 digits.forEach((bone,i)=>motion[i]=Math.max(motion[i],bone.quaternion.angleTo(digitStart[i])))
}
assert.ok(motion.every(angle=>angle>.003),`All thirty finger joints participate in the long performance: ${digits.filter((_,i)=>motion[i]<=.003).map(b=>b.name).join(', ')}`)
body.reset();body.apply(30)
digits.forEach((bone,i)=>assert.deepEqual(bone.quaternion.toArray(),digitStart[i].toArray(),'Finger motion loops seamlessly'))
// Quiet-cycle impulses must propagate outwards, rather than all joints hitting together.
for(const side of ['Left','Right'] as const) {
 const samples=Array.from({length:376},(_,i)=>({t:i/100,pose:dealerArmPerformance(i/100,side,0)}))
 const upper=samples.reduce((a,b)=>a.pose.upper[0]<b.pose.upper[0]?a:b).t
 const elbow=samples.reduce((a,b)=>a.pose.elbow[0]<b.pose.elbow[0]?a:b).t
 const wrist=samples.reduce((a,b)=>a.pose.wrist[0]>b.pose.wrist[0]?a:b).t
 assert.ok(upper<elbow && elbow<wrist && wrist-upper<.4,`${side} arm leads the elbow and wrist through the beat`)
}
const actor=new Group();actor.add(root)
const meshes:SkinnedMesh[]=[];root.traverse(o=>{if((o as SkinnedMesh).isSkinnedMesh)meshes.push(o as SkinnedMesh)})
for(const aspect of [1500/900,390/844]) {
 const p=dealerPlacement(0,-2.5,.7,Math.min(1,aspect/(1500/900)))
 actor.position.fromArray(p.position);actor.scale.setScalar(p.scale);actor.updateMatrixWorld(true)
 const camera=new PerspectiveCamera(25,aspect,.1,200);camera.position.set(0,4.6,12.5);camera.lookAt(0,1.4,-.6);camera.updateMatrixWorld(true)
 let bounds=0,rail=Infinity,travel=0
 const initial=head.getWorldPosition(new Vector3())
 for(let i=0;i<=30*12;i++) {
  const t=i/12;body.reset();body.apply(t);face.apply(facePose(FACE_DEFAULTS,t))
  assert.ok(head.position.distanceTo(headPosition)<1e-10 && jaw.position.distanceTo(jawPosition)<1e-10,'Head/neck and jaw attachments do not drift')
  for(const {node,position} of bones) assert.ok(node.position.distanceTo(position)<1e-10,'Spine and arm lengths remain authored')
  travel=Math.max(travel,head.getWorldPosition(new Vector3()).distanceTo(initial))
  for(const mesh of meshes) {
   const part=dealerPart(mesh),hat=part==='Hat',hand=part==='HandLeft'||part==='HandRight'
   if(!hat&&!hand) continue
   mesh.skeleton.update()
   for(let v=0;v<mesh.geometry.attributes.position.count;v+=23) {
    const point=mesh.getVertexPosition(v,new Vector3()).applyMatrix4(mesh.matrixWorld)
    assert.ok(point.toArray().every(Number.isFinite))
    if(hand&&aspect>1) rail=Math.min(rail,Math.hypot(point.y+.7*.225,point.z+2.5))
    if(hat) {point.project(camera);bounds=Math.max(bounds,Math.abs(point.x),Math.abs(point.y))}
   }
  }
 }
 assert.ok(bounds<.99,`Combined head/body idle stays framed: ${bounds}`)
 assert.ok(rail>.345,`Idle hands clear the rail: ${rail}`)
 assert.ok(travel>.025*p.scale,'Attached head moves with the full performance')
 console.log(`30-second coordinated cycle ${aspect.toFixed(3)}: frame ${bounds.toFixed(3)}, rail clearance ${rail.toFixed(3)}`)
}
console.log('Body/head long loops, independent jaw, attachment, pause, fixed limbs and full-cycle framing passed.')
