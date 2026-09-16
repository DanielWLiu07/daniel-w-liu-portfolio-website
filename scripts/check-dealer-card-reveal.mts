import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {Texture,Vector3,type SkinnedMesh} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {DealerBodyRig} from '../components/resume/casino/dealer-idle'
import {DealerHandGrip} from '../components/resume/casino/dealer-grip'
import {poseDealerAtTable} from '../components/resume/casino/dealer-pose'
import {DEALER_CARD_SNAP,DEALER_CARD_REVEAL_START,DEALER_CARD_UNFOLD,dealerCardReveal} from '../components/resume/casino/dealer-card-reveal'
import {DEALER_CARD_PAD} from '../components/resume/casino/dealer-shuffle'
const loader=new GLTFLoader();loader.register(()=>({name:'T',loadTexture:()=>Promise.resolve(new Texture())}))
const bytes=readFileSync('public/models/casino-dealer-v3.glb')
const {scene:root}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
poseDealerAtTable(root)
const body=new DealerBodyRig(root),left=new DealerHandGrip(root,'Left')
let thumbGap=0,snapGap=0,bend=0,snapStep=0,indexGap=0,thumbAlignment=0,travelStep=0,worstTravel=0
const fingers=['Thumb','Index','Middle','Ring','Pinky'].flatMap(d=>[1,2,3].map(j=>root.getObjectByName('Left'+d+j)!))
let worstSnap=""
let previous=fingers.map(f=>f.quaternion.clone())
let cardPrevious:Vector3[]|null=null
for(let i=0;i<=30*24;i++) {
 body.reset();body.apply(i/24)
 assert.ok(left.tip('Middle').distanceTo(left.tip('Index'))>.016,'The curled middle finger stays away from the holding index')
 for(const digit of ['Index','Middle','Ring','Pinky']) {
  const joints=[1,2,3].map(j=>root.getObjectByName('Left'+digit+j)!.getWorldPosition(new Vector3()))
  joints.push(root.localToWorld(left.tip(digit)))
  const segments=joints.slice(1).map((p,j)=>p.clone().sub(joints[j]))
  // The index supports the paper; spare fingers tuck into the palm.
  const limit=digit==='Index'?85:105
  for(let j=0;j<2;j++) assert.ok(segments[j].angleTo(segments[j+1])<limit*Math.PI/180,`${digit} maintains a continuous curl without folding back`)
 }
 const card=body.shuffle.cards[0]
 for(const digit of ['Index']) {
  const pad=card.worldToLocal(root.localToWorld(left.tip(digit)))
  assert.ok(Math.abs(pad.x)<.045&&pad.z>-.060&&pad.z<.060&&pad.y<0,'The naturally posed supporting fingers stay behind the paper')
 }
 const contact=card.worldToLocal(root.localToWorld(left.tip('Thumb')))
 thumbGap=Math.max(thumbGap,Math.abs(contact.y-(DEALER_CARD_PAD+.001)))
 assert.ok(Math.abs(contact.x)<.034 && contact.z>-.072 && contact.z<-.060,'Thumb presses the lower corner shared by both cards')
 const joint=card.worldToLocal(root.getObjectByName('LeftThumb3')!.getWorldPosition(new Vector3()))
 thumbAlignment=Math.max(thumbAlignment,contact.clone().sub(joint).angleTo(new Vector3(-.89,0,.45)))
 const thumbJoint=root.getObjectByName('LeftThumb3')!.getWorldPosition(new Vector3())
 for(const card of body.shuffle.cards) {
  const start=card.worldToLocal(thumbJoint.clone()),end=card.worldToLocal(root.localToWorld(left.tip('Thumb')))
  if(start.y<0&&end.y>0) {
   const crossing=start.clone().lerp(end,-start.y/(end.y-start.y))
   assert.ok(crossing.z<-.065||Math.abs(crossing.x)>.045,'Thumb approaches around the card edge instead of piercing its face')
  }
 }
 for(const side of ['Left','Right']) {
  const bones=[1,2,3].map(j=>root.getObjectByName(side+'Thumb'+j)!)
  const p=bones.map(b=>b.getWorldPosition(new Vector3()))
  const tip=bones[2].localToWorld(new Vector3(0,bones[1].position.y,0))
  bend=Math.max(bend,p[1].clone().sub(p[0]).angleTo(p[2].clone().sub(p[1])),p[2].clone().sub(p[1]).angleTo(tip.sub(p[2])))
 }
}
// Check the rendered skin as well as bone endpoints: thick generated
// phalanges can pierce the paper while their IK targets appear correct.
const handMeshes:SkinnedMesh[]=[]
root.traverse(o=>{const m=o as SkinnedMesh;if(m.isSkinnedMesh&&m.name.includes('HandLeft'))handMeshes.push(m)})
assert.ok(handMeshes.length>0)
for(const time of [0,10,20]) {
 body.reset();body.apply(time)
 const card=body.shuffle.cards[0],closest={Index:Infinity}
 for(const mesh of handMeshes) {
  mesh.skeleton.update()
  const {position,skinIndex,skinWeight}=mesh.geometry.attributes
  for(let i=0;i<position.count;i++) {
   let strongest=0,name=''
   for(let j=0;j<4;j++) if(skinWeight.getComponent(i,j)>strongest) {
    strongest=skinWeight.getComponent(i,j);name=mesh.skeleton.bones[skinIndex.getComponent(i,j)].name
   }
   const digit=(['Index','Middle','Ring','Pinky'] as const).find(d=>name.includes(d))
   if(digit!=='Index') continue
   const point=card.worldToLocal(mesh.getVertexPosition(i,new Vector3()).applyMatrix4(mesh.matrixWorld))
   if(Math.abs(point.x)>.045||Math.abs(point.z)>.065) continue
   assert.ok(point.y<-.00085,'Supporting finger skin stays behind the printed card face')
   if((name.endsWith('2')||name.endsWith('3'))&&digit==='Index')closest[digit]=Math.min(closest[digit],Math.abs(point.y))
  }
 }
 indexGap=Math.max(indexGap,closest.Index)
 assert.ok(Object.values(closest).every(gap=>gap<.004),`Visible finger pads remain close enough to support the paper at ${time}: ${JSON.stringify(closest)}`)
}
for(let i=0;i<=240;i++) {
 const age=i/120,weight=1
 body.reset();body.apply(age+.5,weight,1,1,weight,age)
 if(i) fingers.forEach((f,j)=>{const step=f.quaternion.clone().normalize().angleTo(previous[j].clone().normalize());if(step>snapStep){snapStep=step;worstSnap=`${f.name} at ${age}`}})
 previous=fingers.map(f=>f.quaternion.clone())
 assert.equal(body.shuffle.group.visible,age>=DEALER_CARD_REVEAL_START,'Both cards appear on the snap')
 if(age>DEALER_CARD_SNAP-.24&&age<DEALER_CARD_SNAP-.22) snapGap=Math.max(snapGap,left.tip('Thumb').distanceTo(left.tip('Middle').addScaledVector(left.frame().normal,-.025)))
 if(body.shuffle.group.visible) {
  const points=body.shuffle.cards.map(c=>c.getWorldPosition(new Vector3()))
  if(cardPrevious) points.forEach((p,j)=>{const distance=p.distanceTo(cardPrevious![j]);if(distance>travelStep){travelStep=distance;worstTravel=age}})
  cardPrevious=points
  for(const card of body.shuffle.cards) {
   if(age>=DEALER_CARD_REVEAL_START+.24) {
    const contact=card.worldToLocal(root.localToWorld(left.tip('Thumb')))
    assert.ok(Math.abs(contact.x)<.034 && Math.abs(contact.y-(DEALER_CARD_PAD+.001))<.003 && Math.abs(contact.z+dealerCardReveal(age).slide)<.004,'Thumb holds the lower corner throughout the fan flourish')
   }
   assert.equal(card.scale.y,1,'Paper thickness stays constant during the unfold')
   assert.equal(card.scale.z,1,'Card height stays constant during the unfold')
   assert.ok(card.scale.x>=.25&&card.scale.x<=1,'The width unfolds within its intended range')
  }
 }
}
const releaseSamples=[DEALER_CARD_SNAP-.24,DEALER_CARD_SNAP+.04].map(age=>{
 const weight=1
 body.reset();body.apply(age+.5,weight,1,1,weight,age)
 return {index:root.getObjectByName('LeftIndex1')!.quaternion.clone(),middle:left.hand.worldToLocal(root.localToWorld(left.tip('Middle')))}
})
// The middle finger releases while the index prepares the permanent pinch.
assert.ok(releaseSamples[0].middle.distanceTo(releaseSamples[1].middle)>.015,'Middle fingertip has a readable release into the palm')
assert.equal(dealerCardReveal(DEALER_CARD_REVEAL_START-.001).visible,false)
assert.equal(dealerCardReveal(DEALER_CARD_REVEAL_START).turn,0,'Cards materialize directly in the held orientation')
assert.equal(dealerCardReveal(DEALER_CARD_REVEAL_START).slide,dealerCardReveal(Infinity).slide,'The magical appearance is at the pinch, without overhead travel')
assert.equal(dealerCardReveal(DEALER_CARD_SNAP).visible,false,'Cards wait for the finger release and grip transition')
assert.ok(dealerCardReveal(DEALER_CARD_REVEAL_START+.05).width<.75,'The cards do not jump to full width immediately')
assert.equal(dealerCardReveal(DEALER_CARD_REVEAL_START+.17).width,1,'The unfold finishes before the fan settles')
assert.ok(dealerCardReveal(DEALER_CARD_REVEAL_START+.24).fan>1,'Fan briefly overshoots before settling')
assert.equal(dealerCardReveal(3).fan,1)
console.log({cardThumbGapMM:thumbGap*1000,snapGapMM:snapGap*1000,thumbBendDegrees:bend*180/Math.PI,snapStepDegrees:snapStep*180/Math.PI,indexSupportMM:indexGap*1000,thumbAlignmentDegrees:thumbAlignment*180/Math.PI,cardStepMM:travelStep*1000,worstTravel,worstSnap})
assert.ok(travelStep<.012,'After the snap, the cards stay continuously attached to the grip')
assert.ok(thumbGap<.003,'Thumb stays against the front of the two-card overlap')
assert.ok(indexGap<.004,'The visible index pad braces the rear card opposite the thumb')
assert.ok(thumbAlignment<35*Math.PI/180,'Thumb pad crosses the lower card edge in a shallow diagonal, without folding backward')
assert.ok(snapGap<.012,'Thumb and middle finger meet before the snap')
assert.ok(snapStep<.40,'Fast finger release stays continuous without a one-frame joint flip')
assert.ok(bend<85*Math.PI/180,'Thumb bends across its joints without a hooked distal tip')
// Before loading, the empty hand must not assume its future thumb/index pinch.
body.reset();body.shuffle.apply(0,1,0,true)
const relaxedThumb=root.getObjectByName('LeftThumb1')!.quaternion.clone(),low=root.getObjectByName('LeftHand')!.getWorldPosition(new Vector3())
body.reset();body.shuffle.apply(0,1,Infinity,true)
assert.ok(relaxedThumb.normalize().angleTo(root.getObjectByName('LeftThumb1')!.quaternion.clone().normalize())>.25,'Empty-hand thumb differs from the card pinch')
assert.ok(root.getObjectByName('LeftHand')!.getWorldPosition(new Vector3()).distanceTo(low)>.08,'The forearm rises from a relaxed preparation')
const stroke=[DEALER_CARD_SNAP-.22,DEALER_CARD_SNAP].map(age=>{body.reset();body.shuffle.apply(0,1,age,true);return root.getObjectByName('LeftHand')!.getWorldPosition(new Vector3())})
assert.ok(stroke[0].distanceTo(stroke[1])>.065,'The snap includes a readable forearm stroke')
assert.equal(dealerCardReveal(DEALER_CARD_SNAP).release,1,'Finger release completes on the snap beat')
assert.equal(dealerCardReveal(DEALER_CARD_SNAP).grip,0,'Snap is visible before the fingers form the catch pinch')
assert.equal(dealerCardReveal(DEALER_CARD_REVEAL_START+DEALER_CARD_UNFOLD).grip,1,'Grip closes by the actual incoming-card catch')
body.reset();assert.equal(body.shuffle.group.visible,false,'Replay clears the card reveal')
body.dispose()
console.log('Opposed grips, thumb articulation, loaded snap, progressive card production, supported fan contact and replay passed.')
