import { Bone, Mesh, Object3D, Quaternion, Vector3 } from 'three'
import { prepareDealerNeck } from '../casino/dealer-neck'
import type { FaceSettings } from './face-settings'
import { DEALER_PERFORMANCE_SECONDS, dealerPerformance } from './performance'

const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x))
const smooth = (x: number) => { const t = clamp(x); return t*t*(3-2*t) }
const blink = (t: number, at: number) => t < at ? 0 : t < at+.07 ? smooth((t-at)/.07) : 1-smooth((t-at-.07)/.16)
export const FACE_LOOP_SECONDS = DEALER_PERFORMANCE_SECONDS
export interface FacePose {
  head: [number, number, number]
  lift: number
  jaw: [number, number]
  scale: [number, number, number]
  expressions: Record<string, number>
}

/** A continuously elastic performance, with readable reactions over its bouncing rhythm. */
export function facePose(settings: FaceSettings, seconds: number): FacePose {
  const {t,phase,curious,surprise,laugh,suspicious,look,jawSurprise,jawLaugh}=dealerPerformance(seconds*settings.speed)
  const amount = settings.idle ? settings.amount : 0
  const wave=Math.sin(phase)+.22*Math.sin(phase*2)
  const trailing=Math.sin(phase-.24)+.22*Math.sin(phase*2-.48)
  const act=amount*settings.acting, elastic=amount*settings.elasticity
  const close=Math.max(blink(t,2.75),blink(t,4.35),blink(t,7.15),.8*blink(t,7.46),blink(t,11.2),blink(t,13.2),blink(t,16.8),blink(t,21.3),blink(t,24.3),blink(t,28.4),blink(t,29.5))*Math.min(1,amount*1.5)
  const wink=Math.max(blink(t,10.25),blink(t,22.1),blink(t,28.8))*Math.min(1,act)
  // Stretch while travelling up, squash as the head sinks; a second harmonic
  // breaks up a metronomic bounce. Reactions add their own silhouette accents.
  const stretch=clamp(settings.squash+elastic*(wave*.57+Math.sin(phase*2)*.12)+act*(surprise*.3-laugh*.15)-close*.08,-1,1)
  // Shape changes preserve volume; uniform skull size is deliberately independent.
  const widthShape=clamp(settings.skullWidth+elastic*Math.sin(phase-.4)*.32+act*(laugh*.2-surprise*.16),-1,1)
  const height = Math.exp(stretch*.095), width = Math.exp(widthShape*.09)
  const cross = 1/Math.sqrt(height)
  const smile=clamp(settings.smile+act*(laugh*.48+curious*.12-suspicious*.26),-1,1)
  const expressions: Record<string, number> = { jawOpen: 0,
    smile: Math.max(0,smile), frown: Math.max(0,-smile) }
  for (const side of ['Left','Right'] as const) {
    const left=side==='Left'
    const closed = Math.max(settings[`blink${side}`],close,left ? wink : 0)
    const socket = clamp(settings[`socket${side}`]+act*(surprise*.68-laugh*.48-suspicious*.32+curious*(left ? .22 : -.28)+Math.sin(phase+(left ? 0 : .3))*.12),-1,1)
    const brow = clamp(settings[`brow${side}`]+act*(surprise*.6-suspicious*.48+curious*(left ? .55 : -.25)+Math.sin(phase-.2)*.1),-1,1)
    const tilt = clamp(settings[`tilt${side}`]+act*(suspicious*.4-curious*(left ? .2 : 0)),-1,1)*(1-closed*.7)
    expressions[`blink${side}`]=closed
    expressions[`squint${side}`]=Math.max(0,-socket)*(1-closed)
    expressions[`socketWide${side}`]=Math.max(0,socket)*(1-closed)
    expressions[`browRaise${side}`]=Math.max(0,brow)
    expressions[`browDown${side}`]=Math.max(0,-brow)
    expressions[`socketTiltIn${side}`]=Math.max(0,tilt)
    expressions[`socketTiltOut${side}`]=Math.max(0,-tilt)
  }
  return {
    head: [clamp(settings.headPitch+amount*trailing*4-act*surprise*7,-25,25),
      clamp(settings.headYaw+act*look*13+amount*Math.sin(2*Math.PI*t/FACE_LOOP_SECONDS)*3,-42,42),
      clamp(settings.headRoll+amount*Math.sin(phase-.16)*4+act*(curious*5-suspicious*4),-28,28)],
    lift: amount*settings.bounce*wave*.028,
    jaw: [clamp(settings.jawOpen+amount*(trailing+1.15)*.065+act*(jawSurprise*.52+jawLaugh*(.27+.15*Math.sin(phase*3-.5)))),
      clamp(settings.jawSide+act*jawLaugh*Math.sin(phase*3)*.3,-1,1)],
    scale: [settings.skullSize*cross*width, settings.skullSize*height, settings.skullSize*cross/width],
    expressions,
  }
}

/** Jaw has one hinge authority. Socket shapes and the complete head travel with it. */
export class DealerFaceRig {
  private head: Bone
  private jaw: Bone
  private neck: Bone
  private headRest: Quaternion
  private jawRest: Quaternion
  private headScale: Vector3
  private jawScale: Vector3
  private neckScale: Vector3
  private headAxes: Vector3[]
  private jawAxes: Vector3[]
  private meshes: Mesh[] = []

