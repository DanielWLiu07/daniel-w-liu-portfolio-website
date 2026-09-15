import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {Texture,Vector3,type Bone} from 'three'
import {DealerBodyRig} from '../components/resume/casino/dealer-idle'
import {DEALER_CHIP_THICKNESS,DEALER_CHIP_PAD} from '../components/resume/casino/dealer-chip'
import {poseDealerAtTable} from '../components/resume/casino/dealer-pose'
import {DealerFaceRig,facePose} from '../components/resume/face/face-rig'
import {FACE_DEFAULTS} from '../components/resume/face/face-settings'
const loader=new GLTFLoader();loader.register(()=>({name:'T',loadTexture:()=>Promise.resolve(new Texture())}))
const bytes=readFileSync('public/models/casino-dealer-v3.glb')
const {scene:root}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
poseDealerAtTable(root)
const body=new DealerBodyRig(root),face=new DealerFaceRig(root)
const nodes:Bone[]=[];root.traverse(o=>{if((o as Bone).isBone&&/^Right/.test(o.name))nodes.push(o as Bone)})
let last=nodes.map(n=>n.quaternion.clone()),step=0,gap=0,worst='',minY=Infinity,maxY=-Infinity
for(let i=0;i<=720;i++) {
 const t=i/24;body.reset();body.apply(t)
 const center=body.chip.group.position.clone(),normal=new Vector3(0,1,0).applyQuaternion(body.chip.group.quaternion)
 const thumbTarget=center.clone().addScaledVector(normal,-DEALER_CHIP_THICKNESS/2-DEALER_CHIP_PAD)
 const indexTarget=center.clone().addScaledVector(normal,DEALER_CHIP_THICKNESS/2+DEALER_CHIP_PAD)
 gap=Math.max(gap,body.chip.tip('Thumb').distanceTo(thumbTarget))
 assert.ok(body.chip.tip('Index').distanceTo(indexTarget)<1e-7,'Chip stays attached to index pad')
 const before=nodes.map(n=>n.quaternion.clone()),cards=body.shuffle.cards.map(c=>c.getWorldPosition(new Vector3()))
 face.apply({...facePose(FACE_DEFAULTS,t),head:[12*Math.sin(t),35*Math.sin(t*.4),4*Math.sin(t*.6)]})
 assert.ok(body.chip.group.position.distanceTo(center)<1e-9,'Mouse-led skull leaves chip position independent')
 nodes.forEach((n,j)=>assert.deepEqual(n.quaternion.toArray(),before[j].toArray(),'Face motion cannot reposition the free arm'))
 body.shuffle.cards.forEach((c,j)=>assert.ok(c.getWorldPosition(new Vector3()).distanceTo(cards[j])<1e-8))
 const elbow=root.worldToLocal(root.getObjectByName('RightForeArm')!.getWorldPosition(new Vector3()))
 minY=Math.min(minY,elbow.y);maxY=Math.max(maxY,elbow.y)
 if(i)nodes.forEach((n,j)=>{const a=n.quaternion.angleTo(last[j]);if(a>step){step=a;worst=`${n.name} at ${t}`}})
 assert.ok(nodes.every(n=>n.quaternion.toArray().every(Number.isFinite)))
 last=nodes.map(n=>n.quaternion.clone())
}
console.log({thumbGapMM:gap*1000,maxStepDegrees:step*180/Math.PI,worst,elbow:[minY,maxY]})
assert.ok(gap<.002,'Thumb keeps contact with the opposite chip face')
assert.ok(step<.20,'Arm, wrist and finger motion has no sudden flips')
assert.ok(minY>1.0&&maxY<1.25,'Elbow hangs comfortably beside the torso')
body.reset();body.apply(0)
const initial=nodes.map(n=>n.quaternion.clone()),chip=body.chip.group.position.clone(),rotation=body.chip.group.quaternion.clone()
body.reset();body.apply(30)
nodes.forEach((n,i)=>assert.ok(n.quaternion.clone().normalize().angleTo(initial[i].clone().normalize())<1e-6,`Long cycle closes: ${n.name}`))
assert.ok(chip.distanceTo(body.chip.group.position)<1e-8&&rotation.angleTo(body.chip.group.quaternion)<1e-6)
assert.equal(body.shuffle.cards.length,2);assert.ok(body.chip.group.visible)
body.reset();assert.equal(body.chip.group.visible,false)
body.apply(0,0);assert.equal(body.chip.group.visible,false)
body.reset();body.apply(0,.01,1,1,.2);assert.equal(body.chip.group.visible,false)
assert.ok(readFileSync('public/models/casino-dealer-v3.glb').equals(bytes),'Authored detachable model remains untouched')
body.dispose()
console.log('Chip grip, continuous motion, face/card independence, loop, intro visibility and unchanged model passed.')
