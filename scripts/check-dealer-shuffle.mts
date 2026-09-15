import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {Texture,Vector3,type Bone} from 'three'
import {DealerBodyRig} from '../components/resume/casino/dealer-idle'
import {dealerCardReveal} from '../components/resume/casino/dealer-card-reveal'
import {dealerShufflePose,DEALER_CARD_COUNT,DEALER_CARD_PAD} from '../components/resume/casino/dealer-shuffle'
import {DealerHandGrip} from '../components/resume/casino/dealer-grip'
import {poseDealerAtTable} from '../components/resume/casino/dealer-pose'
import {DealerFaceRig,facePose} from '../components/resume/face/face-rig'
import {FACE_DEFAULTS} from '../components/resume/face/face-settings'
import {MouseLook} from '../components/resume/face/mouse-look'
import {DealerEntranceRig,DEALER_ENTRANCE_END,DEALER_IDLE_START,dealerEntrance,entranceFace,blendEntranceFace} from '../components/resume/casino/dealer-entrance'

const loader=new GLTFLoader();loader.register(()=>({name:'T',loadTexture:()=>Promise.resolve(new Texture())}))
const bytes=readFileSync('public/models/casino-dealer-v3.glb')
const {scene:root}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
poseDealerAtTable(root)
const entrance=new DealerEntranceRig(root),body=new DealerBodyRig(root),face=new DealerFaceRig(root),look=new MouseLook()
const grips={Left:new DealerHandGrip(root,'Left'),Right:new DealerHandGrip(root,'Right')}
const frame=body.shuffle.group
assert.equal(body.shuffle.cards.length,DEALER_CARD_COUNT)
assert.equal(frame.visible,false,'Cards begin hidden through the skull introduction')
assert.deepEqual(dealerShufflePose(0),dealerShufflePose(10),'Card offering cycle closes exactly')
assert.ok(dealerShufflePose(4).leftPalm.distanceTo(dealerShufflePose(0).leftPalm)<.02,'The two-card hand remains raised near the face')
const handBones:Bone[]=[]
root.traverse(o=>{if((o as Bone).isBone&&/^(Left|Right)(Arm|ForeArm|Hand|Thumb|Index|Middle|Ring|Pinky)/.test(o.name))handBones.push(o as Bone)})
let prior=handBones.map(b=>b.quaternion.clone()),maxStep=0,maxContactError=0,worstContact='',worstStep=''
for(let i=0;i<=600;i++) {
 const t=i/60,pose=dealerShufflePose(t)
 body.reset();body.apply(t)
 for(const side of ['Left'] as const) {
  const expected=pose.leftPalm
  const actual=frame.worldToLocal(root.localToWorld(grips[side].point()))
  if(actual.distanceTo(expected)>maxContactError) {maxContactError=actual.distanceTo(expected);worstContact=`${side} at ${t}: actual ${actual.toArray()}, expected ${expected.toArray()}`}
 }
 if(i) handBones.forEach((b,j)=>{const step=b.quaternion.angleTo(prior[j]);if(step>maxStep){maxStep=step;worstStep=`${b.name} at ${t}`}})
 prior=handBones.map(b=>b.quaternion.clone())
 assert.equal(body.shuffle.cards.length,2,'The poker hand contains exactly two cards')
 for(const card of body.shuffle.cards) assert.ok(card.position.toArray().every(Number.isFinite),'Held cards keep finite transforms')
 const pinch=root.localToWorld(grips.Left.tip('Thumb'))
 for(const card of body.shuffle.cards) {
  const local=card.worldToLocal(pinch.clone())
  assert.ok(Math.abs(local.x)<.034 && Math.abs(local.y-DEALER_CARD_PAD-.001)<.003 && Math.abs(local.z+dealerCardReveal().slide)<.004,'Both cards remain pressed beneath the thumb pad throughout the gesture')
 }
 for(const b of handBones) assert.ok(b.quaternion.toArray().every(Number.isFinite),'No invalid arm/finger rotations')
 if(i%30===0) {
  const hands=handBones.map(b=>b.getWorldPosition(new Vector3()))
  const cards=body.shuffle.cards.map(b=>b.getWorldPosition(new Vector3()))
  face.apply(look.apply(facePose(FACE_DEFAULTS,t),FACE_DEFAULTS,[-12,25],1/60))
  handBones.forEach((b,j)=>assert.ok(b.getWorldPosition(new Vector3()).distanceTo(hands[j])<1e-8,'Mouse-follow does not displace the hands'))
  body.shuffle.cards.forEach((b,j)=>assert.ok(b.getWorldPosition(new Vector3()).distanceTo(cards[j])<1e-8,'Mouse-follow does not displace the deck'))
 }
}
assert.ok(maxContactError<.004,`Raised hand follows its holding target: ${maxContactError}, ${worstContact}, joint step ${maxStep}, ${worstStep}`)
assert.ok(maxStep<.35,`No sudden finger or wrist flips between frames: ${maxStep}, ${worstStep}`)
body.reset();assert.equal(frame.visible,false,'Reset hands control back to intro or webcam without cards')
body.apply(2,0);assert.equal(frame.visible,false,'Paused body does not leave floating props')
body.reset();body.apply(1,.35);assert.equal(frame.visible,true,'Lower body amplitude still holds and shows the complete deck')
body.reset();body.apply(1,1,1,1,.4);assert.equal(frame.visible,false,'Cards stay hidden while hands transition into their grip')
const animatedHead=root.getObjectByName('Head')!
const headings=[]
// Exercise the same reset/body/face/entrance ordering as the live component,
// including damped rotations and the transition out of skull assembly.
for(let i=0;i<=8*60;i++) {
 const age=i/60,idleTime=Math.max(0,age-DEALER_IDLE_START)
 entrance.reset();body.reset()
 const fade=Math.max(0,Math.min(1,(age-DEALER_ENTRANCE_END)/1.4))
 if(fade>0)body.apply(idleTime,fade*fade*(3-2*fade),1,1,fade*fade*(3-2*fade),age-DEALER_ENTRANCE_END)
 const idle=look.apply(facePose(FACE_DEFAULTS,idleTime),FACE_DEFAULTS,[0,age<6?35:-35],1/60)
 face.apply(age<DEALER_ENTRANCE_END?blendEntranceFace(entranceFace(FACE_DEFAULTS,age),idle,dealerEntrance(age).idle):idle,1/60)
 entrance.apply(age)
 assert.ok(Math.abs(animatedHead.quaternion.length()-1)<1e-6,'Head rotation stays normalized across introduction and mouse-follow')
 if(i===5*60||i===8*60) headings.push(animatedHead.quaternion.clone())
}
assert.ok(headings[0].angleTo(headings[1])>50*Math.PI/180,'The actual skull visibly turns between left and right cursor targets after the introduction')
entrance.dispose()
body.dispose()
console.log(`Poker grip contact ${(maxContactError*1000).toFixed(2)} mm; maximum joint step ${(maxStep*180/Math.PI).toFixed(2)} degrees. Poker idle loop, finger contact, mouse independence and visibility passed.`)
