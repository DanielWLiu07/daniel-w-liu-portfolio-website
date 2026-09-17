import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import * as T from 'three'
import {OBB} from 'three/addons/math/OBB.js'
import {PaperRecording} from '../components/resume/casino/paper-recording'
import {PaperFlight} from '../components/resume/casino/paper-flight'

for(const profile of ['desktop','portrait']) {
 const bytes=gunzipSync(readFileSync(`public/animations/paper-${profile}-v1.bin.gz`))
 const recording=new PaperRecording(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))
 const fixture=JSON.parse(readFileSync(`scripts/fixtures/paper-${profile}.json`,'utf8'))
 for(const scale of [.4,1,2.5]) {
  const root=new T.Group();root.position.set(4,2,-3);root.rotation.set(.2,-.4,.1);root.scale.setScalar(scale)
  const cards=fixture.cards.map((c:{p:number[];q:number[];size:number[]},i:number)=>{
   const mesh=new T.Mesh(new T.BoxGeometry(c.size[0],c.size[1],Math.max(.001,c.size[2])))
   mesh.position.fromArray(c.p);mesh.quaternion.fromArray(c.q)
   // Responsive carriers may differ in size before the recorded handoff.
   if(i<4)mesh.scale.setScalar(.8+i*.1)
   root.add(mesh);return mesh
  }) as T.Mesh[]
  const word=new T.Mesh(new T.PlaneGeometry(.1,.1));cards[0].updateWorldMatrix(true,false)
  word.position.copy(cards[0].position).add(new T.Vector3(.1,.2,.02));root.add(word)
  const flight=new PaperFlight(recording);flight.start(cards.map((m,i)=>i===0?[m,word]:[m]),70.4,root.getWorldPosition(new T.Vector3()),root.getWorldQuaternion(new T.Quaternion()))
  const original=cards.map(m=>m.position.clone());flight.stage(0)
  cards.forEach((m,i)=>assert.ok(m.position.distanceTo(original[i])<1e-9))
  flight.stage(1);root.updateWorldMatrix(true,true)
  const staged=cards.map(m=>m.matrixWorld.clone());flight.sample(0);root.updateWorldMatrix(true,true)
  cards.forEach((m,i)=>assert.ok(m.matrixWorld.elements.every((v,j)=>Math.abs(v-staged[i].elements[j])<1e-8),'recording joins the staged launch without a jump'))
  const boxes=cards.map(m=>{m.geometry.computeBoundingBox();return new OBB(new T.Vector3(),m.geometry.boundingBox!.getSize(new T.Vector3()).multiplyScalar(.5))})
  let pairs=0
  for(let f=0;f<=6*240;f++) {
   flight.sample(f/240);root.updateWorldMatrix(true,true)
   const world=boxes.map((box,i)=>box.clone().applyMatrix4(cards[i].matrixWorld))
   for(let i=0;i<world.length;i++)for(let j=0;j<i;j++) {pairs++;assert.ok(!world[i].intersectsOBB(world[j]),`${profile} scale ${scale} intersects at ${f/240}: ${i}/${j}`)}
  }
  flight.sample(.4);root.updateWorldMatrix(true,true)
  const pose=cards.map(m=>m.matrixWorld.elements.slice()),relative=new T.Matrix4().copy(cards[0].matrixWorld).invert().multiply(word.matrixWorld)
  flight.sample(5);flight.sample(.01);flight.sample(.4);root.updateWorldMatrix(true,true)
  cards.forEach((m,i)=>assert.deepEqual(m.matrixWorld.elements,pose[i],'backward scrub is deterministic'))
  flight.sample(1);root.updateWorldMatrix(true,true)
  const next=cards[0].matrixWorld.clone().invert().multiply(word.matrixWorld)
  assert.ok(next.elements.every((v,i)=>Math.abs(v-relative.elements[i])<1e-8),'lettering remains attached during playback')
  flight.dispose();assert.equal(flight.active,false)
  cards.forEach(m=>m.geometry.dispose());word.geometry.dispose()
  console.log({profile,scale,pairs})
 }
}
console.log('PASS: compressed playback, interpolated collisions, transformed/resized layouts, launch continuity, attached words and replay')
