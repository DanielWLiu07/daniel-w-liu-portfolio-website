import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {Texture,Vector3,type SkinnedMesh} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {clone} from 'three/addons/utils/SkeletonUtils.js'
import {prepareDealerNeck} from '../components/resume/casino/dealer-neck'
import {DealerFaceRig,facePose} from '../components/resume/face/face-rig'
import {FACE_DEFAULTS} from '../components/resume/face/face-settings'
const loader=new GLTFLoader();loader.register(()=>({name:'T',loadTexture:()=>Promise.resolve(new Texture())}))
const bytes=readFileSync('public/models/casino-dealer-v3.glb')
const {scene:source}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
const root=clone(source),meshes:SkinnedMesh[]=[];root.updateWorldMatrix(true,true)
root.traverse(o=>{if((o as SkinnedMesh).isSkinnedMesh)meshes.push(o as SkinnedMesh)})
const sample=()=>meshes.flatMap(m=>{m.skeleton.update();return Array.from({length:Math.ceil(m.geometry.attributes.position.count/31)},(_,i)=>m.getVertexPosition(i*31,new Vector3()).applyMatrix4(m.matrixWorld))})
const before=sample(),sourceState=JSON.stringify(source.toJSON())
prepareDealerNeck(root)
const after=sample();assert.ok(after.every((p,i)=>p.distanceTo(before[i])<1e-6),'Moving the pivot preserves all existing rest geometry')
assert.equal(JSON.stringify(source.toJSON()),sourceState,'Private inverse-bind changes never modify the source model')
const head=root.getObjectByName('Head')!,neck=root.getObjectByName('neck')!,jaw=root.getObjectByName('JawHinge')!
const socket=head.position.clone(),base=neck.getWorldPosition(new Vector3()),length=socket.length(),jawHome=jaw.position.clone()
assert.ok(length>.05&&length<.09,'Cervical chain follows the actual visible neck length')
const face=new DealerFaceRig(root)
for(const lift of [-.035,0,.055])for(const pitch of [-25,0,25])for(const yaw of [-40,0,40]) {
 const pose=facePose({...FACE_DEFAULTS,idle:false,headPitch:pitch,headYaw:yaw,headRoll:18},0)
 face.apply({...pose,lift})
 const top=neck.localToWorld(socket.clone()),pivot=head.getWorldPosition(new Vector3())
 assert.ok(top.distanceTo(pivot)<1e-7,'Skull rotates exactly at the neck endpoint')
 assert.ok(neck.getWorldPosition(new Vector3()).distanceTo(base)<1e-7,'Neck base remains fixed to the torso')
 assert.ok(Math.abs(pivot.y-(base.y+length+lift))<1e-6,'Visible neck length accommodates the complete skull lift')
 assert.ok(jaw.position.distanceTo(jawHome)<1e-9,'Jaw keeps its separate hinge attachment')
}
face.neutralize();assert.ok(sample().every((p,i)=>p.distanceTo(before[i])<1e-6),'Neutral reset restores the original artwork exactly')
console.log('Neck-aligned pivot, elastic endpoint attachment, fixed base, independent jaw, private binding and exact rest geometry passed.')
