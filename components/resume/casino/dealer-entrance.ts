import { Bone, BufferAttribute, Object3D, Quaternion, Skeleton, SkinnedMesh, Vector3 } from 'three'
import { dealerPart } from './dealer-pose'
import { impactBurstMotion } from './impact-eye-motion'
import { facePose, type FacePose } from '../face/face-rig'
import type { FaceSettings } from '../face/face-settings'
import { dealerCrownPlanes, openDealerHat } from './dealer-hat-fit'
import { DealerArmRig } from './dealer-arms'
import { DealerHandGrip, DealerSurfaceContact } from './dealer-grip'

const clamp=(x:number)=>Math.max(0,Math.min(1,x))
const ease=(x:number)=>{const t=clamp(x);return t*t*t*(t*(t*6-15)+10)}
const phase=(age:number,start:number,end:number)=>ease((age-start)/(end-start))
const reachPhase=(age:number,start:number,end:number)=>{const t=clamp((age-start)/(end-start));return t*t*(3-2*t)}
const HEAD_SEATED=2.12,HAT_LAND=4.4,ENTRANCE_END=5.7,IDLE_START=4.9
export const DEALER_HAT_LIFT=.030
const HAT_FIT=new Vector3(1.16,1,1.12)
export const DEALER_ENTRANCE_SPEED=1.6
const INTRO_SPEED=DEALER_ENTRANCE_SPEED,IMPACT_HOLD=.46
/** Keep impact exposures intact; speed up the connected assembly afterward. */
export const dealerEntranceTime=(authored:number)=>authored<=IMPACT_HOLD?authored:IMPACT_HOLD+(authored-IMPACT_HOLD)/INTRO_SPEED
const entranceClock=(age:number)=>age<=IMPACT_HOLD?age:IMPACT_HOLD+(age-IMPACT_HOLD)*INTRO_SPEED
export const DEALER_HAT_VISIBLE=dealerEntranceTime(.8)
export const DEALER_HEAD_SEATED=dealerEntranceTime(HEAD_SEATED)
export const DEALER_HAT_LAND=dealerEntranceTime(HAT_LAND)
export const DEALER_ENTRANCE_END=dealerEntranceTime(ENTRANCE_END)
export const DEALER_IDLE_START=dealerEntranceTime(IDLE_START)

/** Absolute impact time: supports replay and scrubbing without accumulating transforms. */
export function dealerEntrance(age:number) {
  const t=Math.max(0,entranceClock(age)), seat=phase(t,1.48,HEAD_SEATED)
  const rise=phase(t,.46,1.68)
  // Smooth compression and recovery give contact weight without an abrupt
  // velocity change at the instant the neck catches the skull.
  const seatBounce=-.012*phase(t,HEAD_SEATED,2.30)*(1-phase(t,2.30,2.70))
  // A cocky swoop stays on the free side of the skull and receiving cards.
  // Finish the brim flourish while high, then descend squarely onto the crown.
  const u=phase(t,1.95,3.50),v=1-u,drop=phase(t,3.50,HAT_LAND)
  const hatOffset=new Vector3(-1.05,8,-.10).multiplyScalar(v*v*v)
    .addScaledVector(new Vector3(-.90,.95,-.12),3*v*v*u)
    .addScaledVector(new Vector3(-.24,.46,-.04),3*v*u*u)
    .addScaledVector(new Vector3(0,.15,0),u*u*u)
    .multiplyScalar(1-drop)
  const hatSettle=phase(t,HAT_LAND,4.57)*(1-phase(t,4.57,5.02))
  hatOffset.y+=.028*hatSettle
  const flourish=Math.sin(Math.PI*u)
  // A small brim tip remains visible after the broad, offscreen wind-up.
  const tip=Math.sin(Math.PI*phase(t,3.03,3.50))**2
  const impact=1-phase(t,.46,.94)
  const nod=phase(t,1.64,HEAD_SEATED)*(1-phase(t,HEAD_SEATED,2.68))
  const lift=phase(t,.35,1.16)*(1-seat)
  const life=1-phase(t,2.3,3.2)
  return {
    visible:age>=0,
    bodyReveal:impactBurstMotion(age).reveal,
    hatVisible:age>=DEALER_HAT_VISIBLE,
    idle:phase(t,IDLE_START,ENTRANCE_END),
    seat,
    // The neck pauses just below the waiting skull, then closes the last gap.
    bodyOffsetY:-.46*(1-rise)-.045*(rise-seat)+seatBounce*.45,
    bodyOffsetX:-.20*(1-rise)+.035*Math.sin(Math.PI*rise),
    bodyBank:(-3*(1-rise)+2*Math.sin(Math.PI*rise))*(1-seat),
    torsoSway:phase(t,2.65,3.50)*(1-phase(t,3.70,4.75)),
    secondHand:reachPhase(t,.78,1.82),
    handRelease:phase(t,2.22,3.1),
    headOffset:new Vector3(.006*Math.sin(t*5)*life,(.09*lift+.012*Math.sin(t*6)*life*(1-seat)+seatBounce),.055*lift+.006*Math.sin(t*4)*life*(1-seat)),
    headRoll:(6*Math.sin(t*5)+3*Math.sin(t*11)-18*Math.exp(-t*8))*impact+(2.8*Math.sin(t*2.5)-2*nod+3*Math.sin(Math.PI*u))*(1-impact),
    squash:(.5*Math.sin(t*6)+.15*Math.sin(t*13)+.45*Math.sin(t*19)*Math.exp(-t*5))*impact+(.28*Math.sin(t*3.5)-seatBounce*12-.08*hatSettle)*(1-impact),
    hatOffset,
    hatAttach:phase(t,2.95,3.48),
    hatScale:1,
    hatTurn:.62*(1-u)-.25*flourish-.40*tip,
    hatTilt:-.72*(1-u)+.30*Math.sin(2*Math.PI*u)*flourish+.22*tip,
    hatPitch:.22*flourish,
  }
}

