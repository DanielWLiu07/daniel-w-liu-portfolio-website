import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {Texture,Vector3,type Bone,type SkinnedMesh} from 'three'
import {DealerBodyRig} from '../components/resume/casino/dealer-idle'
import {poseDealerAtTable} from '../components/resume/casino/dealer-pose'
import {DealerFaceRig,facePose} from '../components/resume/face/face-rig'
import {DealerEntranceRig,DEALER_ENTRANCE_END,DEALER_IDLE_START,dealerEntrance,entranceFace,blendEntranceFace} from '../components/resume/casino/dealer-entrance'
import {applyDealerCardAction,applyDealerPointAction,DEALER_CARD_ACTION_START} from '../components/resume/casino/dealer-card-handoff'
import {DEALER_CARD_SNAP} from '../components/resume/casino/dealer-card-reveal'
import {FACE_DEFAULTS} from '../components/resume/face/face-settings'
const loader=new GLTFLoader();loader.register(()=>({name:'T',loadTexture:()=>Promise.resolve(new Texture())}))
const bytes=readFileSync('public/models/casino-dealer-v3.glb'),{scene:root}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
poseDealerAtTable(root)
const entrance=new DealerEntranceRig(root),body=new DealerBodyRig(root),face=new DealerFaceRig(root)
const nodes:Bone[]=[];root.traverse(o=>{if((o as Bone).isBone&&/^Right/.test(o.name))nodes.push(o as Bone)})
const local=(name:string)=>root.worldToLocal(root.getObjectByName(name)!.getWorldPosition(new Vector3()))
const hands:SkinnedMesh[]=[];root.traverse(o=>{if((o as SkinnedMesh).isSkinnedMesh&&o.name.startsWith('HandRight'))hands.push(o as SkinnedMesh)})
let railClearance=Infinity,feltY=Infinity
let worst:unknown
let last=nodes.map(n=>n.quaternion.clone()),step=0,wristAngle=0,aimError=0,minElbow=Infinity,maxElbow=-Infinity
for(let i=0;i<=720;i++) {
 const t=i/24;body.reset();body.apply(t)
 const wrist=local('RightHand'),elbow=local('RightForeArm'),palm=local('RightMiddle1')
 const angle=wrist.clone().sub(elbow).angleTo(palm.clone().sub(wrist))
 if(angle>wristAngle){wristAngle=angle;worst={t,wrist:wrist.toArray(),elbow:elbow.toArray(),palm:palm.toArray()}}
 minElbow=Math.min(minElbow,elbow.y);maxElbow=Math.max(maxElbow,elbow.y)
 const base=local('RightIndex1'),tip=body.chip.tip('Index')
 aimError=Math.max(aimError,tip.sub(base).angleTo(body.chip.pointTarget.clone().sub(base)))
 if(i)nodes.forEach((n,j)=>{step=Math.max(step,n.quaternion.angleTo(last[j]))})
 last=nodes.map(n=>n.quaternion.clone())
 assert.ok(nodes.every(n=>n.quaternion.toArray().every(Number.isFinite)))
 assert.equal(body.chip.group.visible,false,'No blue chip while pointing to the red chip')
 if(i%12===0)for(const hand of hands){
  hand.skeleton.update()
  for(let v=0;v<hand.geometry.attributes.position.count;v++){
   const p=root.worldToLocal(hand.getVertexPosition(v,new Vector3()).applyMatrix4(hand.matrixWorld))
   railClearance=Math.min(railClearance,Math.hypot(p.y-(.9706+.32/4.5),p.z-.505)-.0875)
   if(p.z>.505)feltY=Math.min(feltY,p.y)
  }
 }
 const before=nodes.map(n=>n.quaternion.clone()),cards=body.shuffle.cards.map(c=>c.getWorldPosition(new Vector3()))
 face.apply(facePose(FACE_DEFAULTS,t))
 nodes.forEach((n,j)=>assert.deepEqual(n.quaternion.toArray(),before[j].toArray(),'Head movement leaves pointing arm independent'))
 body.shuffle.cards.forEach((c,j)=>assert.ok(c.getWorldPosition(new Vector3()).distanceTo(cards[j])<1e-8))
}
console.log({railClearanceMM:railClearance*1000,feltY,worst,wristDegrees:wristAngle*180/Math.PI,aimDegrees:aimError*180/Math.PI,maxStepDegrees:step*180/Math.PI,elbow:[minElbow,maxElbow]})
assert.ok(railClearance>.002,'Curled fingers clear the padded rail')
assert.ok(feltY>1.08,'Pointing hand stays above the felt')
assert.ok(aimError<.01,'Index aims along the ray to the red chip')
assert.ok(wristAngle<.60,'Wrist stays within a gentle 34-degree bend')
assert.ok(step<.20,'No one-frame arm or finger flips')
body.reset();body.apply(0);const first=nodes.map(n=>n.quaternion.clone())
body.reset();body.apply(30);nodes.forEach((n,i)=>assert.ok(n.quaternion.clone().normalize().angleTo(first[i].clone().normalize())<1e-6,'Loop closes'))
for(const target of [new Vector3(-.3,1.08,.9),new Vector3(.3,1.08,1.15)]) {
 body.chip.pointTarget.copy(target);body.reset();body.apply(3)
 const base=local('RightIndex1')
 assert.ok(body.chip.tip('Index').sub(base).angleTo(target.clone().sub(base))<.01,'Aim follows a moved chip')
}
body.chip.pointTarget.set(0,1.08,.90)
let introStep=0,introWorst="",previous:typeof first|null=null
for(let i=0;i<=456;i++){
 const age=DEALER_CARD_ACTION_START+.30+i/120,bt=Math.max(0,age-DEALER_ENTRANCE_END),fade=Math.min(1,bt/1.4),w=fade*fade*(3-2*fade),seconds=Math.max(0,age-DEALER_IDLE_START)
 entrance.reset();body.reset()
 if(bt>0)body.apply(seconds,w,1,1,w,bt)
 face.apply(age<DEALER_ENTRANCE_END?blendEntranceFace(entranceFace(FACE_DEFAULTS,age),facePose(FACE_DEFAULTS,seconds),dealerEntrance(age).idle):facePose(FACE_DEFAULTS,seconds))
 entrance.apply(age);applyDealerCardAction(body.shuffle,age,seconds)
 const held=body.shuffle.cards.map(c=>c.matrixWorld.clone())
 applyDealerPointAction(body.chip,age,seconds)
 body.shuffle.cards.forEach((c,j)=>assert.deepEqual(c.matrixWorld.elements,held[j].elements,'Point gesture leaves the held cards attached'))
 if(previous)nodes.forEach((n,j)=>{const step=n.quaternion.clone().normalize().angleTo(previous![j].clone().normalize());if(step>introStep){introStep=step;introWorst=`${n.name} at ${age}`}})
 previous=nodes.map(n=>n.quaternion.clone())
}
assert.ok(introStep<.15,`Intro eases into the point without a hand or finger flip: ${introStep*180/Math.PI} ${introWorst}`)
const snapAge=DEALER_CARD_ACTION_START+DEALER_CARD_SNAP
entrance.reset();body.reset();entrance.apply(snapAge);applyDealerPointAction(body.chip,snapAge,0)
const snapBase=local('RightIndex1')
assert.ok(body.chip.tip('Index').sub(snapBase).angleTo(body.chip.pointTarget.clone().sub(snapBase))<.01,'The red-chip point is already fully aimed on the snap beat')
const curled=['RightMiddle2','RightRing2','RightPinky2'].map(n=>root.getObjectByName(n)!.quaternion.clone())
body.reset();body.chip.pointAt(0)
curled.forEach((q,i)=>assert.ok(q.normalize().angleTo(root.getObjectByName(['RightMiddle2','RightRing2','RightPinky2'][i])!.quaternion.clone().normalize())<.05,'Spare fingers reach the curled pose on the snap, not during the later idle fade'))
console.log({introStepDegrees:introStep*180/Math.PI})
entrance.dispose();body.dispose()
console.log('Pointing aim, wrist posture, 30-second motion, face/card independence and moved targets passed.')
