import { Bone, Object3D, Quaternion, Vector3 } from 'three'
import type { DealerHandGrip } from './dealer-grip'

/** Fixed-length arms with explicit elbow poles and palm contact targets. */
export class DealerArmRig {
  private bones = new Map<string, Bone>()
  constructor(readonly root:Object3D,readonly grips?:Record<'Left'|'Right',DealerHandGrip>) {}
  private bone(name:string) {
    let bone = this.bones.get(name)
    if (!bone) { bone = this.root.getObjectByName(name) as Bone; this.bones.set(name, bone) }
    return bone
  }
  private local(object:Object3D) {return this.root.worldToLocal(object.getWorldPosition(new Vector3()))}
  private world(point:Vector3) {return this.root.localToWorld(point.clone())}
  private aim(joint:Bone,child:Bone,target:Vector3) {
    // Solve in the parent frame: world quaternion decomposition contains shear
    // when the chest stretches and otherwise introduces wrist drift.
    const parent=joint.parent!
    const origin=joint.position
    const from=parent.worldToLocal(child.getWorldPosition(new Vector3())).sub(origin).normalize()
    const to=parent.worldToLocal(this.world(target)).sub(origin).normalize()
    joint.quaternion.premultiply(new Quaternion().setFromUnitVectors(from,to)).normalize()
    // Private hat/head bindings and surface contacts depend on this ordering.
    this.root.updateWorldMatrix(true,true)
  }
  arm(side:string,target:Vector3,pole:Vector3,palmNormal?:Vector3,fingerDirection=new Vector3(0,.012,.16)) {
    const upper=this.bone(side+'Arm'), fore=this.bone(side+'ForeArm')
    const hand=this.bone(side+'Hand')
    const shoulder=this.local(upper), elbow=this.local(fore), wrist=this.local(hand)
    const a=shoulder.distanceTo(elbow),b=elbow.distanceTo(wrist)
    const axis=target.clone().sub(shoulder),distance=Math.max(Math.abs(a-b)+.0001,Math.min(axis.length(),a+b-.0001))
    axis.normalize();target=shoulder.clone().addScaledVector(axis,distance)
    const along=(a*a-b*b+distance*distance)/(2*distance)
    const bend=pole.clone().sub(shoulder);bend.addScaledVector(axis,-bend.dot(axis)).normalize()
    const solved=shoulder.clone().addScaledVector(axis,along).addScaledVector(bend,Math.sqrt(Math.max(0,a*a-along*along)))
    this.aim(upper,fore,solved);this.aim(fore,hand,target)
    const handForward=()=>(side==='Left'?['Index1','Middle1','Ring1','Pinky1'].map(name=>this.bone(side+name).getWorldPosition(new Vector3())).reduce((sum,p)=>sum.add(p),new Vector3()).multiplyScalar(.25):this.bone(side+'Middle1').getWorldPosition(new Vector3())).sub(hand.getWorldPosition(new Vector3()))
    const parent=hand.parent!,origin=hand.getWorldPosition(new Vector3())
    const from=parent.worldToLocal(origin.clone().add(handForward())).sub(hand.position).normalize()
    const to=parent.worldToLocal(this.world(target.clone().add(fingerDirection))).sub(parent.worldToLocal(this.world(target))).normalize()
    hand.quaternion.premultiply(new Quaternion().setFromUnitVectors(from,to)).normalize()
    hand.updateWorldMatrix(true,true)
    if(palmNormal) {
      const forward=handForward().normalize()
      const index=this.bone(side+'Index1').getWorldPosition(new Vector3())
      const pinky=this.bone(side+'Pinky1').getWorldPosition(new Vector3())
      // This is the anatomical palm side: reversing the handedness here
      // turns both thumbs outward and presents the back of the hand to a grip.
      const normal=index.sub(pinky).cross(forward).normalize().multiplyScalar(side==='Left'?-1:1)
      const up=palmNormal.clone().applyQuaternion(this.root.getWorldQuaternion(new Quaternion()))
      up.addScaledVector(forward,-up.dot(forward)).normalize()
      const world=hand.getWorldQuaternion(new Quaternion()).premultiply(new Quaternion().setFromUnitVectors(normal,up))
      hand.quaternion.copy(hand.parent!.getWorldQuaternion(new Quaternion()).normalize().invert().multiply(world)).normalize()
      this.root.updateWorldMatrix(true,true)
    }
  }
  palm(side:'Left'|'Right',target:Vector3,pole:Vector3,normal:Vector3,forward:Vector3) {
    this.arm(side,target,pole,normal,forward)
    const grip=this.grips![side]
    const wrist=this.local(grip.hand)
    // Wrist placement compensates for the palm offset after hand rotation.
    this.arm(side,target.clone().add(wrist).sub(grip.point()),pole,normal,forward)
  }
}
