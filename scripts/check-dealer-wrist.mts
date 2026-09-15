import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {BufferGeometry,Float32BufferAttribute,Matrix4,Texture,Vector3,type SkinnedMesh} from 'three'
import {MeshBVH} from 'three-mesh-bvh'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {poseDealerAtTable} from '../components/resume/casino/dealer-pose'
import {DealerBodyRig} from '../components/resume/casino/dealer-idle'
import {DealerEntranceRig,DEALER_ENTRANCE_END} from '../components/resume/casino/dealer-entrance'
const loader=new GLTFLoader();loader.register(()=>({name:'T',loadTexture:()=>Promise.resolve(new Texture())}))
const b=readFileSync('public/models/casino-dealer-v3.glb'),{scene:root}=await loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')
poseDealerAtTable(root)
const meshes:SkinnedMesh[]=[];root.traverse(o=>{const m=o as SkinnedMesh;if(m.isSkinnedMesh&&/^(HandLeft|ForearmLeft)/.test(m.name))meshes.push(m)})
assert.equal(meshes.length,2)
const body=new DealerBodyRig(root),entrance=new DealerEntranceRig(root),failures:string[]=[]
let samples=0,gap=Infinity
const inspect=(label:string)=>{
 const geometries=meshes.map(m=>{m.skeleton.update();const p=m.geometry.attributes.position;const points=Array.from({length:p.count},(_,i)=>root.worldToLocal(m.getVertexPosition(i,new Vector3()).applyMatrix4(m.matrixWorld)));const g=new BufferGeometry().setAttribute('position',new Float32BufferAttribute(points.flatMap(v=>v.toArray()),3));g.setIndex(Array.from(m.geometry.index!.array));return g})
 Object.assign(geometries[1],{boundsTree:new MeshBVH(geometries[1])})
 const bvh=new MeshBVH(geometries[0]);if(bvh.intersectsGeometry(geometries[1],new Matrix4()))failures.push(label)
 if(samples%30===0)gap=Math.min(gap,bvh.closestPointToGeometry(geometries[1],new Matrix4())!.distance)
 geometries.forEach(g=>g.dispose());samples++
}
const stress=process.argv.includes('--stress')
for(const amount of stress?[.05,1,1.5]:[1]){
 for(let i=0;i<=(stress?360:60);i++){const time=i/(stress?12:2);entrance.reset();body.reset();body.apply(time,amount,1,amount);inspect(`idle ${time} amount ${amount}`)}
 for(let i=0;i<=132;i++){const age=i/60,f=Math.min(1,age/1.4),w=f*f*(3-2*f);entrance.reset();body.reset();body.apply(age+.5,amount*w,1,amount,w,age);inspect(`snap ${age} amount ${amount}`)}
}
for(let i=0;i<=Math.ceil(DEALER_ENTRANCE_END*24);i++){const age=i/24;entrance.reset();body.reset();body.apply(age,0);entrance.apply(age);inspect(`intro ${age}`)}
console.log({samples,sampledMinimumWristGapMM:gap*1000,collisions:failures.length,firstCollisions:failures.slice(0,15)})
assert.equal(failures.length,0,'Forearm shafts must not enter the palm through the wrist')
body.dispose();entrance.dispose()