  constructor(readonly root: Object3D) {
    prepareDealerNeck(root)
    this.head = root.getObjectByName('Head') as Bone
    this.jaw = root.getObjectByName('JawHinge') as Bone
    this.neck = root.getObjectByName('neck') as Bone
    if (!this.head?.isBone || !this.jaw?.isBone || !this.neck?.isBone) throw new Error('Face module needs Head, JawHinge and neck bones.')
    root.updateMatrixWorld(true)
    this.headRest=this.head.quaternion.clone().normalize(); this.jawRest=this.jaw.quaternion.clone().normalize()
    this.headScale=this.head.scale.clone(); this.jawScale=this.jaw.scale.clone()
    this.neckScale=this.neck.scale.clone()
    const axes = (bone: Bone) => {
      const inverse=bone.getWorldQuaternion(new Quaternion()).invert()
      // Cancel the model parent's placement: these axes belong to the character.
      const parent=root.getWorldQuaternion(new Quaternion())
      return [new Vector3(1,0,0),new Vector3(0,1,0),new Vector3(0,0,1)].map(axis => axis.applyQuaternion(parent).applyQuaternion(inverse))
    }
    this.headAxes=axes(this.head); this.jawAxes=axes(this.jaw)
    root.traverse(object => { const mesh=object as Mesh; if (mesh.isMesh && mesh.morphTargetInfluences) this.meshes.push(mesh) })
  }

  apply(pose: FacePose, delta = Infinity) {
    // Intro/world-space posing can inherit shear from a stretched parent.
    // Slerp requires unit quaternions to keep cursor turns responsive.
    this.head.quaternion.normalize();this.jaw.quaternion.normalize()
    const oldHead=this.head.quaternion.clone(), oldJaw=this.jaw.quaternion.clone(), oldScale=this.head.scale.clone(), oldNeck=this.neck.scale.clone()
    let changed=false
    const alpha=delta===Infinity ? 1 : 1-Math.exp(-Math.min(delta,.1)/.075)
    const rad=Math.PI/180
    const head=this.headRest.clone()
    for (let i=0;i<3;i++) head.multiply(new Quaternion().setFromAxisAngle(this.headAxes[i],pose.head[i]*rad))
    this.head.quaternion.slerp(head,alpha)
    const jaw=this.jawRest.clone()
      .multiply(new Quaternion().setFromAxisAngle(this.jawAxes[0],pose.jaw[0]*23*rad))
      .multiply(new Quaternion().setFromAxisAngle(this.jawAxes[1],pose.jaw[1]*5*rad))
    this.jaw.quaternion.slerp(jaw,alpha)
    // Extend the cervical chain to lift the complete head without disconnecting
    // it from the collar. Counter-scale the head so its volume stays independent.
    const neckStretch=clamp(1+pose.lift/Math.max(.025,Math.abs(this.head.position.y)),.35,2.0)
    this.neck.scale.lerp(this.neckScale.clone().multiply(new Vector3(1,neckStretch,1)),alpha)
    const actualStretch=this.neck.scale.y/this.neckScale.y
    const previousStretch=oldNeck.y/this.neckScale.y
    const previousShape=oldScale.clone().divide(this.headScale).multiply(new Vector3(1,previousStretch,1))
    // Interpolate logarithms so volume compensation survives smoothing too.
    const shape=pose.scale.map((value,i) => Math.exp(Math.log(previousShape.getComponent(i))*(1-alpha)+Math.log(value)*alpha))
    this.head.scale.set(shape[0],shape[1]/actualStretch,shape[2]).multiply(this.headScale)
    for (const mesh of this.meshes) for (const [name,i] of Object.entries(mesh.morphTargetDictionary!)) {
      const old=mesh.morphTargetInfluences![i]
      // Never combine the old jaw morph and the hinge: that doubles opening.
      if (name==='jawOpen') mesh.morphTargetInfluences![i]=0
      else mesh.morphTargetInfluences![i] += ((pose.expressions[name] ?? 0)-mesh.morphTargetInfluences![i])*(name.startsWith('blink') ? 1 : alpha)
      changed ||= Math.abs(old-mesh.morphTargetInfluences![i]) > 1e-6
    }
    this.root.updateMatrixWorld(true)
    return changed || 1-Math.abs(oldHead.dot(this.head.quaternion)) > 1e-10 || 1-Math.abs(oldJaw.dot(this.jaw.quaternion)) > 1e-10 || oldScale.distanceToSquared(this.head.scale) > 1e-10 || oldNeck.distanceToSquared(this.neck.scale) > 1e-10
  }

  neutralize(root = this.root) {
    const head=root.getObjectByName('Head')!, jaw=root.getObjectByName('JawHinge')!
    head.quaternion.copy(this.headRest); head.scale.copy(this.headScale)
    jaw.quaternion.copy(this.jawRest); jaw.scale.copy(this.jawScale)
    root.getObjectByName('neck')!.scale.copy(this.neckScale)
    root.traverse(object => { const mesh=object as Mesh; mesh.morphTargetInfluences?.fill(0) })
    root.updateMatrixWorld(true)
  }
}
