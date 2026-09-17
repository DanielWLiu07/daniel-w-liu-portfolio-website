import { readFileSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import * as THREE from 'three'
import { OBB } from 'three/addons/math/OBB.js'
import { PaperFlight, paperPhysicsReady } from './lib/paper-bake-solver'
import { PaperRecording } from '../components/resume/casino/paper-recording'

async function main() {
 await paperPhysicsReady
 for (const profile of ['desktop', 'portrait']) {
  const source = JSON.parse(readFileSync(`scripts/fixtures/paper-${profile}.json`, 'utf8'))
  const cards = source.cards.map((c: {p:number[];q:number[];size:number[]}) => {
   const mesh = new THREE.Mesh(new THREE.BoxGeometry(c.size[0], c.size[1], Math.max(.001, c.size[2])))
   mesh.position.fromArray(c.p); mesh.quaternion.fromArray(c.q); return mesh
  }) as THREE.Mesh[]
  const flight = new PaperFlight(); flight.start(cards.map(c => [c]), source.speed, new THREE.Vector3())
  const fps = 30, frames = 6 * fps + 1, count = cards.length
  const poses = Array.from({length:count},()=>[] as number[])
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for(let frame=0;frame<frames;frame++) {
   flight.sample(frame/fps)
   cards.forEach((card,i)=>{
    const p=card.position.toArray(),q=card.quaternion.toArray()
    p.forEach((v,j)=>{min[j]=Math.min(min[j],v);max[j]=Math.max(max[j],v)})
    poses[i].push(...p,...q)
   })
  }
  flight.dispose()
  const offset=36+count*12, buffer=new ArrayBuffer(offset+count*frames*14), data=new DataView(buffer)
  data.setUint32(0,0x324b4250,true);data.setUint16(4,count,true);data.setUint16(6,fps,true);data.setUint32(8,frames,true)
  ;[...min,...max].forEach((v,i)=>data.setFloat32(12+i*4,v,true))
  source.cards.forEach((c:{size:number[]},i:number)=>c.size.forEach((v,j)=>data.setFloat32(36+i*12+j*4,v,true)))
  for(let body=0;body<count;body++)for(let channel=0;channel<7;channel++) {
   let previous=0,previousDelta=0
   for(let frame=0;frame<frames;frame++) {
    const value=poses[body][frame*7+channel]
    const quantized=channel<3?Math.round((value-min[channel])/(max[channel]-min[channel]||1)*65535):Math.round(value*32767)
    const delta=quantized-previous
    data.setInt16(offset+((body*7+channel)*frames+frame)*2,delta-previousDelta,true)
    previous=quantized;previousDelta=delta
   }
  }
  const recording=new PaperRecording(buffer),p=new THREE.Vector3(),q=new THREE.Quaternion(),matrix=new THREE.Matrix4()
  let intersections=0,first='',pairs=0,maxPositionError=0
  const boxes=recording.sizes.map(size=>new OBB(new THREE.Vector3(),new THREE.Vector3(size.x/2,size.y/2,Math.max(.001,size.z/2))))
  for(let frame=0;frame<=6*120;frame++) {
   const time=frame/120
   boxes.forEach((box,i)=>{recording.sample(i,time,p,q);box.center.copy(p);box.rotation.setFromMatrix4(matrix.makeRotationFromQuaternion(q))})
   for(let i=0;i<count;i++)for(let j=0;j<i;j++) {pairs++;if(boxes[i].intersectsOBB(boxes[j])){intersections++;first ||= `${time}: ${i}/${j}`}}
  }
  for(let i=0;i<count;i++)for(let frame=0;frame<frames;frame++) {recording.sample(i,frame/fps,p,q);maxPositionError=Math.max(maxPositionError,p.distanceTo(new THREE.Vector3().fromArray(poses[i],frame*7)))}
  const compressed=gzipSync(new Uint8Array(buffer),{level:9})
  console.log({profile,frames,pairs,intersections,first,bytes:compressed.length,maxPositionError})
  if(intersections)throw new Error('Baked playback has intersections')
  writeFileSync(`public/animations/paper-${profile}-v1.bin.gz`,compressed)
  cards.forEach(c=>c.geometry.dispose())
 }
}
void main()
