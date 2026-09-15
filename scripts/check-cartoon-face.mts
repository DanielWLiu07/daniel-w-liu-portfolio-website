import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { AnimationMixer, Bone, Group, Mesh, PerspectiveCamera, Quaternion, SkinnedMesh, Texture, Vector2, Vector3 } from 'three'
import { FACE_CONTROLS, FACE_DEFAULTS, FACE_PRESETS, cleanFaceSettings, getFaceSettings, setFaceSettings } from '../components/resume/face/face-settings'
import { DealerFaceRig, FACE_LOOP_SECONDS, facePose } from '../components/resume/face/face-rig'
import { DealerRetargeter } from '../components/resume/motion/retarget'
import { parseTake, sampleTake, takeClip } from '../components/resume/motion/takes'
import { validPose } from '../components/resume/motion/scene-bridge'
import type { MotionTake } from '../components/resume/motion/types'
import { dealerPart, dealerPlacement, poseDealerAtTable } from '../components/resume/casino/dealer-pose'
import { MouseLook, mouseLookAngles } from '../components/resume/face/mouse-look'

const loader=new GLTFLoader()
loader.register(() => ({name:'HEADLESS_TEXTURES',loadTexture:() => Promise.resolve(new Texture())}))
const bytes=readFileSync('public/models/casino-dealer-v3.glb')
const source=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
const originalScales=new Map<string,number[]>()
source.scene.traverse(object=>{if((object as Bone).isBone) originalScales.set(object.name,object.scale.toArray())})
const model=clone(source.scene), rig=new DealerFaceRig(model), sampler=new DealerRetargeter(model)
const head=model.getObjectByName('Head') as Bone, jaw=model.getObjectByName('JawHinge') as Bone
const neck=model.getObjectByName('neck') as Bone, neckRest=neck.scale.clone()
const rest=sampler.sample(0)
const up=new Vector3(0,1,0).applyQuaternion(head.getWorldQuaternion(new Quaternion()))
assert.ok(up.dot(new Vector3(0,1,0))>.98,'Head local Y must match the skull squash/stretch axis')
const shapes=new Set<string>()
model.traverse(object => { const m=object as Mesh; if(m.isMesh) Object.keys(m.morphTargetDictionary ?? {}).forEach(name=>shapes.add(name)) })
for(const side of ['Left','Right']) for(const action of ['socketWide','socketTiltIn','socketTiltOut']) assert.ok(shapes.has(action+side),`Missing ${action+side}`)

for(const preset of Object.values(FACE_PRESETS)) for(const time of [0,1.7,3.62,7.47,11.99,12]) {
  const settings={...FACE_DEFAULTS,...preset}
  const pose=facePose(settings,time)
  assert.ok(Math.abs(pose.scale.reduce((a,b)=>a*b,1)-settings.skullSize**3)<1e-10,'Squash/stretch preserves volume independently of size')
  rig.apply(pose)
  const sample=sampler.sample(time)
  assert.ok(validPose(sample))
  assert.equal(sample.expressions.jawOpen,0,'Jaw morph cannot double the hinge rotation')
  model.traverse(object => {
    if(!(object instanceof SkinnedMesh)) return
    object.skeleton.update()
    for(let i=0;i<object.geometry.attributes.position.count;i+=11) assert.ok(object.getVertexPosition(i,new Vector3()).toArray().every(Number.isFinite))
  })
}
rig.neutralize()
assert.ok(head.quaternion.angleTo(new Quaternion().fromArray(rest.bones.Head))<1e-7)
const jawRest=jaw.quaternion.clone()
rig.apply(facePose({...FACE_DEFAULTS,idle:false,jawOpen:1},0))
assert.ok(Math.abs(jaw.quaternion.angleTo(jawRest)-23*Math.PI/180)<1e-7,'Jaw opens on a bounded physical hinge')
for(const amount of [-1,1]) {
  const p=facePose({...FACE_DEFAULTS,squash:amount,skullWidth:amount,idle:false},0)
  assert.ok(Math.abs(p.scale.reduce((a,b)=>a*b,1)-FACE_DEFAULTS.skullSize**3)<1e-10)
}
const closed=facePose({...FACE_DEFAULTS,blinkLeft:1,socketLeft:1,idle:false},0)
assert.equal(closed.expressions.socketWideLeft,0,'Blink wins over socket opening')
assert.equal(closed.expressions.squintLeft,0,'Blink cannot stack with squint')
assert.deepEqual(facePose(FACE_DEFAULTS,0),facePose(FACE_DEFAULTS,FACE_LOOP_SECONDS),'Idle loops without a pose seam')
assert.equal(JSON.stringify(facePose({...FACE_DEFAULTS,idle:false},0)),JSON.stringify(facePose({...FACE_DEFAULTS,idle:false},4.1)),'Manual posing disables all automatic motion')
rig.neutralize()
const restVolume=Math.abs(head.matrixWorld.determinant())
const heights:number[]=[], lifts:number[]=[], stretches:number[]=[]
for(let frame=0;frame<720;frame++) {
  const pose=facePose(FACE_DEFAULTS,frame/60)
  rig.apply(pose,1/60)
  heights.push(head.getWorldPosition(new Vector3()).y)
  lifts.push(pose.lift);stretches.push(pose.scale[1])
  const expectedVolume=Math.exp(Math.log(FACE_DEFAULTS.skullSize)*3*(1-Math.exp(-(frame+1)/60/.075)))
  assert.ok(Math.abs(Math.abs(head.matrixWorld.determinant())/restVolume-expectedVolume)<1e-6,'Smoothed bounce retains skull volume under neck scaling')
  assert.ok(validPose(sampler.sample(frame/60)),'Continuous performance remains exportable')
}
const span=(values:number[])=>Math.max(...values)-Math.min(...values)
assert.ok(span(lifts)>.055 && span(heights)>.05,'Default performance visibly raises and lowers the complete head')
assert.ok(span(stretches)>.08 && span(stretches)<.19,'Default skull stretch stays expressive but restrained')
rig.neutralize()
assert.ok(neck.scale.distanceTo(neckRest)<1e-7,'Neutral reset clears neck bounce')
const limits=cleanFaceSettings(Object.fromEntries(FACE_CONTROLS.map(c=>[c.key,Infinity])))
assert.deepEqual(limits,FACE_DEFAULTS)