export function entranceFace(settings:FaceSettings,age:number):FacePose {
  const state=dealerEntrance(age)
  const t=Math.max(0,entranceClock(age))
  // Hold the wink across multiple 12 fps impact exposures. A sharp closure,
  // raised opposite brow and cheeky jaw shift give it a readable intention.
  const wink=1-phase(Math.max(0,age),.34,.58)
  const surprise=1-phase(t,.04,.16)
  const grin=phase(t,.12,.24)*(1-phase(t,.65,.94))
  const hatLook=phase(t,2.65,3.35)*(1-phase(t,3.70,4.40))
  const nod=phase(t,1.64,HEAD_SEATED)*(1-phase(t,HEAD_SEATED,2.68))
  const hatDip=phase(t,4.12,HAT_LAND)*(1-phase(t,HAT_LAND,4.95))
  const assembly=phase(t,.46,.94)
  const seatBlink=.45*phase(t,2.08,2.14)*(1-phase(t,2.19,2.35))
  return facePose({...settings,idle:false,headYaw:-5*wink+(5-2*assembly)*Math.sin(t*(3.4-.9*assembly)),headPitch:4*Math.sin(t*4.8)*(1-assembly)+(2*Math.sin(t*2.4)+4*nod+5*hatDip)*assembly-7*hatLook,headRoll:state.headRoll-5*wink,
    jawOpen:.16+.32*surprise-.06*grin+.07*Math.sin(t*7)+.16*hatLook,jawSide:.22*wink+.16*Math.sin(t*5),smile:.48+.32*grin+.12*Math.sin(t*4),squash:state.squash-.15*wink,
    skullWidth:.20*Math.sin(t*5-.3)+.12*grin,socketLeft:.2+.25*Math.sin(t*5),socketRight:.22+.4*surprise+.2*wink+.2*Math.sin(t*4+.6),
    blinkLeft:Math.max(wink,seatBlink),blinkRight:seatBlink,browLeft:.35-.6*wink+.25*Math.sin(t*4),browRight:.35+.5*wink+.18*Math.sin(t*5+.3),tiltLeft:.12*Math.sin(t*3),tiltRight:-.18*wink},0)
}

export function blendEntranceFace(intro:FacePose,idle:FacePose,weight:number):FacePose {
  const mix=(a:number,b:number)=>a+(b-a)*weight
  return {
    head:intro.head.map((v,i)=>mix(v,idle.head[i])) as FacePose['head'],
    jaw:intro.jaw.map((v,i)=>mix(v,idle.jaw[i])) as FacePose['jaw'],
    scale:intro.scale.map((v,i)=>Math.exp(mix(Math.log(v),Math.log(idle.scale[i])))) as FacePose['scale'],
    lift:mix(intro.lift,idle.lift),
    expressions:Object.fromEntries(Object.keys(idle.expressions).map(key=>[key,mix(intro.expressions[key]??0,idle.expressions[key])])),
  }
}

