import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {BufferGeometry,Float32BufferAttribute,Matrix4,Quaternion,Texture,Vector3,type SkinnedMesh} from 'three'
import {MeshBVH} from 'three-mesh-bvh'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {poseDealerAtTable} from '../components/resume/casino/dealer-pose'
import {DealerBodyRig} from '../components/resume/casino/dealer-idle'
const loader=new GLTFLoader();loader.register(()=>({name:'T',loadTexture:()=>Promise.resolve(new Texture())}))
const bytes=readFileSync('public/models/casino-dealer-v3.glb')
const {scene:root}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
poseDealerAtTable(root)
const body=new DealerBodyRig(root)
const digits=['Thumb','Index','Middle','Ring','Pinky'] as const
const p=(name:string)=>root.getObjectByName('Left'+name)!.getWorldPosition(new Vector3())
const palmAxis=['Index1','Middle1','Ring1','Pinky1'].map(p).reduce((sum,v)=>sum.add(v),new Vector3()).multiplyScalar(.25).sub(p('Hand')).normalize()
const restNormal=p('Index1').sub(p('Pinky1')).cross(palmAxis).normalize().negate()
const hinges=digits.slice(1).flatMap(digit=>[2,3].map(j=>{
 const bone=root.getObjectByName('Left'+digit+j)!,home=bone.quaternion.clone()
 const world=bone.getWorldQuaternion(new Quaternion())
 const axis=new Vector3(0,1,0).applyQuaternion(world).cross(restNormal).normalize().applyQuaternion(world.clone().invert())
 return {bone,home,axis,max:digit==='Index'?(j===2?.65:.26):(j===2?1.65:1.15)}
}))
const meshes:SkinnedMesh[]=[];root.traverse(o=>{const m=o as SkinnedMesh;if(m.isSkinnedMesh&&m.name.includes('HandLeft'))meshes.push(m)})
const collisions=new Set<string>()
const stress=process.argv.includes('--stress')
const cases=stress?[{amount:.05,acting:0},{amount:1,acting:1},{amount:1.5,acting:1.5}]:[{amount:1,acting:1}]
let samples=0,pairChecks=0,maxSnapSkinGap=0,minSnapSkinGap=Infinity,maxWristAngle=0
for(const config of cases) for(const mode of (process.argv.includes('--reveal')?['reveal']:stress?['idle','reveal']:['idle'])) for(let sample=0;sample<=(mode==='idle'?(stress?720:59):180);sample++) {
 const time=mode==='idle'?sample/(stress?24:2):.7+sample/120
 body.reset()
 if(mode==='idle')body.apply(time,config.amount,1,config.acting)
 else {const f=Math.min(1,time/1.4),w=f*f*(3-2*f);body.apply(time+.5,config.amount*w,1,config.acting,w,time)}
 samples++
 if(mode==='idle') {
  const wrist=p('Hand'),forearm=wrist.clone().sub(p('ForeArm')).normalize()
  const palm=['Index1','Middle1','Ring1','Pinky1'].map(p).reduce((sum,v)=>sum.add(v),new Vector3()).multiplyScalar(.25).sub(wrist).normalize()
  const angle=forearm.angleTo(palm);maxWristAngle=Math.max(maxWristAngle,angle)
  assert.ok(angle<35*Math.PI/180,`The held-card wrist stays close to the forearm at ${time}, amount ${config.amount}: ${angle*180/Math.PI}`)
 }
 for(const {bone,home,axis,max} of mode==='idle'?hinges:[]) {
  const delta=home.clone().invert().multiply(bone.quaternion).normalize()
  if(delta.w<0)delta.set(-delta.x,-delta.y,-delta.z,-delta.w)
  const v=new Vector3(delta.x,delta.y,delta.z)
  assert.ok(v.clone().cross(axis).length()<1e-5,`${bone.name} twists outside its hinge plane`)
  const angle=2*Math.atan2(v.dot(axis),delta.w)
  assert.ok(angle>=-1e-5&&angle<=max+1e-5,`${bone.name} exceeds its flexion limits`)
 }
 const buffers=new Map(digits.map(d=>[d,[] as number[]]))
 for(const mesh of meshes) {
  mesh.skeleton.update()
  const {position,skinIndex,skinWeight}=mesh.geometry.attributes
  const points=Array.from({length:position.count},(_,i)=>mesh.getVertexPosition(i,new Vector3()).applyMatrix4(mesh.matrixWorld))
  const labels=points.map((point,i)=>{
   let max=0,name='';for(let j=0;j<4;j++)if(skinWeight.getComponent(i,j)>max){max=skinWeight.getComponent(i,j);name=mesh.skeleton.bones[skinIndex.getComponent(i,j)].name}
   const digit=digits.find(d=>name.includes(d));if(!digit)return null
   // Exclude the shared palm webbing at the knuckle root.
   if(name.endsWith('1')&&root.getObjectByName(name)!.worldToLocal(point.clone()).y<.014)return null
   return digit
  })
  const index=mesh.geometry.index
  for(let i=0;i<(index?.count??points.length);i+=3) {
   const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),d=labels[ids[0]]
   if(d&&ids.every(k=>labels[k]===d))buffers.get(d)!.push(...ids.flatMap(k=>points[k].toArray()))
  }
 }
 const geometries=digits.map(d=>new BufferGeometry().setAttribute('position',new Float32BufferAttribute(buffers.get(d)!,3)))
 const bvhs=geometries.map(g=>new MeshBVH(g))
 for(let i=0;i<digits.length;i++)for(let j=i+1;j<digits.length;j++){pairChecks++;if(bvhs[i].intersectsGeometry(geometries[j],new Matrix4()))collisions.add(`${digits[i]}/${digits[j]} ${mode} amount=${config.amount} at ${time}`)}
 if(mode==='reveal'&&time>=.97&&time<=1.04) {
  const hit=bvhs[0].closestPointToGeometry(geometries[2],new Matrix4())
  assert.ok(hit,'Thumb and middle-finger surfaces exist')
  maxSnapSkinGap=Math.max(maxSnapSkinGap,hit.distance);minSnapSkinGap=Math.min(minSnapSkinGap,hit.distance)

 }
 geometries.forEach(g=>g.dispose())
}
console.log({samples,pairChecks,maxWristAngleDegrees:maxWristAngle*180/Math.PI,maxSnapSkinGapMM:maxSnapSkinGap*1000,minSnapSkinGapMM:minSnapSkinGap*1000,collisionCount:collisions.size,collisions:[...collisions].slice(0,30)})
assert.ok(maxSnapSkinGap<.004,'The loaded snap must visibly meet at the skin, not float apart')
assert.equal(collisions.size,0,'Separate finger surfaces must not cross during the grip or snap')
body.dispose()
console.log('Finger flexion limits, hinge planes and inter-finger surface clearance passed.')
