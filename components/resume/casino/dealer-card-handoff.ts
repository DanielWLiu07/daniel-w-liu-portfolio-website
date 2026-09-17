import { Matrix4, Object3D } from 'three'
import { DEALER_CARD_REVEAL_START, DEALER_CARD_UNFOLD } from './dealer-card-reveal'
import { dealerEntranceTime } from './dealer-entrance'
import type { DealerShuffleRig } from './dealer-shuffle'
import type { DealerChipRig } from './dealer-chip'

const clamp=(x:number)=>Math.max(0,Math.min(1,x))
const smooth=(x:number)=>{const t=clamp(x);return t*t*t*(t*(t*6-15)+10)}
// Start as the supporting hand releases the seated skull, while the hat lands.
export const DEALER_CARD_ACTION_START=dealerEntranceTime(2.18)
export const DEALER_CARD_APPEAR=DEALER_CARD_ACTION_START+DEALER_CARD_REVEAL_START
export const DEALER_CARD_CATCH=DEALER_CARD_APPEAR+DEALER_CARD_UNFOLD

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
  const weight=enabled?smooth(age/.18):0
  const joints:Object3D[]=[]
  rig.root.traverse(o=>{if(/^Left(Arm|ForeArm|Hand|Thumb\d|Index\d|Middle\d|Ring\d|Pinky\d)$/.test(o.name))joints.push(o)})
  const before=joints.map(o=>o.quaternion.clone())
  // Evaluate the receiving pose even before the gesture. Its targets then stay
  // deterministic during a scrub, without stealing the skull-supporting arm.
  // Preserve the shared exact snap boundary after subtracting the action start.
  // Floating-point cancellation can otherwise leave the held targets hidden
  // on the frame when the foreground cards first attach to them.
  const revealAge=impactAge>=DEALER_CARD_APPEAR?Math.max(DEALER_CARD_REVEAL_START,age):Math.max(0,age)
  rig.apply(seconds,1,revealAge,true)
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
