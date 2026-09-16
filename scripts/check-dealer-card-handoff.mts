import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {Matrix4,Quaternion,Texture,Vector3} from 'three'
import {poseDealerAtTable} from '../components/resume/casino/dealer-pose'
import {DealerBodyRig} from '../components/resume/casino/dealer-idle'
import {DealerEntranceRig,DEALER_ENTRANCE_END,DEALER_IDLE_START,DEALER_HEAD_SEATED,dealerEntrance,entranceFace,blendEntranceFace} from '../components/resume/casino/dealer-entrance'
import {applyDealerCardAction,DEALER_CARD_ACTION_START,DEALER_CARD_CATCH,FLIGHT_CARD_TO_GRIP,incomingCardMatrix} from '../components/resume/casino/dealer-card-handoff'
import {DealerFaceRig,facePose} from '../components/resume/face/face-rig'
import {FACE_DEFAULTS} from '../components/resume/face/face-settings'
const loader=new GLTFLoader();loader.register(()=>({name:'T',loadTexture:()=>Promise.resolve(new Texture())}))
const bytes=readFileSync('public/models/casino-dealer-v3.glb')
const {scene:root}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
poseDealerAtTable(root)
const entrance=new DealerEntranceRig(root),body=new DealerBodyRig(root),face=new DealerFaceRig(root)
const joints:typeof root.children=[];root.traverse(o=>{if(o.isObject3D&&/^Left(Arm|ForeArm|Hand|Thumb\d|Index\d|Middle\d|Ring\d|Pinky\d)$/.test(o.name))joints.push(o)})
const right=['Arm','ForeArm','Hand'].map(n=>root.getObjectByName('Right'+n)!)
let samples=0,maxStep=0,worst=""
function pose(age:number,speed=1,amount=1){
 entrance.reset();body.reset()
 const time=Math.max(0,age-DEALER_ENTRANCE_END),fade=Math.min(1,time/1.4),w=fade*fade*(3-2*fade)
 if(time>0)body.apply(Math.max(0,age-DEALER_IDLE_START),amount*w,speed,1,w,time)
 face.apply(age<DEALER_ENTRANCE_END?blendEntranceFace(entranceFace(FACE_DEFAULTS,age),facePose(FACE_DEFAULTS,Math.max(0,age-DEALER_IDLE_START)),dealerEntrance(age).idle):facePose(FACE_DEFAULTS,Math.max(0,age-DEALER_IDLE_START)))
 entrance.apply(age)
 const before=joints.map(j=>j.quaternion.clone()),other=right.map(j=>j.quaternion.clone())
 applyDealerCardAction(body.shuffle,age,Math.max(0,age-DEALER_IDLE_START)*speed,amount>0)
 assert.ok(right.every((j,i)=>j.quaternion.toArray().every((v,k)=>Math.abs(v-other[i].toArray()[k])<1e-8)),'Card overlay leaves the other arm alone')
 if(age<=DEALER_CARD_ACTION_START)assert.ok(joints.every((j,i)=>j.quaternion.toArray().every((v,k)=>Math.abs(v-before[i].toArray()[k])<1e-8)),`Skull-supporting hand is unchanged until release at ${age}`)
 return [...joints.flatMap(j=>j.quaternion.toArray()),...body.shuffle.cards.flatMap(c=>c.matrixWorld.elements)]
}
assert.ok(DEALER_CARD_ACTION_START>DEALER_HEAD_SEATED,'Catch preparation follows seating the skull')
assert.ok(DEALER_CARD_CATCH<DEALER_ENTRANCE_END,'Catch overlaps the end of the character entrance')
for(const speed of [.5,1,2]){
 let previous:Quaternion[]|null=null
 for(let i=0;i<=600;i++){
  const age=i/120;pose(age,speed);samples++
  if(previous)joints.forEach((j,k)=>{const step=j.quaternion.clone().normalize().angleTo(previous![k].clone().normalize());if(step>maxStep){maxStep=step;worst=`${j.name} at ${age}, speed ${speed}`}})
  previous=joints.map(j=>j.quaternion.clone())
  assert.ok(body.shuffle.cards.every(c=>c.matrixWorld.elements.every(Number.isFinite)))
 }
}
assert.ok(maxStep<.4,`No one-frame hand flip during combined skull release / snap: ${maxStep*180/Math.PI} ${worst}`)
for(const age of [-1,0,.46,1.5,2,2.7,3.2,3.48,4,5]){
 const expected=pose(age);pose(9,2);pose(.2,.5);pose(4,1,0);const actual=pose(age)
 assert.ok(actual.every((v,i)=>Math.abs(v-expected[i])<1e-8),`Backward scrub at ${age} is deterministic`)
}
pose(DEALER_CARD_CATCH)
for(const [index,card] of body.shuffle.cards.entries()){
 const target=card.matrixWorld.clone().multiply(FLIGHT_CARD_TO_GRIP)
 const sample=(p:number)=>incomingCardMatrix(target,p,index)
 const landing=new Vector3().setFromMatrixPosition(target)
 let previousY=Infinity
 const targetScale=new Vector3().setFromMatrixScale(target)
 assert.deepEqual(sample(1).elements,target.elements)
 const near=sample(1-1e-4)
 assert.ok(near.elements.every((v,i)=>Math.abs(v-target.elements[i])<1e-7),'Exact moving grip matrix is reached smoothly')
 for(let i=0;i<=1000;i++){
  const matrix=sample(i/1000)
  const position=new Vector3().setFromMatrixPosition(matrix)
  assert.ok(Math.abs(position.x-landing.x)<1e-8 && Math.abs(position.z-landing.z)<1e-8,'Drop stays at the hand depth without flying backwards')
  assert.ok(position.y<=previousY+1e-8 && position.y>=landing.y-1e-8,'Card only descends into the grip')
  previousY=position.y
  if(i<920)assert.ok(new Vector3().setFromMatrixScale(matrix).distanceTo(targetScale)<1e-6,'Card starts at its held size')
  assert.ok(matrix.elements.every(Number.isFinite)&&matrix.determinant()>0,'Paper never collapses or flips its handedness')
 }
}
console.log({samples,maxHandStepDegrees:maxStep*180/Math.PI,actionStart:DEALER_CARD_ACTION_START,catch:DEALER_CARD_CATCH,entranceEnd:DEALER_ENTRANCE_END})
console.log('Shared catch timing, skull support, other arm isolation, continuous gesture, exact card attachment and reverse-scrub checks passed.')
entrance.dispose();body.dispose()