rig.neutralize()
const config={...FACE_DEFAULTS,skullSize:1.2,squash:.7}
const take: MotionTake={version:1,model:'casino-dealer-v3',name:'Cartoon face test',duration:1,frames:[]}
for(let i=0;i<=24;i++){rig.apply(facePose(config,i/24));take.frames.push(sampler.sample(i/24))}
assert.deepEqual(parseTake(JSON.stringify(take)),take)
assert.ok(validPose(sampleTake(take,.5)))
const clip=takeClip(take,model)
assert.ok(clip.tracks.some(track=>track.name==='Head.scale'),'Head shape has an exportable scale track')
assert.ok(clip.tracks.some(track=>track.name==='neck.scale'),'Vertical bounce has an exportable scale track')
rig.neutralize()
const mixer=new AnimationMixer(model)
mixer.clipAction(clip).play();mixer.setTime(.5)
assert.ok(head.scale.distanceTo(new Vector3(...take.frames[12].scales!.Head))<1e-6,'Playback retains exaggerated proportions')
assert.ok(neck.scale.distanceTo(new Vector3(...take.frames[12].scales!.neck))<1e-6,'Playback retains head bounce')
mixer.stopAllAction();mixer.uncacheRoot(model)
rig.neutralize()
sampler.apply({time:0,bones:rest.bones,expressions:rest.expressions})
assert.ok(head.scale.distanceTo(new Vector3(...(rest.scales?.Head ?? [1,1,1])))<1e-7,'Legacy webcam takes clear previous skull scaling')
assert.ok(neck.scale.distanceTo(neckRest)<1e-7,'Legacy webcam takes clear neck bounce')
source.scene.traverse(object=>{if((object as Bone).isBone) assert.deepEqual(object.scale.toArray(),originalScales.get(object.name),'Cached source remains unchanged')})
const framed=clone(source.scene), actor=new Group()
poseDealerAtTable(framed);actor.add(framed)
const sceneFace=new DealerFaceRig(framed)
for(const aspect of [1500/900,390/844]) {
  const placement=dealerPlacement(0,-2.5,.7,Math.min(1,aspect/(1500/900)))
  actor.position.fromArray(placement.position);actor.scale.setScalar(placement.scale)
  actor.updateMatrixWorld(true)
  const camera=new PerspectiveCamera(25,aspect,.1,200)
  camera.position.set(0,4.6,12.5);camera.lookAt(0,1.4,-.6);camera.updateMatrixWorld(true)
  sceneFace.neutralize()
  const sceneHead=framed.getObjectByName('Head')!
  const center=sceneHead.getWorldPosition(new Vector3()).project(camera)
  const straight=mouseLookAngles(new Vector2(center.x,center.y),camera,framed,sceneHead)
  assert.ok(Math.abs(straight[0])+Math.abs(straight[1])<1e-8,'Cursor over skull does not introduce a turn')
  const left=mouseLookAngles(new Vector2(center.x-.5,center.y),camera,framed,sceneHead)
  const right=mouseLookAngles(new Vector2(center.x+.5,center.y),camera,framed,sceneHead)
  const above=mouseLookAngles(new Vector2(center.x,center.y+.5),camera,framed,sceneHead)
  const below=mouseLookAngles(new Vector2(center.x,center.y-.5),camera,framed,sceneHead)
  assert.ok(left[1]<0 && right[1]>0 && above[0]<0 && below[0]>0,'Head follows pointer direction relative to its projected position')
  const attention=new MouseLook(), base=facePose(FACE_DEFAULTS,1.5)
  let looking=base
  for(let i=0;i<120;i++) looking=attention.apply(base,FACE_DEFAULTS,right,1/60)
  assert.ok(looking.head[1]>0 && Math.abs(looking.head[1]-right[1])<Math.abs(base.head[1]-right[1]),'Cursor gains attention over the idle glance')
  assert.deepEqual(looking.scale,base.scale);assert.equal(looking.lift,base.lift)
  assert.deepEqual(looking.expressions,base.expressions);assert.deepEqual(looking.jaw,base.jaw)
  const reversal=attention.apply(base,FACE_DEFAULTS,left,1/60)
  assert.ok(Math.abs(reversal.head[1]-looking.head[1])<8,'A cursor reversal turns the skull gradually rather than snapping')
  const first=attention.apply(base,FACE_DEFAULTS,null,1/60)
  assert.ok(Math.abs(first.head[1]-base.head[1])>1,'Leaving the canvas returns gradually')
  for(let i=0;i<360;i++) looking=attention.apply(base,FACE_DEFAULTS,null,1/60)
  assert.deepEqual(looking,base,'Idle resumes after cursor leaves')
  assert.deepEqual(new MouseLook().apply(base,{...FACE_DEFAULTS,followMouse:false},right,1/60),base,'Disabled mouse tracking leaves animation unchanged')
  for(const pointer of [new Vector2(-100,100),new Vector2(100,-100)]) {
    const angles=mouseLookAngles(pointer,camera,framed,sceneHead)
    assert.ok(Math.abs(angles[0])<=20 && Math.abs(angles[1])<=35,'Extreme targets keep neck turns bounded')
  }
  for(const preset of [{},FACE_PRESETS.Showtime]) for(let i=0;i<FACE_LOOP_SECONDS*12;i++) {
    sceneFace.apply(facePose({...FACE_DEFAULTS,...preset},i/12))
    framed.traverse(object=>{
      if(!(object instanceof SkinnedMesh) || dealerPart(object)!=='Hat') return
      object.skeleton.update()
      for(let j=0;j<object.geometry.attributes.position.count;j+=7) {
        const v=object.getVertexPosition(j,new Vector3()).applyMatrix4(object.matrixWorld).project(camera)
        assert.ok(Math.abs(v.x)<.98 && Math.abs(v.y)<.98,`Animated hat leaves the ${aspect} frame`)
      }
    })
  }
}
console.log('Cartoon face: rig, bounce, volume, export playback and animated framing passed; mouse direction, bounded turns, expression preservation, toggle and smooth return passed in portrait and desktop.')
const saved=new Map<string,string>([['casino-face-v1',JSON.stringify({...FACE_DEFAULTS,followMouse:false,smile:.73})]])
const storage={getItem:(key:string)=>saved.get(key)??null,setItem:(key:string,value:string)=>{saved.set(key,value)}}
Object.assign(globalThis,{window:{},localStorage:storage})
assert.equal(getFaceSettings().followMouse,true,'Existing saved Neutral faces regain the requested cursor attention')
assert.equal(getFaceSettings().smile,.73,'Attention migration preserves other saved face controls')
assert.equal(JSON.parse(saved.get('casino-face-v1')!).followMouse,true,'Attention change survives reload')
setFaceSettings({followMouse:false});assert.equal(getFaceSettings().followMouse,false,'Later explicit checkbox choices still work')
Reflect.deleteProperty(globalThis,'window');Reflect.deleteProperty(globalThis,'localStorage')
console.log('Saved mouse attention migration and preservation of explicit controls passed.')
