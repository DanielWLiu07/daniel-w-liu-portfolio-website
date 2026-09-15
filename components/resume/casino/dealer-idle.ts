import { Bone, Object3D, Quaternion, Vector3 } from 'three'
import { DealerShuffleRig } from './dealer-shuffle'
import { DealerHandGrip } from './dealer-grip'
import { DealerChipRig } from './dealer-chip'
import { DEALER_PERFORMANCE_SECONDS, dealerPerformance } from '../face/performance'

export const BODY_LOOP_SECONDS=DEALER_PERFORMANCE_SECONDS

/** A slower body clock offsets its breathing and acting from the skull. */
function bodyCue(seconds:number) {
  const t=((seconds%BODY_LOOP_SECONDS)+BODY_LOOP_SECONDS)%BODY_LOOP_SECONDS
  return {...dealerPerformance((t+4.4)%BODY_LOOP_SECONDS),t,phase:2*Math.PI*t/3.75+.65}
}

/** Torso and shoulder acting keep their own tempo beneath cursor-led head motion. */
export function dealerBodyPose(seconds:number,acting=1) {
  const cue=bodyCue(seconds),longPhase=2*Math.PI*cue.t/BODY_LOOP_SECONDS
  const breathe=Math.sin(cue.phase-.24),shift=Math.sin(longPhase)+.25*Math.sin(longPhase*3)
  const curious=cue.curious*acting,surprise=cue.surprise*acting,laugh=cue.jawLaugh*acting,suspicious=cue.suspicious*acting
  const chuckle=laugh*Math.sin(cue.phase*3-.5),look=cue.look*acting
  const left=dealerArmPerformance(cue.t,'Left',acting),right=dealerArmPerformance(cue.t,'Right',acting)
  return {
    Spine02:[2.4*breathe,3.4*look+1.4*Math.sin(cue.phase/2),2.6*shift+1.6*Math.sin(cue.phase)],
    Spine01:[1.8*breathe+2.4*curious+1.6*chuckle,2.2*look,1.4*shift+1.3*Math.sin(cue.phase-.5)],
    Spine:[1.6*breathe-3.4*surprise+2.1*chuckle,2.8*look,1.1*Math.sin(cue.phase-.8)],
    LeftShoulder:[2*Math.sin(cue.phase-.4),2.2*breathe,3*curious+4*surprise+2*chuckle+2.2*Math.sin(cue.phase)],
    RightShoulder:[2*Math.sin(cue.phase-.8),-2*breathe,-3*suspicious-4*surprise-2*chuckle-2.2*Math.sin(cue.phase-.7)],
    LeftArm:left.upper,
    RightArm:right.upper,
    LeftForeArm:left.elbow,
    RightForeArm:right.elbow,
    LeftHand:left.wrist,
    RightHand:right.wrist,
  } satisfies Record<string,number[]>
}

const smooth=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*t*(t*(t*6-15)+10)}
const gestureBeat=(t:number,start:number,end:number)=>smooth((t-start)/1.15)*(1-smooth((t-end)/1.3))

/** One hand speaks at a time; broad gestures have anticipation and an unhurried return. */
export function dealerHandGesture(seconds:number,side:'Left'|'Right') {
  const t=((seconds%BODY_LOOP_SECONDS)+BODY_LOOP_SECONDS)%BODY_LOOP_SECONDS
  return side==='Left'?gestureBeat(t,.7,2.7)+gestureBeat(t,13.5,16):gestureBeat(t,7.2,9.4)+gestureBeat(t,24.7,27.3)
}

/** Overlapping joint motion: the elbow and wrist arrive after the upper arm. */
export function dealerArmPerformance(seconds:number,side:'Left'|'Right',acting=1) {
  const {t,phase}=bodyCue(seconds),sign=side==='Left'?1:-1
  const offset=side==='Left'?0:.28
  const upper=dealerHandGesture(t-.08,side)*acting
  const elbow=dealerHandGesture(t-.18,side)*acting
  const wrist=dealerHandGesture(t-.30,side)*acting
  return {
    upper:[-5-2.8*Math.sin(phase-.55-offset)-3*upper,sign*1.2*Math.sin(phase/2),sign*(1.5*Math.sin(phase-.55-offset)+2*upper)],
    elbow:[-9-4*Math.sin(phase-.8-offset)-5*elbow,0,sign*.8*Math.sin(phase/2-.25)],
    wrist:[2*Math.sin(phase-1.05-offset)+1.5*wrist,sign*1.2*Math.sin(phase/2-.4),sign*(2*wrist+Math.sin(phase-1.05-offset))],
    fingers:wrist,
  }
}

