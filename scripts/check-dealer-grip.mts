import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {Quaternion,Texture,Triangle,Vector3,type SkinnedMesh} from 'three'
import {dealerPart,poseDealerAtTable} from '../components/resume/casino/dealer-pose'
import {DealerEntranceRig,dealerEntranceTime,entranceFace} from '../components/resume/casino/dealer-entrance'
import {DealerHandGrip} from '../components/resume/casino/dealer-grip'
import {DealerFaceRig} from '../components/resume/face/face-rig'
import {FACE_DEFAULTS} from '../components/resume/face/face-settings'

const loader=new GLTFLoader();loader.register(()=>({name:'T',loadTexture:()=>Promise.resolve(new Texture())}))
const bytes=readFileSync('public/models/casino-dealer-v3.glb')
const {scene:root}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
poseDealerAtTable(root)
const hands={Left:new DealerHandGrip(root,'Left'),Right:new DealerHandGrip(root,'Right')}
const entrance=new DealerEntranceRig(root),face=new DealerFaceRig(root)
const meshes:SkinnedMesh[]=[];root.traverse(o=>{if((o as SkinnedMesh).isSkinnedMesh) meshes.push(o as SkinnedMesh)})
const digitHomes=new Map<string,number[]>()
root.traverse(o=>{if(/^(Left|Right)(Thumb|Index|Middle|Ring|Pinky)\d$/.test(o.name)) digitHomes.set(o.name,o.quaternion.toArray())})
function surface(part:string) {
  const triangles:Triangle[]=[]
  for(const mesh of meshes.filter(m=>dealerPart(m)===part)) {
    mesh.skeleton.update()
    const vertices=Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>mesh.getVertexPosition(i,new Vector3()).applyMatrix4(mesh.matrixWorld))
    const index=mesh.geometry.index,count=index?.count??vertices.length
    for(let i=0;i<count;i+=3) triangles.push(new Triangle(...[0,1,2].map(j=>vertices[index?index.getX(i+j):i+j]) as [Vector3,Vector3,Vector3]))
  }
  return (point:Vector3)=>{
    let distance=Infinity,signed=0
    const closest=new Vector3(),normal=new Vector3()
    for(const triangle of triangles) {
      triangle.closestPointToPoint(point,closest)
      const d=closest.distanceTo(point)
      if(d<distance) {distance=d;signed=point.clone().sub(closest).dot(triangle.getNormal(normal))}
    }
    return {distance,signed}
  }
}
for(const time of [0,.5,.65,.8,1,1.3,1.82,1.88,1.95,2.05,2.12,2.2]) {
  entrance.reset();face.apply(entranceFace(FACE_DEFAULTS,dealerEntranceTime(time)));entrance.apply(dealerEntranceTime(time))
  for(const side of ['Left','Right'] as const) {
    if(side==='Right'&&time<1.82) continue
    const distance=surface(side==='Left'?'Jaw':'Skull')
    const pad=hands[side].point(),contact=distance(pad)
    assert.ok(contact.distance<.012,`${side} actual palm pad must contact the mesh at ${time}: ${contact.distance}`)
    const digits=['Index','Middle','Ring','Pinky'].map(digit=>{
      const joint=root.getObjectByName(side+digit+'3')!
      const base=root.getObjectByName(side+digit+'2')!
      const tip=joint.localToWorld(new Vector3(0,base.position.y,0))
      return {digit,...distance(tip)}
    })
    if(side==='Right'&&time>=1.88) {
      for(const digit of digits) assert.ok(digit.distance<.012 && digit.signed>-.004,`${digit.digit} pad follows the curved skull at ${time}: ${digit.distance}, ${digit.signed}`)
      let deepest=0,bend=0,worst=''
      for(const digit of ['Thumb','Index','Middle','Ring','Pinky']) for(let j=1;j<=3;j++) {
        const node=root.getObjectByName(side+digit+j)!
        const depth=distance(node.getWorldPosition(new Vector3())).signed
        if(depth<deepest) {deepest=depth;worst=node.name}
        bend=Math.max(bend,node.quaternion.angleTo(new Quaternion().fromArray(digitHomes.get(node.name)!)))
      }
      assert.ok(deepest>-.003,`Finger segments remain outside the skull at ${time}: ${worst} ${deepest}`)
      assert.ok(bend<95*Math.PI/180,'Finger joints remain within a curved grasp')
    }
    if(side==='Right'&&time>=1.88) console.log(`Grip ${time}: palm gap ${contact.distance.toFixed(4)} m, fingertip gap ${Math.max(...digits.map(d=>d.distance)).toFixed(4)} m`)
  }
}
for(const time of [3.25,3.5,3.9,4.4]) {
  entrance.reset();face.apply(entranceFace(FACE_DEFAULTS,dealerEntranceTime(time)));entrance.apply(dealerEntranceTime(time))
  const gap=surface('Hat')(hands.Right.point()).distance
  assert.ok(gap>.15,`The released guide hand stays clear of the autonomous hat at ${time}: ${gap}`)
}

entrance.reset()
for(const [name,home] of digitHomes) assert.deepEqual(root.getObjectByName(name)!.quaternion.toArray(),home,'Replaying or live input must restore every finger')
console.log('Grip: palm-to-mesh contact and finger reset passed.')
