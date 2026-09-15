import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {Texture,Vector3,Line3,BufferGeometry,Float32BufferAttribute,Matrix4,type SkinnedMesh} from 'three'
import {MeshBVH} from 'three-mesh-bvh'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {poseDealerAtTable} from '../components/resume/casino/dealer-pose'
import {prepareDealerWrist} from '../components/resume/casino/dealer-wrist'
import {prepareDealerHandSkin} from '../components/resume/casino/dealer-hand-skin'
import {DealerBodyRig} from '../components/resume/casino/dealer-idle'
const loader=new GLTFLoader();loader.register(()=>({name:'T',loadTexture:()=>Promise.resolve(new Texture())}))
const b=readFileSync('public/models/casino-dealer-v3.glb'),{scene:r}=await loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')
const meshes:SkinnedMesh[]=[];r.traverse(o=>{const m=o as SkinnedMesh;if(m.isSkinnedMesh&&m.name.includes('HandLeft'))meshes.push(m)})
const original=meshes.map(m=>({geometry:m.geometry,weights:Array.from(m.geometry.attributes.skinWeight.array)}))
prepareDealerWrist(r);prepareDealerHandSkin(r)
for(const [i,m] of meshes.entries()) {
 assert.notEqual(m.geometry,original[i].geometry,'Hand repair owns private geometry')
 assert.deepEqual(Array.from(original[i].geometry.attributes.skinWeight.array),original[i].weights,'The shared source geometry stays unchanged')
 const w=m.geometry.attributes.skinWeight
 for(let v=0;v<w.count;v++)assert.ok(Math.abs([0,1,2,3].reduce((sum,j)=>sum+w.getComponent(v,j),0)-1)<1e-6,'Hand weights remain normalized')
}
const data=meshes.map(m=>{
 m.skeleton.update(); const pts=Array.from({length:m.geometry.attributes.position.count},(_,i)=>m.getVertexPosition(i,new Vector3()))
 const index=m.geometry.index,tri=Array.from({length:(index?.count??pts.length)/3},(_,i)=>[0,1,2].map(j=>index?index.getX(i*3+j):i*3+j))
 const {skinIndex,skinWeight}=m.geometry.attributes
 const source=original[meshes.indexOf(m)].geometry.attributes
 const palm=pts.map((v,i)=>{
  const old=i<source.position.count,weights=old?source.skinWeight:skinWeight,indices=old?source.skinIndex:skinIndex
  let w=0,bone=0;for(let j=0;j<4;j++)if(weights.getComponent(i,j)>w){w=weights.getComponent(i,j);bone=indices.getComponent(i,j)}
  const name=m.skeleton.bones[bone].name
  const local=v.clone().applyMatrix4(m.bindMatrix).applyMatrix4(m.skeleton.boneInverses[bone])
  return (!old&&i<m.geometry.userData.dealerPalmRigidVertexEnd)||name==='LeftHand'||(name.endsWith('1')&&local.y<.014)
 })
 const keys=pts.map(v=>v.toArray().map(n=>Math.round(n*1e6)).join(','))
 return {m,pts,tri,palm,keys}
})
// The bind pose contains overlapping closed bone joins. Preserve those identities,
// but reject newly crossing palm surfaces in the posed hand. Ignore sub-0.5 mm
// point contacts; any new seam segment reaching 1 mm is a failure.
const baselines=new Map<SkinnedMesh,Set<string>>()
let samples=0,worstStretch=0,baselineCount=0,addedCollisions=0,maxNewContactSpan=0
function inspect(label:string) {
 for(const {m,pts,tri,palm,keys} of data){
 m.skeleton.update();const posed=pts.map((_,i)=>m.getVertexPosition(i,new Vector3()))
 const g=new BufferGeometry().setAttribute('position',new Float32BufferAttribute(posed.flatMap(v=>v.toArray()),3));g.setIndex(tri.flat())
 const bvh=new MeshBVH(g),originalTriangles=new Map(tri.map((ids,i)=>[ids.join(','),i]))
 // BVH construction reorders triangles; compare stable source identities.
 const ordered=g.index!,sourceTriangles=tri.map((_,i)=>originalTriangles.get([0,1,2].map(j=>ordered.getX(i*3+j)).join(','))!)
 const hits=new Set<string>(),spans=new Map<string,number>();let maxStretch=0,worst=''
 for(const ids of tri){if(!ids.some(i=>palm[i]))continue;for(let j=0;j<3;j++){const a=ids[j],b=ids[(j+1)%3],d=pts[a].distanceTo(pts[b]);if(d<.001)continue;const ratio=posed[a].distanceTo(posed[b])/d;if(ratio>maxStretch){maxStretch=ratio;worst=`${a}/${b}`}}}
 bvh.bvhcast(bvh,new Matrix4(),{intersectsTriangles:(a,b,i,j)=>{
 i=sourceTriangles[i];j=sourceTriangles[j]
 if(i>=j)return false;const aIds=tri[i],bIds=tri[j]
 if(!aIds.some(i=>palm[i])&&!bIds.some(i=>palm[i]))return false
 if(aIds.some(k=>bIds.some(l=>keys[k]===keys[l])))return false
 const line=new Line3();if(a.intersectsTriangle(b,line)&&line.distance()>.0005){hits.add(`${i}/${j}`);spans.set(`${i}/${j}`,line.distance())}
 return false
 }})
 if(label==='source'){baselines.set(m,hits);baselineCount+=hits.size}
 else {
  const added=[...hits].filter(pair=>!baselines.get(m)!.has(pair))
  addedCollisions+=added.length;worstStretch=Math.max(worstStretch,maxStretch)
  assert.ok(maxStretch<1.6,`Palm edge ${worst} stretches ${maxStretch.toFixed(2)}x at ${label}`)
  const newSpan=Math.max(0,...added.map(pair=>spans.get(pair)!));maxNewContactSpan=Math.max(maxNewContactSpan,newSpan)
  assert.ok(newSpan<.001,`Palm crossing exceeds the 1 mm seam-contact tolerance at ${label}: ${newSpan*1000} mm (${added.slice(0,4)})`)
 }
 samples++
 g.dispose()
 }
}
inspect('source')
poseDealerAtTable(r)
const body=new DealerBodyRig(r),stress=process.argv.includes('--stress')||process.argv.includes('--extreme')
for(const amount of process.argv.includes('--extreme')?[1.5]:stress?[.05,1,1.5]:[1]) {
 for(let i=0;i<=(stress?120:12);i++){const time=i/(stress?4:.4);body.reset();body.apply(time,amount,1,amount);inspect(`idle ${time} amount ${amount}`)}
 for(let i=0;i<=90;i++){const age=.7+i/60,f=Math.min(1,age/1.4),w=f*f*(3-2*f);body.reset();body.apply(age+.5,amount*w,1,amount,w,age);inspect(`reveal ${age} amount ${amount}`)}
}
body.dispose()
console.log({samples,baselineBindPoseContacts:baselineCount,addedPalmIntersections:addedCollisions,maximumPalmEdgeStretch:worstStretch,maxNewSeamContactMM:maxNewContactSpan*1000})
console.log('Full palm / thumb-root surface comparison, skin weights and shared-asset preservation passed.')