/** A private hat joint and two-bone arm solve; the shared GLB remains untouched. */
export class DealerEntranceRig {
  private body:Bone
  private bodyHome:Vector3
  private bodyOrigin:Vector3
  private bodyRotation:Quaternion
  private bodyLocalRotation:Quaternion
  private head:Bone
  private headHome:Vector3
  private headOrigin:Vector3
  private supportSurface:DealerSurfaceContact
  private guideSurface:DealerSurfaceContact
  private grips:Record<'Left'|'Right',DealerHandGrip>
  private fingerSurfaces:{digit:string;surface:DealerSurfaceContact}[]=[]
  private armRig:DealerArmRig
  private hat:Bone
  private hatOrigin:Vector3
  private hatHome:Vector3
  private hatFrameHome:Quaternion
  private arms:{bone:Bone;rotation:Quaternion}[]=[]
  private torso:{bone:Bone;rotation:Quaternion;roll:Vector3;pitch:Vector3;weight:number}[]=[]
  private hats:SkinnedMesh[]=[]
  private skeletons:Skeleton[]=[]
  constructor(readonly root:Object3D) {
    root.updateWorldMatrix(true,true)
    this.body=root.getObjectByName('Root') as Bone
    this.bodyHome=this.body.position.clone()
    this.bodyOrigin=this.local(this.body)
    this.bodyRotation=this.body.quaternion.clone()
    this.bodyLocalRotation=root.getWorldQuaternion(new Quaternion()).invert().multiply(this.body.getWorldQuaternion(new Quaternion()))
    for(const [i,name] of ['Spine02','Spine01','Spine'].entries()) {
      const bone=root.getObjectByName(name) as Bone
      const inverse=bone.getWorldQuaternion(new Quaternion()).invert().multiply(root.getWorldQuaternion(new Quaternion()))
      this.torso.push({bone,rotation:bone.quaternion.clone(),roll:new Vector3(0,0,1).applyQuaternion(inverse),pitch:new Vector3(1,0,0).applyQuaternion(inverse),weight:[.25,.35,.4][i]})
    }
    this.head=root.getObjectByName('Head') as Bone
    this.headHome=this.head.position.clone()
    this.headOrigin=this.local(this.head)
    const artOrigin=root.userData.dealerHeadArtOrigin?new Vector3().fromArray(root.userData.dealerHeadArtOrigin):this.headOrigin
    this.supportSurface=new DealerSurfaceContact(root,'Jaw',artOrigin.clone().add(new Vector3(.025,-.105,.075)),new Vector3(0,-1,0))
    this.guideSurface=new DealerSurfaceContact(root,'Skull',artOrigin.clone().add(new Vector3(-.155,.13,-.045)),new Vector3(-1,0,0))
    this.grips={Left:new DealerHandGrip(root,'Left'),Right:new DealerHandGrip(root,'Right')}
    this.armRig=new DealerArmRig(root,this.grips)
    for(const [i,digit] of ['Index','Middle','Ring','Pinky'].entries()) this.fingerSurfaces.push({digit,surface:new DealerSurfaceContact(root,'Skull',new Vector3(-.105,[1.745,1.79,1.79,1.765][i],.075-i*.045),new Vector3(-1,1,0).normalize())})
    this.fingerSurfaces.push({digit:'Thumb',surface:new DealerSurfaceContact(root,'Skull',new Vector3(-.17,1.70,-.05),new Vector3(-1,.1,0).normalize())})
    for(const side of ['Left','Right']) for(const suffix of ['Arm','ForeArm','Hand']) {
      const bone=root.getObjectByName(side+suffix) as Bone
      this.arms.push({bone,rotation:bone.quaternion.clone()})
    }
    const shoulder=root.getObjectByName('LeftShoulder') as Bone
    this.arms.push({bone:shoulder,rotation:shoulder.quaternion.clone()})
    this.hat=new Bone();this.hat.name='DealerHatEntrance'
    this.head.add(this.hat)
    this.hat.position.copy(this.head.worldToLocal(root.localToWorld(new Vector3(0,1.69,0))))
    this.hatHome=this.hat.position.clone()
    this.hatHome.y+=DEALER_HAT_LIFT
    this.hatOrigin=this.local(this.hat)
    this.hatFrameHome=root.getWorldQuaternion(new Quaternion()).invert().multiply(this.hat.getWorldQuaternion(new Quaternion()))
    root.updateWorldMatrix(true,true)
    const crown=dealerCrownPlanes(root,this.head)
    root.traverse(node=>{
      const object=node as SkinnedMesh
      if(!object.isSkinnedMesh || !['Hat','Hatband'].includes(dealerPart(object))) return
      // These parts are rigidly weighted to Head in v3. Rebind only private
      // geometry to the new child joint, preserving their exact resting artwork.
      object.geometry=object.geometry.clone()
      openDealerHat(object,this.head,this.hat.position,this.hatHome,HAT_FIT,crown)
      const count=object.geometry.attributes.position.count
      object.geometry.setAttribute('skinIndex',new BufferAttribute(new Uint16Array(count*4),4))
      const weights=new Float32Array(count*4);for(let i=0;i<count;i++) weights[i*4]=1
      object.geometry.setAttribute('skinWeight',new BufferAttribute(weights,4))
      const skeleton=new Skeleton([this.hat],[this.hat.matrixWorld.clone().invert()])
      object.bind(skeleton,object.matrixWorld.clone())
      this.hats.push(object);this.skeletons.push(skeleton)
    })

  }
  private local(object:Object3D) {return this.root.worldToLocal(object.getWorldPosition(new Vector3()))}
  private world(point:Vector3) {return this.root.localToWorld(point.clone())}
  reset() {
    this.body.position.copy(this.bodyHome)
    this.body.quaternion.copy(this.bodyRotation)
    this.head.position.copy(this.headHome)
    this.hat.position.copy(this.hatHome);this.hat.quaternion.identity();this.hat.scale.copy(HAT_FIT)
    for(const {bone,rotation} of [...this.arms,...this.torso]) bone.quaternion.copy(rotation)
    this.grips.Left.reset();this.grips.Right.reset()
    this.root.updateWorldMatrix(true,true)
  }
  apply(age:number) {
    const state=dealerEntrance(age)
    if(age>=DEALER_ENTRANCE_END) return state
    const t=entranceClock(age)
    const headRotation=this.head.getWorldQuaternion(new Quaternion())
    const bank=state.bodyBank*Math.PI/180,axis=new Vector3(0,0,1),pivot=new Vector3(0,1.01,.05)
    const bodyPosition=this.bodyOrigin.clone().sub(pivot).applyAxisAngle(axis,bank).add(pivot).add(new Vector3(state.bodyOffsetX,state.bodyOffsetY,0))
    this.body.position.copy(this.body.parent!.worldToLocal(this.world(bodyPosition)))
    const bodyWorld=this.root.getWorldQuaternion(new Quaternion()).multiply(new Quaternion().setFromAxisAngle(axis,bank)).multiply(this.bodyLocalRotation)
    this.body.quaternion.copy(this.body.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(bodyWorld))
    this.root.updateWorldMatrix(true,true)
    // A small chest recoil accompanies the upward glance; arms stay free.
    for(const {bone,rotation,roll,pitch,weight} of this.torso) {
      bone.quaternion.copy(rotation)
        .multiply(new Quaternion().setFromAxisAngle(roll,2*state.torsoSway*weight*Math.PI/180))
        .multiply(new Quaternion().setFromAxisAngle(pitch,-2*state.torsoSway*weight*Math.PI/180))
    }
    this.root.updateWorldMatrix(true,true)
    // A small clavicle lift reaches the waiting skull with the corrected wrist.
    // The torso remains below the table during the skull-only impact.
    const shoulder=this.root.getObjectByName('LeftShoulder') as Bone,upper=this.root.getObjectByName('LeftArm')!
    const parent=shoulder.parent!,origin=shoulder.position
    const from=parent.worldToLocal(upper.getWorldPosition(new Vector3())).sub(origin).normalize()
    const raised=this.local(upper).add(new Vector3(0,.10*(1-phase(t,.46,1.68)),0))
    const to=parent.worldToLocal(this.world(raised)).sub(origin).normalize()
    shoulder.quaternion.premultiply(new Quaternion().setFromUnitVectors(from,to)).normalize()
    this.root.updateWorldMatrix(true,true)
    const position=this.headOrigin.clone().add(state.headOffset)
    if(t<3.2) this.head.position.copy(this.head.parent!.worldToLocal(this.world(position))).lerp(this.headHome,phase(t,HEAD_SEATED,2.42))
    this.head.quaternion.copy(this.head.parent!.getWorldQuaternion(new Quaternion()).normalize().invert().multiply(headRotation.normalize())).normalize()
    this.root.updateWorldMatrix(true,true)
    // Keep the airborne hat independent of head acting until its final descent.
    const hatRest=this.local(this.hat)
    const localHeadRotation=this.root.getWorldQuaternion(new Quaternion()).invert().multiply(this.head.getWorldQuaternion(new Quaternion()))
    const offset=state.hatOffset.clone().lerp(state.hatOffset.clone().applyQuaternion(localHeadRotation),state.hatAttach)
    const airborne=this.hatOrigin.clone().lerp(hatRest,state.hatAttach).add(offset)
    this.hat.position.copy(this.head.worldToLocal(this.world(airborne)))
    this.hat.scale.copy(HAT_FIT)
    const flourish=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),state.hatTurn)
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),state.hatTilt))
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),state.hatPitch))
    const headWorld=this.head.getWorldQuaternion(new Quaternion()).normalize()
    const airborneRotation=this.root.getWorldQuaternion(new Quaternion()).multiply(this.hatFrameHome).multiply(flourish)
    const seatedRotation=headWorld.clone().multiply(flourish)
    this.hat.quaternion.copy(headWorld.invert().multiply(airborneRotation.slerp(seatedRotation,state.hatAttach))).normalize()
    this.root.updateWorldMatrix(true,true)
    const supportContact=this.supportSurface.sample(),guideContact=this.guideSurface.sample()
    const support=supportContact.point.clone().addScaledVector(supportContact.normal,.003)
    const restSupport=this.grips.Left.point()
    support.lerp(restSupport,state.handRelease)
    // Keep the elbow forward and outside the torso as the shoulder rises past
    // the jaw. A low pole crosses the reach axis and flips the elbow inward.
    const supportPole=this.local(this.root.getObjectByName('LeftArm')!).add(new Vector3(.2,-.8,.8))
    const headFrame=this.root.getWorldQuaternion(new Quaternion()).invert().multiply(this.head.getWorldQuaternion(new Quaternion()))
    // Surface normals follow skull deformation. Fingers point over the jaw/crown.
    const supportNormal=supportContact.normal.clone().negate().lerp(new Vector3(0,1,0),state.handRelease).normalize()
    this.armRig.palm('Left',support,supportPole,supportNormal,new Vector3(0,0,-1))
    for(const {bone,rotation} of this.arms) if(bone.name.startsWith('Left')) bone.quaternion.slerp(rotation,state.handRelease)
    this.root.updateWorldMatrix(true,true)
    const join=state.secondHand*(1-phase(t,2.25,3.10))
    if(join>0) {
      const guide=guideContact.point.clone().addScaledVector(guideContact.normal,.011)
      const target=this.grips.Right.point().lerp(guide,join)
      // Lift outside the silhouette, then lower the cupped hand onto the skull.
      const reachArc=Math.sin(Math.PI*state.secondHand)*(1-state.handRelease)
      target.add(new Vector3(-.03*reachArc,.035*reachArc,.02*reachArc))
      const normal=this.grips.Right.frame().normal.lerp(guideContact.normal.clone().negate(),join).normalize()
      const forward=new Vector3(0,0,1).lerp(new Vector3(0,1,0).applyQuaternion(headFrame),join).normalize()
      const pole=this.local(this.root.getObjectByName('RightForeArm')!).lerp(this.local(this.root.getObjectByName('RightArm')!).add(new Vector3(-.3,-.4,.65)),join)
      this.armRig.palm('Right',target,pole,normal,forward)
      this.root.updateWorldMatrix(true,true)
    }
    const release=1-phase(t,2.22,2.65)
    this.grips.Left.apply(release)
    const close=phase(t,1.55,1.88)*release
    this.grips.Right.apply(close)
    if(close>0) for(const {digit,surface} of this.fingerSurfaces) {
      const contact=surface.sample()
      this.grips.Right.fitFinger(digit,contact.point.addScaledVector(contact.normal,.006),contact.normal,close)
    }
    // The guide hand peels away from the skull and lowers to the table.
    // The hat performs its own entrance; neither hand chases or carries it.
    const guideRest=phase(t,2.65,3.25)
    for(const {bone,rotation} of this.arms) if(bone.name.startsWith('Right')) bone.quaternion.slerp(rotation,guideRest)
    // Let individual fingers uncurl into the relaxed table pose after release.
    if(t>2.65) this.grips.Left.relax(0,phase(t,2.65,3.1))
    if(t>2.65) this.grips.Right.relax(0,phase(t,2.65,3.25))
    const settle=phase(t,5.4,ENTRANCE_END)
    for(const {bone,rotation} of this.arms) bone.quaternion.slerp(rotation,settle)
    this.root.updateWorldMatrix(true,true)
    return state
  }
  dispose() {for(const mesh of this.hats) mesh.geometry.dispose();for(const skeleton of this.skeletons) skeleton.dispose()}
}
