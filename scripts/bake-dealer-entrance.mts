/** Bake the character entrance; the opening-card handoff itself runs in scene space. */
import {readFileSync,writeFileSync} from 'node:fs'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js'
import {Mesh,MeshStandardMaterial,Texture,VectorKeyframeTrack} from 'three'
import {poseDealerAtTable} from '../components/resume/casino/dealer-pose'
import {DEALER_DEFAULTS} from '../components/resume/casino/dealer-layout'
import {DEALER_CARD_REVEAL_START} from '../components/resume/casino/dealer-card-reveal'
import {applyDealerPointAction,applyDealerCardAction,DEALER_CARD_ACTION_START} from '../components/resume/casino/dealer-card-handoff'
import {DealerBodyRig} from '../components/resume/casino/dealer-idle'
import {DEALER_ENTRANCE_END, DEALER_HAT_VISIBLE, DEALER_IDLE_START, dealerEntranceTime, DealerEntranceRig,dealerEntrance,entranceFace,blendEntranceFace} from '../components/resume/casino/dealer-entrance'
import {DealerFaceRig,facePose} from '../components/resume/face/face-rig'
import {FACE_DEFAULTS} from '../components/resume/face/face-settings'
import {DealerRetargeter} from '../components/resume/motion/retarget'
import {takeClip} from '../components/resume/motion/takes'
import type {MotionTake} from '../components/resume/motion/types'
const loader=new GLTFLoader();loader.register(()=>({name:'TEXTURES',loadTexture:()=>Promise.resolve(new Texture())}))
const bytes=readFileSync('public/models/casino-dealer-v3.glb')
const {scene:model}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
poseDealerAtTable(model)
const entrance=new DealerEntranceRig(model),body=new DealerBodyRig(model),face=new DealerFaceRig(model),sampler=new DealerRetargeter(model)
const stressStudy=process.argv.includes('--stress')
const idleStudy=process.argv.includes('--idle')||stressStudy,duration=idleStudy?30:process.argv.includes('--hat')?34:7
const studyAmount=stressStudy?1.5:1,studySpeed=stressStudy?2:FACE_DEFAULTS.speed,studyActing=stressStudy?1.5:FACE_DEFAULTS.amount*FACE_DEFAULTS.acting
const take:MotionTake={version:1,model:'casino-dealer-v3',name:idleStudy?'Coordinated dealer performance':'Skull assembly entrance',duration,frames:[]}
const positions:Record<string,number[]>={Root:[],Head:[],DealerHatEntrance:[],DealerDeckFrame:[]}
positions[body.chip.group.name]=[]
for(const card of body.shuffle.cards) positions[card.name]=[]
for(let i=0;i<=duration*24;i++) {
 const age=i/24;entrance.reset();body.reset()
 const fade=Math.max(0,Math.min(1,(age-DEALER_ENTRANCE_END)/1.4))
 body.apply(idleStudy?age:Math.max(0,age-DEALER_IDLE_START),idleStudy?studyAmount:fade*fade*(3-2*fade),studySpeed,studyActing,idleStudy?1:fade*fade*(3-2*fade),idleStudy?Infinity:age-DEALER_ENTRANCE_END)
 const animatedFace=idleStudy?facePose(FACE_DEFAULTS,age):blendEntranceFace(entranceFace(FACE_DEFAULTS,age),facePose(FACE_DEFAULTS,Math.max(0,age-DEALER_IDLE_START)),dealerEntrance(age).idle)
 face.apply(animatedFace)
 if(!idleStudy) {entrance.apply(age);applyDealerCardAction(body.shuffle,age,Math.max(0,age-DEALER_IDLE_START)*studySpeed);applyDealerPointAction(body.chip,age,Math.max(0,age-DEALER_IDLE_START)*studySpeed)}
 take.frames.push(sampler.sample(age))
 for(const name of Object.keys(positions)) positions[name].push(...model.getObjectByName(name)!.position.toArray())
}
entrance.reset();body.reset();face.neutralize();body.shuffle.group.visible=true;body.chip.group.visible=false
const clip=takeClip(take,model)
for(const [name,values] of Object.entries(positions)) clip.tracks.push(new VectorKeyframeTrack(`${name}.position`,take.frames.map(f=>f.time),values))
model.traverse(o=>{
 if(!(o instanceof Mesh))return
 const material=(m:MeshStandardMaterial)=>{const copy=m.clone();copy.map=null;copy.name=`proof::${m.name}`;return copy}
 o.material=Array.isArray(o.material)?o.material.map(m=>material(m as MeshStandardMaterial)):material(o.material as MeshStandardMaterial)
})
class Reader {
 result:ArrayBuffer|string|null=null
 onloadend:(()=>void)|null=null
 async readAsArrayBuffer(blob:Blob){this.result=await blob.arrayBuffer();this.onloadend?.()}
 async readAsDataURL(blob:Blob){this.result=`data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;this.onloadend?.()}
}
Object.assign(globalThis,{FileReader:Reader})
const out=await new GLTFExporter().parseAsync(model,{binary:true,animations:[clip]})
if(!(out instanceof ArrayBuffer))throw new Error('Expected animated GLB')
writeFileSync(`blender-bridge/casino-dealer-v3/dealer-${stressStudy?'stress':idleStudy?'idle':'entrance'}.glb`,Buffer.from(out))
writeFileSync('blender-bridge/casino-dealer-v3/entrance-layout.json',JSON.stringify(DEALER_DEFAULTS))
writeFileSync('blender-bridge/casino-dealer-v3/entrance-timing.json',JSON.stringify({hat:DEALER_HAT_VISIBLE,cards:DEALER_CARD_ACTION_START+DEALER_CARD_REVEAL_START,cardActionStart:DEALER_CARD_ACTION_START,chip:DEALER_ENTRANCE_END+1.08,body:dealerEntranceTime(.8),end:DEALER_ENTRANCE_END}))
console.log(`Baked ${duration} seconds of ${idleStudy?'coordinated body/head/jaw idle':'entrance'} animation.`)
