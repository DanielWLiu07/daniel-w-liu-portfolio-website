import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {Group,Matrix4,Texture,Vector3,type SkinnedMesh} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {DealerBodyRig} from '../components/resume/casino/dealer-idle'
import {poseDealerAtTable} from '../components/resume/casino/dealer-pose'
import {DealerEntranceRig,DEALER_ENTRANCE_END,DEALER_IDLE_START,dealerEntrance,entranceFace,blendEntranceFace} from '../components/resume/casino/dealer-entrance'
import {DealerFaceRig,facePose} from '../components/resume/face/face-rig'
import {FACE_DEFAULTS} from '../components/resume/face/face-settings'
import {applyDealerCardAction,DEALER_CARD_CATCH} from '../components/resume/casino/dealer-card-handoff'
import {DEALER_CARD_REVEAL_START} from '../components/resume/casino/dealer-card-reveal'
const loader=new GLTFLoader();loader.register(()=>({name:'T',loadTexture:()=>Promise.resolve(new Texture())}))
const bytes=readFileSync('public/models/casino-dealer-v3.glb')
const {scene:root}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
poseDealerAtTable(root)
const body=new DealerBodyRig(root)
const entrance=new DealerEntranceRig(root),face=new DealerFaceRig(root)
const actor=new Group();actor.add(root)
const stress=process.argv.includes('--stress')
const handoff=process.argv.includes('--handoff')
const cases=stress?[.05,1,1.5].flatMap(amount=>[.5,1,2].flatMap(speed=>[0,1,1.5].map(acting=>({amount,speed,acting})))):[{amount:1,speed:1,acting:1}]
let frames=0,visibleFrames=0,gripChecks=0,maxGripGap=0
const failures:string[]=[]
const meshes:SkinnedMesh[]=[]
root.traverse(o=>{const m=o as SkinnedMesh;if(m.isSkinnedMesh&&m.name.includes('HandLeft'))meshes.push(m)})
assert.ok(meshes.length)
const meshData=meshes.map(mesh=>{
 const {position,skinIndex,skinWeight}=mesh.geometry.attributes
 const names=Array.from({length:position.count},(_,i)=>{let max=0,name='';for(let j=0;j<4;j++)if(skinWeight.getComponent(i,j)>max){max=skinWeight.getComponent(i,j);name=mesh.skeleton.bones[skinIndex.getComponent(i,j)].name}return name})
 const index=mesh.geometry.index
 const triangles=Array.from({length:(index?.count??position.count)/3},(_,i)=>{
  const ids=[0,1,2].map(j=>index?index.getX(i*3+j):i*3+j)
  const digit=['Thumb','Index','Middle','Ring','Pinky'].find(d=>ids.some(k=>names[k].includes(d)))??'Palm'
  return {ids,digit}
 })
 return {mesh,triangles}
})
// Clip every skin triangle to the card footprint. Testing only vertices misses
// a finger segment that crosses the paper between vertices or at its edge.
function clip(poly:Vector3[],axis:'x'|'z',limit:number,sign:number) {
 const out:Vector3[]=[]
 for(let i=0;i<poly.length;i++) {
  const a=poly[i],b=poly[(i+1)%poly.length],da=sign*(a[axis]-limit),db=sign*(b[axis]-limit)
  if(da>=0)out.push(a)
  if((da>=0)!==(db>=0))out.push(a.clone().lerp(b,da/(da-db)))
 }
 return out
}
const reports=new Map<string,{depth:number,time:number,min:number,max:number}>()
for(const [caseIndex,config] of cases.entries()) for(const mode of (handoff?['approach','catch']:['idle','reveal'])) for(let sample=0;sample<=(mode==='idle'?720:mode==='catch'?280:mode==='approach'?90:160);sample++) {
 // One complete 30-second animation phase at every supported speed endpoint.
 const approachProgress=.85+.15*sample/90
 const time=mode==='idle'?sample/24/config.speed:mode==='approach'?(DEALER_CARD_CATCH+.55)*approachProgress-.55:(mode==='catch'?DEALER_CARD_CATCH:DEALER_CARD_REVEAL_START-.1)+sample/120
 // Exercise the outer scene transform without changing the rig's local coordinates.
 if(stress) {
  actor.scale.setScalar(caseIndex%2?5:.25)
  actor.position.set(caseIndex%2?10:-10,caseIndex%2?5:-5,caseIndex%2?-10:10)
  actor.rotation.set((caseIndex%3-1)*Math.PI/2,(caseIndex%5-2)*Math.PI/2,(caseIndex%3-1)*Math.PI/2)
  actor.updateMatrixWorld(true)
 }
 if(handoff)entrance.reset()
 body.reset()
 if(mode==='catch'||mode==='approach') {
  const bodyTime=Math.max(0,time-DEALER_ENTRANCE_END),f=Math.min(1,bodyTime/1.4),w=f*f*(3-2*f),seconds=Math.max(0,time-DEALER_IDLE_START)
  if(bodyTime>0)body.apply(seconds,config.amount*w,config.speed,config.acting,w,bodyTime)
  face.apply(time<DEALER_ENTRANCE_END?blendEntranceFace(entranceFace(FACE_DEFAULTS,time),facePose(FACE_DEFAULTS,seconds),dealerEntrance(time).idle):facePose(FACE_DEFAULTS,seconds))
  entrance.apply(time);applyDealerCardAction(body.shuffle,time,seconds*config.speed)
 } else if(mode==='idle')body.apply(time,config.amount,config.speed,config.acting)
 else body.apply(time+.5,config.amount,config.speed,config.acting,1,time)
 frames++
 if(!body.shuffle.group.visible&&mode!=='approach')continue
 visibleFrames++
 const checkGrip=mode==='idle'||(mode==='reveal'&&time>=2)||(mode==='catch'&&time>=DEALER_CARD_CATCH+.2)
 const gripGaps={Index:Infinity,Thumb:Infinity}
 for(const {mesh,triangles} of meshData) {
  mesh.skeleton.update()
  const vertices=Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>mesh.getVertexPosition(i,new Vector3()))
  for(const [cardIndex,card] of body.shuffle.cards.entries()) {
   const cardMatrix=card.matrixWorld.clone()
   if(mode==='approach') {
    const u=Math.max(0,Math.min(1,(approachProgress-.70)/.30)),settle=u*u*u*(u*(u*6-15)+10)
    cardMatrix.multiply(new Matrix4().makeScale(1/card.scale.x,1,1)).multiply(new Matrix4().makeTranslation(.016*(1-card.scale.x),0,.130*1.2*(1-settle)))
   }
   const matrix=cardMatrix.invert().multiply(mesh.matrixWorld)
   const points=vertices.map(v=>v.clone().applyMatrix4(matrix))
   for(const {ids,digit} of triangles) {
    let poly=ids.map(k=>points[k])
    if(['x','z'].some(axis=>{const bound=axis==='x'?.045:.065;return poly.every(p=>p[axis as 'x'|'z']< -bound)||poly.every(p=>p[axis as 'x'|'z']>bound)}))continue
    const key=`${caseIndex} ${mode} card${cardIndex} ${digit}`
    // Clipping only narrows a triangle's height interval. Skip triangles whose
    // conservative interval cannot exceed the worst already measured clearance.
    const bound=Math.min(.00085-Math.min(...poly.map(p=>p.y)),Math.max(...poly.map(p=>p.y))+.00085)
    const contactDigit=(cardIndex===0&&digit==='Index')||(cardIndex===1&&digit==='Thumb')
    if(!(checkGrip&&contactDigit)&&reports.has(key)&&bound<=reports.get(key)!.depth)continue
    for(const [axis,limit,sign] of [['x',-.045,1],['x',.045,-1],['z',-.065,1],['z',.065,-1]] as const)poly=clip(poly,axis,limit,sign)
    if(!poly.length)continue
    const min=Math.min(...poly.map(p=>p.y)),max=Math.max(...poly.map(p=>p.y))
    if(checkGrip&&cardIndex===0&&digit==='Index'&&max<0)gripGaps.Index=Math.min(gripGaps.Index,-max-.00027)
    if(checkGrip&&cardIndex===1&&digit==='Thumb'&&min>0)gripGaps.Thumb=Math.min(gripGaps.Thumb,min-.00027)
    // Spare fingers can lie wholly on either side of the tilted paper.
    // A collision requires the clipped triangle to enter its thickness.
    const depth=Math.min(.00085-min,max+.00085)
    if(!reports.has(key)||depth>reports.get(key)!.depth)reports.set(key,{depth,time,min,max})
   }
  }
 }
 if(checkGrip){
  for(const [digit,gap] of Object.entries(gripGaps)){
   gripChecks++;maxGripGap=Math.max(maxGripGap,gap)
   assert.ok(gap>=0&&gap<.0025,`${digit} must oppose the other digit within 2.5 mm of its outer card face at ${mode} ${time}: ${gap*1000} mm`)
  }
 }
}
for(const card of [0,1])for(const digit of ['Thumb','Index'])assert.ok(reports.has(`0 ${handoff?'catch':'idle'} card${card} ${digit}`),'Both sheets and both gripping digits were inspected; relaxed fingers are checked wherever they overlap a sheet')
for(const [part,result] of reports) if(result.depth>=0)failures.push(`${part} intersects the paper at ${result.time}: ${(result.depth*1000).toFixed(3)} mm`)
if(stress)writeFileSync(`blender-bridge/casino-dealer-v3/${handoff?'card-catch':'card-stress'}-results.json`,JSON.stringify({cases,frames,visibleFrames,failures,reports:Object.fromEntries(reports)},null,2))
console.log({cases:cases.length,frames,visibleFrames,gripChecks,maxGripGapMM:maxGripGap*1000,failures:failures.slice(0,20)})
assert.equal(failures.length,0,'All tested skin triangles must remain clear of both cards')
console.log(`Both cards: triangle-clipped skin clearance passed ${handoff?'through the combined entrance catch and following 2.33 seconds':'over 30 seconds at 24 fps and the reveal at 120 fps'}. Minimum conservative clearance ${(-Math.max(...[...reports.values()].map(r=>r.depth))*1000).toFixed(3)} mm.`)

// Scrubbing backward, replaying and toggling movement must not retain a previous grip.
const signature=()=>{
 const values:number[]=[]
 root.traverse(o=>{if(/^Left(Hand|Thumb|Index|Middle|Ring|Pinky)/.test(o.name))values.push(...o.quaternion.toArray())})
 for(const card of body.shuffle.cards)values.push(...card.position.toArray(),...card.quaternion.toArray())
 return values
}
for(const time of [0,.5,1.1,1.5,3,7,15,29.99]) {
 body.reset();body.apply(time);const expected=signature()
 body.reset();body.apply(30-time,1.5,2,1.5)
 body.reset();body.apply(1,0);assert.equal(body.shuffle.group.visible,false)
 body.reset();body.apply(.8,.5,1,1,.5,.8)
 body.reset();body.apply(time);const actual=signature()
 assert.ok(actual.every((v,i)=>Math.abs(v-expected[i])<1e-8),'Replay restores exactly the same card and finger transforms')
}
console.log('Eight backward-scrub / movement-off / replay sequences passed.')
body.dispose()