/** Only torso/arm joints are owned here. Head and jaw keep their own local animation. */
export class DealerBodyRig {
  readonly shuffle:DealerShuffleRig
  readonly chip:DealerChipRig
  private joints:{name:string;bone:Bone;home:Quaternion;axes:Vector3[]}[]=[]
  private grips:Record<'Left'|'Right',DealerHandGrip>
  private chest:Bone
  private chestScale:Vector3
  private body:Bone
  private bodyHome:Vector3
  constructor(readonly root:Object3D) {
    root.updateWorldMatrix(true,true)
    this.chest=root.getObjectByName('Spine02') as Bone
    this.chestScale=this.chest.scale.clone()
    this.body=root.getObjectByName('Root') as Bone
    this.bodyHome=this.body.position.clone()
    this.grips={Left:new DealerHandGrip(root,'Left'),Right:new DealerHandGrip(root,'Right')}
    for(const name of Object.keys(dealerBodyPose(0))) {
      const bone=root.getObjectByName(name) as Bone
      if(!bone?.isBone) throw new Error(`Body animation needs ${name}`)
      const inverse=bone.getWorldQuaternion(new Quaternion()).invert(),parent=root.getWorldQuaternion(new Quaternion())
      const axes=[new Vector3(1,0,0),new Vector3(0,1,0),new Vector3(0,0,1)].map(v=>v.applyQuaternion(parent).applyQuaternion(inverse))
      this.joints.push({name,bone,home:bone.quaternion.clone(),axes})
    }
    this.shuffle=new DealerShuffleRig(root)
    this.chip=new DealerChipRig(root)
  }
  reset() {this.chip.reset();this.shuffle.reset();this.body.position.copy(this.bodyHome);this.chest.scale.copy(this.chestScale);this.grips.Left.reset();this.grips.Right.reset();for(const {bone,home} of this.joints) bone.quaternion.copy(home);this.root.updateWorldMatrix(true,true)}
  apply(seconds:number,amount=1,speed=1,acting=1,interactionBlend=1,revealAge=Infinity) {
    const pose=dealerBodyPose(seconds*speed,acting) as Record<string,number[]>
    for(const {name,bone,home,axes} of this.joints) {
      bone.quaternion.copy(home)
      pose[name].forEach((angle,i)=>bone.quaternion.multiply(new Quaternion().setFromAxisAngle(axes[i],angle*amount*Math.PI/180)))
    }
    const cue=bodyCue(seconds*speed)
    // The torso breathes at a different tempo from the skull. Volume and
    // attachments are preserved while their independent rhythms overlap.
    const wave=Math.sin(cue.phase-.35)+.2*Math.sin(2*cue.phase-.7)
    const rise=.018*wave*amount
    const origin=this.body.parent!.worldToLocal(this.root.localToWorld(new Vector3()))
    const offset=this.body.parent!.worldToLocal(this.root.localToWorld(new Vector3(0,rise,0))).sub(origin)
    this.body.position.copy(this.bodyHome).add(offset)
    const stretch=.035*wave*amount
    this.chest.scale.copy(this.chestScale).multiply(new Vector3(Math.exp(-stretch/2),Math.exp(stretch),Math.exp(-stretch/2)))
    this.root.updateWorldMatrix(true,true)
    // The underlying relaxed pose eases into the card-holding arm targets.
    for(const side of ['Left','Right'] as const) {
      const gesture=dealerArmPerformance(seconds*speed,side,acting).fingers
      this.grips[side].relax(seconds*speed-.24,amount,gesture)
    }
    this.shuffle.apply(seconds*speed,amount>0?interactionBlend:0,revealAge)
    this.chip.pointAt(seconds*speed,amount>0?interactionBlend:0)
    this.root.updateWorldMatrix(true,true)
  }
  dispose() {this.shuffle.dispose();this.chip.dispose()}
}
