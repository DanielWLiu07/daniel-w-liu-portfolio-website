import { Matrix4, Object3D, Quaternion, Vector3 } from 'three'
import { DEALER_CARD_REVEAL_START, DEALER_CARD_UNFOLD } from './dealer-card-reveal'
import { dealerEntranceTime } from './dealer-entrance'
import type { DealerShuffleRig } from './dealer-shuffle'
import type { DealerChipRig } from './dealer-chip'

const clamp=(x:number)=>Math.max(0,Math.min(1,x))
const smooth=(x:number)=>{const t=clamp(x);return t*t*t*(t*(t*6-15)+10)}
// Start as the supporting hand releases the seated skull, while the hat lands.
export const DEALER_CARD_ACTION_START=dealerEntranceTime(2.18)
export const DEALER_CARD_CATCH=DEALER_CARD_ACTION_START+DEALER_CARD_REVEAL_START+DEALER_CARD_UNFOLD

/** The free arm settles casually into its point, ready by the card hand's snap. */
export function applyDealerPointAction(rig:DealerChipRig,impactAge:number,seconds:number,enabled=true) {
  const age=impactAge-DEALER_CARD_ACTION_START
  const weight=enabled?smooth((age-.22)/.58):0
  if(weight===0)return
  const joints:Object3D[]=[]
  rig.root.traverse(o=>{if(/^Right(Arm|ForeArm|Hand|Thumb\d|Index\d|Middle\d|Ring\d|Pinky\d)$/.test(o.name))joints.push(o)})
  const before=joints.map(o=>o.quaternion.clone())
  rig.pointAt(seconds,1,age)
  joints.forEach((o,i)=>o.quaternion.slerp(before[i],1-weight))
  rig.root.updateWorldMatrix(true,true)
}

export function applyDealerCardAction(rig:DealerShuffleRig,impactAge:number,seconds:number,enabled=true) {
  const age=impactAge-DEALER_CARD_ACTION_START
  const weight=enabled?smooth(age/.27):0
  const joints:Object3D[]=[]
  rig.root.traverse(o=>{if(/^Left(Arm|ForeArm|Hand|Thumb\d|Index\d|Middle\d|Ring\d|Pinky\d)$/.test(o.name))joints.push(o)})
  const before=joints.map(o=>o.quaternion.clone())
  // Evaluate the receiving pose even before the gesture. Its targets then stay
  // deterministic during a scrub, without stealing the skull-supporting arm.
  rig.apply(seconds,1,Math.max(0,age),true)
  joints.forEach((o,i)=>{if(weight===0)o.quaternion.copy(before[i]);else o.quaternion.slerp(before[i],1-weight)})
  rig.group.visible=rig.group.visible&&weight>.9
  rig.root.updateWorldMatrix(true,true)
}

/** Per scene: the opening meshes remain the same objects all the way into the grip. */
export class DealerCardHandoff {
  targets:Object3D[]|null=null
  available=false
  enabled=true
  get active(){return this.enabled&&this.available&&this.targets!==null}
  setTargets(targets:Object3D[]){this.targets=targets;return ()=>{if(this.targets===targets)this.targets=null}}
  setAvailable(available:boolean){this.available=available}
  setEnabled(enabled:boolean){this.enabled=enabled}
}

// Source stock is XY, face +Z. Held stock is XZ, face +Y, top +Z.
export const FLIGHT_CARD_TO_GRIP=new Matrix4().makeRotationX(-Math.PI/2)
  .multiply(new Matrix4().makeRotationZ(Math.PI))
  .multiply(new Matrix4().makeScale(.090/(2/3),.130,.00054/(.177/52)))

/** Absolute-time trajectory. No captured previous frame, so reverse scrubs agree. */
export function incomingCardMatrix(source:Matrix4,target:Matrix4,progress:number,index:number,up:Vector3,right:Vector3) {
  const p=clamp(progress)
  if(p===0)return source.clone()
  if(p===1)return target.clone()
  const a=new Vector3(),b=new Vector3(),qa=new Quaternion(),qb=new Quaternion(),sa=new Vector3(),sb=new Vector3()
  source.decompose(a,qa,sa);target.decompose(b,qb,sb)
  const turn=smooth(p/.84)
  const height=Math.max(sa.y*.65,sb.y*3)
  const top=new Vector3(0,1,0).applyQuaternion(qb)
  // A short release lift, then a gravity-shaped descent. The final control
  // point sits above the actual pinch, so the paper enters along its plane.
  const c1=a.clone().addScaledVector(up,height*.18)
    .addScaledVector(right,(index===0?-1:1)*height*.12)
  const c2=b.clone().addScaledVector(top,sb.y*1.15)
  const u=p*p*(2-p),v=1-u
  const position=a.clone().multiplyScalar(v*v*v).addScaledVector(c1,3*v*v*u)
    .addScaledVector(c2,3*v*u*u).addScaledVector(b,u*u*u)
  const flutter=.16*Math.sin(p*Math.PI*3+index*.8)*Math.sin(Math.PI*p)*(1-turn)
  const rotation=qa.slerp(qb,turn).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),flutter))
  const matrix=new Matrix4().compose(position,rotation,sa.lerp(sb,smooth(p/.84)))
  // Absorb the last few frames at the pinch, not a long hovering approach.
  // Preserve the exact torso/grip shear at contact and during the catch recoil.
  const settle=smooth((p-.92)/.08)
  if(settle>0)for(let i=0;i<16;i++)matrix.elements[i]+=(target.elements[i]-matrix.elements[i])*settle
  return matrix
}
