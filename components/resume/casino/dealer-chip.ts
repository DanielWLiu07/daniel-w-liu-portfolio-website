import { Bone, BoxGeometry, BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, Matrix4, Mesh, MeshStandardMaterial, Object3D, Quaternion, Vector3 } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { DealerArmRig } from './dealer-arms'
import { DealerHandGrip } from './dealer-grip'

export const DEALER_CHIP_RADIUS=.027
export const DEALER_CHIP_THICKNESS=.006
export const DEALER_CHIP_PAD=.006
const smooth=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*t*(t*(t*6-15)+10)}

/** A small thumb/index fidget, carried by the chest independently of the skull. */
export class DealerChipRig {
  readonly group=new Bone()
  private grip:DealerHandGrip
  private arms:DealerArmRig
  private anchor:Object3D
  private anchorPoint:Vector3
  private geometry:BufferGeometry
  private material:MeshStandardMaterial
  constructor(readonly root:Object3D) {
    this.grip=new DealerHandGrip(root,'Right')
    this.arms=new DealerArmRig(root,{Left:new DealerHandGrip(root,'Left'),Right:this.grip})
    this.anchor=root.getObjectByName('Spine')!
    this.anchorPoint=this.anchor.worldToLocal(root.localToWorld(new Vector3(-.25,1.20,.24)))
    this.group.name='DealerFidgetChip';this.group.userData.partGroup='DealerChip';root.add(this.group)
    const pieces:BufferGeometry[]=[]
    const paint=(geometry:BufferGeometry,color:number)=>{
      const rgb=new Color(color)
      geometry.setAttribute('color',new Float32BufferAttribute(Array.from({length:geometry.attributes.position.count},()=>rgb.toArray()).flat(),3))
      pieces.push(geometry)
    }
    paint(new CylinderGeometry(DEALER_CHIP_RADIUS,DEALER_CHIP_RADIUS,DEALER_CHIP_THICKNESS,48),0x215e88)
    for(const side of [-1,1]) {
      const center=new CylinderGeometry(.018,.018,.00025,40)
      center.translate(0,side*(DEALER_CHIP_THICKNESS/2+.00015),0);paint(center,0xeadaba)
      const medallion=new CylinderGeometry(.010,.010,.00025,32)
      medallion.translate(0,side*(DEALER_CHIP_THICKNESS/2+.0004),0);paint(medallion,0x215e88)
    }
    for(let i=0;i<8;i++) {
      const stripe=new BoxGeometry(.006,DEALER_CHIP_THICKNESS+.0001,.006)
      stripe.translate(0,0,DEALER_CHIP_RADIUS-.003);stripe.rotateY(i*Math.PI/4);paint(stripe,0xeadaba)
    }
    this.geometry=mergeGeometries(pieces)!;pieces.forEach(g=>g.dispose())
    this.material=new MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.64})
    this.material.name='Dealer blue clay chip'
    const mesh=new Mesh(this.geometry,this.material);mesh.name='DealerChip';mesh.castShadow=true;this.group.add(mesh)
    this.group.visible=false
  }
  reset() {this.group.visible=false}
  tip(digit:'Index'|'Thumb') {
    const end=this.root.getObjectByName(`Right${digit}3`)!,segment=this.root.getObjectByName(`Right${digit}2`)!
    return this.root.worldToLocal(end.localToWorld(new Vector3(0,segment.position.y,0)))
  }
  apply(seconds:number,amount=1) {
    const weight=smooth(amount),t=((seconds%30)+30)%30,phase=2*Math.PI*t/6
    this.group.visible=weight>.985
    if(weight===0) return
    const before=['Arm','ForeArm','Hand'].map(name=>this.root.getObjectByName('Right'+name)!.quaternion.clone())
    const target=this.root.worldToLocal(this.anchor.localToWorld(this.anchorPoint.clone()))
    target.add(new Vector3(.009*Math.sin(phase),.004*Math.sin(phase-.25),.006*Math.sin(phase-.5)))
    const normal=new Vector3(-.1+.10*Math.sin(phase-.3),-.94,.28).normalize()
    const forward=new Vector3(.12,.26,.96).normalize(),pole=new Vector3(-.27,1.055,.12)
    this.arms.palm('Right',target,pole,normal,forward)
    for(let i=0;i<4;i++) {
      const wrist=this.root.worldToLocal(this.grip.hand.getWorldPosition(new Vector3()))
      this.arms.arm('Right',wrist.add(target).sub(this.grip.point()),pole,normal,forward)
    }
    for(const [i,name] of ['Arm','ForeArm','Hand'].entries()) this.root.getObjectByName('Right'+name)!.quaternion.slerp(before[i],1-weight)
    this.grip.holdChip(t,weight)
    const frame=this.grip.frame(),axis=frame.normal.clone().cross(frame.forward).normalize()
    const chipNormal=frame.normal.clone().applyAxisAngle(axis,.28*Math.sin(phase-.3)).normalize()
    const center=this.tip('Index').addScaledVector(chipNormal,-DEALER_CHIP_THICKNESS/2-DEALER_CHIP_PAD)
    const thumbTarget=center.clone().addScaledVector(chipNormal,-DEALER_CHIP_THICKNESS/2-DEALER_CHIP_PAD)
    this.grip.pinchThumb(thumbTarget,weight)
    const front=axis.clone().cross(chipNormal).normalize(),right=chipNormal.clone().cross(front).normalize()
    this.group.position.copy(center)
    this.group.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(right,chipNormal,front))
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.32*Math.sin(phase-.55)))
    this.root.updateWorldMatrix(true,true)
  }
  dispose() {this.geometry.dispose();this.material.dispose()}
}
