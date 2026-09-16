import { Matrix4, Object3D, Quaternion, Vector3 } from 'three'
import { DEALER_CARD_REVEAL_START, DEALER_CARD_UNFOLD } from './dealer-card-reveal'
import { dealerEntranceTime } from './dealer-entrance'
import type { DealerShuffleRig } from './dealer-shuffle'
import type { DealerChipRig } from './dealer-chip'

const clamp=(x:number)=>Math.max(0,Math.min(1,x))
const smooth=(x:number)=>{const t=clamp(x);return t*t*t*(t*(t*6-15)+10)}
// Start as the supporting hand releases the seated skull, while the hat lands.
export const DEALER_CARD_ACTION_START=dealerEntranceTime(2.18)
export const DEALER_CARD_DROP_DURATION=.8
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

/** Drop at the dealer's depth and card size, then attach to the moving grip. */
export function incomingCardMatrix(target:Matrix4,progress:number,index:number) {
  const p=clamp(progress)
  if(p===1)return target.clone()
  const position=new Vector3(),rotation=new Quaternion(),scale=new Vector3()
  target.decompose(position,rotation,scale)
  // Begin above the shot, already behind the table. Gravity accelerates the
  // descent; there is no camera-to-dealer travel or giant-to-small scaling.
  position.y+=scale.y*8*(1-p*p)
  const flutter=(index===0?-1:1)*.12*Math.sin(p*Math.PI*2+.6)*(1-p)
  rotation.multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),flutter))
  const matrix=new Matrix4().compose(position,rotation,scale)
  // The fingers absorb the final few frames and preserve the exact grip shear.
  const settle=smooth((p-.92)/.08)
  if(settle>0)for(let i=0;i<16;i++)matrix.elements[i]+=(target.elements[i]-matrix.elements[i])*settle
  return matrix
}
