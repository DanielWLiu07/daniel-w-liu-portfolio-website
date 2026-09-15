import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {BufferGeometry,BoxGeometry,Float32BufferAttribute,Matrix4,Texture,Vector3,type SkinnedMesh} from 'three'
import {MeshBVH} from 'three-mesh-bvh'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {poseDealerAtTable,dealerPart} from '../components/resume/casino/dealer-pose'
import {DealerEntranceRig,dealerEntrance,entranceFace,blendEntranceFace,DEALER_IDLE_START,DEALER_ENTRANCE_END,DEALER_HAT_VISIBLE} from '../components/resume/casino/dealer-entrance'
import {DealerBodyRig} from '../components/resume/casino/dealer-idle'
import {applyDealerPointAction,applyDealerCardAction} from '../components/resume/casino/dealer-card-handoff'
import {DealerFaceRig,facePose} from '../components/resume/face/face-rig'
import {FACE_DEFAULTS} from '../components/resume/face/face-settings'
const loader=new GLTFLoader();loader.register(()=>({name:'T',loadTexture:()=>Promise.resolve(new Texture())}))
const bytes=readFileSync('public/models/casino-dealer-v3.glb'),{scene:root}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
poseDealerAtTable(root)
const fitStart=performance.now(),entrance=new DealerEntranceRig(root)
console.log(`Hat opening prepared in ${Math.round(performance.now()-fitStart)} ms`)
const body=new DealerBodyRig(root),face=new DealerFaceRig(root)
const meshes:SkinnedMesh[]=[];root.traverse(o=>{const m=o as SkinnedMesh;if(m.isSkinnedMesh&&(['Skull','Hat','Hatband'].includes(dealerPart(m))||/^Hand(Left|Right)/.test(m.name)))meshes.push(m)})
function surface(mesh:SkinnedMesh){mesh.skeleton.update();const g=new BufferGeometry().setAttribute('position',new Float32BufferAttribute(Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>root.worldToLocal(mesh.getVertexPosition(i,new Vector3()).applyMatrix4(mesh.matrixWorld)).toArray()).flat(),3));g.setIndex(Array.from(mesh.geometry.index!.array));const bvh=new MeshBVH(g);Object.assign(g,{boundsTree:bvh});g.computeBoundingBox();return {g,bvh,mesh}}
const samples=[...Array.from({length:94},(_,i)=>DEALER_HAT_VISIBLE+i/30),...Array.from({length:31},(_,i)=>4+i)].map(age=>({age,settings:FACE_DEFAULTS}))
for(const age of [7,11,19,27])for(const sign of [-1,1])for(const pitch of [-20,20])samples.push({age,settings:{...FACE_DEFAULTS,headYaw:35*sign,headPitch:pitch,headRoll:22*sign,squash:sign,skullWidth:-sign}})
let skullPairs=0,pairs=0
const failures:string[]=[]
for(const {age,settings} of samples){
 entrance.reset();body.reset()
 const bt=Math.max(0,age-DEALER_ENTRANCE_END),fade=Math.min(1,bt/1.4),w=fade*fade*(3-2*fade),seconds=Math.max(0,age-DEALER_IDLE_START)
 if(bt>0)body.apply(seconds,w,1,1,w,bt)
 face.apply(age<DEALER_ENTRANCE_END?blendEntranceFace(entranceFace(settings,age),facePose(settings,seconds),dealerEntrance(age).idle):facePose(settings,seconds))
 entrance.apply(age);applyDealerCardAction(body.shuffle,age,seconds);applyDealerPointAction(body.chip,age,seconds)
 const surfaces=meshes.map(surface),hats=surfaces.filter(s=>['Hat','Hatband'].includes(dealerPart(s.mesh))),skulls=surfaces.filter(s=>dealerPart(s.mesh)==='Skull'),hands=surfaces.filter(s=>s.mesh.name.startsWith('Hand'))
 for(const hat of hats){
  for(const hand of hands){pairs++;if(hat.g.boundingBox!.intersectsBox(hand.g.boundingBox!)&&hat.bvh.intersectsGeometry(hand.g,new Matrix4()))failures.push(`Hand / ${hat.mesh.name} at ${age}`)}
  for(const skull of skulls){
   skullPairs++
   if(hat.g.boundingBox!.intersectsBox(skull.g.boundingBox!)&&hat.bvh.intersectsGeometry(skull.g,new Matrix4()))failures.push(`Skull / ${hat.mesh.name} at ${age}`)
  }
  if(body.shuffle.group.visible){
   for(const card of body.shuffle.cards){
    const matrix=root.matrixWorld.clone().invert().multiply(card.matrixWorld)
    const paper=new BoxGeometry(.090,.00054,.130);paper.applyMatrix4(matrix);paper.computeBoundingBox();pairs++
    if(hat.g.boundingBox!.intersectsBox(paper.boundingBox!)&&hat.bvh.intersectsGeometry(paper,new Matrix4()))failures.push(`Card / ${hat.mesh.name} at ${age}`)
    paper.dispose()
   }
  }
 }
 surfaces.forEach(s=>s.g.dispose())
}
console.log({samples:samples.length,skullPairs,handAndCardPairs:pairs,failures:failures.slice(0,20),failureCount:failures.length})
assert.equal(failures.length,0,'Hat opening, hands and the snapped cards remain clear')
console.log('Hat/skull separation, hand clearance and snapped-card clearance passed through the entrance and 30-second idle loop, including extreme head turns and skull shapes.')
entrance.dispose();body.dispose()
