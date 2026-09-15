/** Bake the app's exact default facial performance for independent Blender review. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { Mesh, MeshStandardMaterial, Texture } from 'three'
import { DealerFaceRig, facePose, FACE_LOOP_SECONDS } from '../components/resume/face/face-rig'
import { FACE_DEFAULTS } from '../components/resume/face/face-settings'
import { DealerRetargeter } from '../components/resume/motion/retarget'
import { takeClip } from '../components/resume/motion/takes'
import type { MotionTake } from '../components/resume/motion/types'

const loader=new GLTFLoader()
loader.register(()=>({name:'HEADLESS_TEXTURES',loadTexture:()=>Promise.resolve(new Texture())}))
const bytes=readFileSync('public/models/casino-dealer-v3.glb')
const {scene:model}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
const rig=new DealerFaceRig(model), sampler=new DealerRetargeter(model)
const take: MotionTake={version:1,model:'casino-dealer-v3',name:'Expressive dealer idle',duration:FACE_LOOP_SECONDS,frames:[]}
for(let i=0;i<=FACE_LOOP_SECONDS*24;i++){
  const time=i/24
  rig.apply(facePose(FACE_DEFAULTS,time))
  take.frames.push(sampler.sample(time))
}
rig.neutralize()
model.traverse(object=>{
  if(!(object instanceof Mesh))return
  const material=(source:MeshStandardMaterial)=>{const copy=source.clone();copy.map=null;copy.name=`proof::${source.name}`;return copy}
  object.material=Array.isArray(object.material)?object.material.map(m=>material(m as MeshStandardMaterial)):material(object.material as MeshStandardMaterial)
})
class Reader{
  result:ArrayBuffer|string|null=null
  onloadend:(()=>void)|null=null
  async readAsArrayBuffer(blob:Blob){this.result=await blob.arrayBuffer();this.onloadend?.()}
  async readAsDataURL(blob:Blob){this.result=`data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;this.onloadend?.()}
}
Object.assign(globalThis,{FileReader:Reader})
const out='blender-bridge/casino-dealer-v3'
mkdirSync(out,{recursive:true})
const glb=await new GLTFExporter().parseAsync(model,{binary:true,animations:[takeClip(take,model)]})
if(!(glb instanceof ArrayBuffer))throw new Error('Expected GLB')
writeFileSync(`${out}/face-performance.glb`,Buffer.from(glb))
writeFileSync(`${out}/face-performance-take.json`,JSON.stringify(take))
console.log(`Baked ${FACE_LOOP_SECONDS}-second face performance with neck/head scale, jaw, rotations and sockets.`)
