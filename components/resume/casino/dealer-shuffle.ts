import { Bone, BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, Mesh, MeshStandardMaterial, Matrix4, Object3D, Quaternion, Vector3 } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { DealerArmRig } from './dealer-arms'
import { DealerHandGrip } from './dealer-grip'
import { DEALER_CARD_SNAP, dealerCardReveal } from './dealer-card-reveal'

const clamp=(x:number)=>Math.max(0,Math.min(1,x))
const smooth=(x:number)=>{const t=clamp(x);return t*t*t*(t*(t*6-15)+10)}
export const DEALER_SHUFFLE_SECONDS=10
export const DEALER_CARD_COUNT=2
export const DEALER_CARD_THICKNESS=.00054
// The thumb mesh is wider than its tip joint; clearance includes its full pad.
export const DEALER_CARD_PAD=.017
const WIDTH=.090,LENGTH=.130,H=DEALER_CARD_THICKNESS
/** A poker player quietly studies a two-card hand, held up near the face.
 * Grip study: https://images.unsplash.com/photo-1617286931389-9082553de6be — thumb along the
 * lower overlap, bent index behind it, spare fingers progressively curled.
 */
export function dealerShufflePose(seconds:number) {
  const t=((seconds%DEALER_SHUFFLE_SECONDS)+DEALER_SHUFFLE_SECONDS)%DEALER_SHUFFLE_SECONDS
  const settle=Math.sin(2*Math.PI*t/10)
  const leftPalm=new Vector3(.20,.105+.006*settle,-.045+.004*Math.sin(2*Math.PI*t/5))
  return {t,leftPalm}
}

/** Two cards stay pinched in the raised hand; a relaxed base pose feeds the free-arm gesture. */
export class DealerShuffleRig {
  readonly group=new Bone()
  readonly cards:Bone[]=[]
  private grips:Record<'Left'|'Right',DealerHandGrip>
  private arms:DealerArmRig
  private handHomes:Record<'Left'|'Right',Quaternion>
  private cardArmHomes:{bone:Object3D;rotation:Quaternion}[]
  private anchor:Object3D
  private anchorPoint:Vector3
  private geometries:BufferGeometry[]=[]
  private materials:MeshStandardMaterial[]=[]
  constructor(readonly root:Object3D) {
    this.group.name='DealerDeckFrame';this.group.userData.partGroup='DealerCards';root.add(this.group)
    this.grips={Left:new DealerHandGrip(root,'Left'),Right:new DealerHandGrip(root,'Right')}
    this.arms=new DealerArmRig(root,this.grips)
    this.handHomes={Left:this.grips.Left.hand.quaternion.clone(),Right:this.grips.Right.hand.quaternion.clone()}
    this.cardArmHomes=['LeftArm','LeftForeArm','LeftHand'].map(name=>{const bone=root.getObjectByName(name)!;return {bone,rotation:bone.quaternion.clone()}})
    this.anchor=root.getObjectByName('Spine')!
    this.anchorPoint=this.anchor.worldToLocal(root.localToWorld(new Vector3(.025,1.27,.32)))
    const material=new MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.8})
    material.name='Dealer printed card';this.materials.push(material)
    const pieces:BufferGeometry[]=[]
    const part=(x:number,y:number,z:number,color:number,height=0,turn=0)=>{
      const geometry=new BoxGeometry(x,y,z,8,1,1)
      geometry.rotateY(turn);geometry.translate(0,-height,0)
      const rgb=new Color(color),count=geometry.attributes.position.count
      geometry.setAttribute('color',new Float32BufferAttribute(Array.from({length:count},()=>rgb.toArray()).flat(),3))
      pieces.push(geometry)
    }
    part(WIDTH,H,LENGTH,0xf2e4c9)
    part(WIDTH-.004,.00006,LENGTH-.004,0x982634,H/2+.000035)
    part(WIDTH-.012,.00006,LENGTH-.012,0xf2e4c9,H/2+.00010)
    part(WIDTH-.014,.00006,LENGTH-.014,0x982634,H/2+.000165)
    part(.013,.00006,.013,0xf2e4c9,H/2+.00023,Math.PI/4)
    const geometry=mergeGeometries(pieces)!
    pieces.forEach(g=>g.dispose())
    const positions=geometry.attributes.position
    for(let i=0;i<positions.count;i++) positions.setY(i,positions.getY(i)+.0003*(1-(positions.getX(i)/(WIDTH/2))**2))
    geometry.computeVertexNormals();this.geometries.push(geometry)
    for(let i=0;i<DEALER_CARD_COUNT;i++) {
      const card=new Bone();card.name=`DealerHeldCard${i}`;this.group.add(card);this.cards.push(card)
      const mesh=new Mesh(geometry,material);mesh.name=`DealerCards_${i}`;mesh.castShadow=true;card.add(mesh)
      card.position.y=i*H
    }
    this.group.position.set(.025,1.27,.32);this.group.visible=false
    root.updateWorldMatrix(true,true)
  }
  reset() {this.group.visible=false;this.grips.Left.reset();this.grips.Right.reset()}
  private local(point:Vector3) {return this.root.worldToLocal(this.group.localToWorld(point.clone()))}
  private direction(vector:Vector3) {return vector.applyQuaternion(this.root.getWorldQuaternion(new Quaternion()).invert().multiply(this.group.getWorldQuaternion(new Quaternion()))).normalize()}
  private shareForearmTwist(side:'Left'|'Right') {
    const hand=this.grips[side].hand,fore=this.root.getObjectByName(side+'ForeArm') as Bone
    const axis=hand.position.clone().normalize(),delta=hand.quaternion.clone().multiply(this.handHomes[side].clone().invert())
    if(delta.w<0) {delta.x*=-1;delta.y*=-1;delta.z*=-1;delta.w*=-1}
    const projection=new Vector3(delta.x,delta.y,delta.z).dot(axis)
    const angle=2*Math.atan2(projection,delta.w)*.8
    const turn=new Quaternion().setFromAxisAngle(axis,angle)
    fore.quaternion.multiply(turn);hand.quaternion.premultiply(turn.clone().invert())
    this.root.updateWorldMatrix(true,true)
  }
  apply(seconds:number,amount=1,revealAge=Infinity,cardsOnly=false) {
    if(cardsOnly){for(const {bone,rotation} of this.cardArmHomes)bone.quaternion.copy(rotation);this.grips.Left.reset();this.root.updateWorldMatrix(true,true)}
    const weight=smooth(Math.min(1,amount)),pose=dealerShufflePose(seconds),reveal=dealerCardReveal(revealAge)
    // Finish raising the poker hand before revealing the cards; partial arm blends
    // must not leave visible cards hovering away from the palms.
    this.group.visible=weight>.90&&reveal.visible
    const carried=this.root.worldToLocal(this.anchor.localToWorld(this.anchorPoint.clone()))
    this.group.position.copy(carried);this.group.position.y-=.27*(1-weight)
    this.group.quaternion.setFromAxisAngle(new Vector3(1,0,0),.22).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),-.12))
    this.root.updateWorldMatrix(true,true)
    for(const [side,sign] of [['Left',1],['Right',-1]] as const) {
      if(cardsOnly&&side==='Right')continue
      const grip=this.grips[side]
      const before=['Arm','ForeArm','Hand'].map(name=>this.root.getObjectByName(side+name)!.quaternion.clone())
      const palm=pose.leftPalm.clone();palm.y+=reveal.lift
      const normal=side==='Left'?this.direction(new Vector3(-.3,.2,-1).applyAxisAngle(new Vector3(1,0,0),reveal.wrist)):new Vector3(0,-1,0)
      const forward=side==='Left'?this.direction(new Vector3(-.18,1,.2).applyAxisAngle(new Vector3(1,0,0),reveal.wrist)):new Vector3(.12,-.05,1)
      const target=side==='Left'?this.local(palm):new Vector3(-.29+.005*Math.sin(2*Math.PI*pose.t/10),1.225,.405),pole=side==='Left'?new Vector3(.28,1.04,.13):new Vector3(sign*.38,1.12,.16)
      this.arms.palm(side,target,pole,normal,forward)
      // Refine pad placement after orienting the hand under the chest's
      // nonuniform cartoon scale.
      for(let i=0;i<4;i++) {
        const wrist=this.root.worldToLocal(grip.hand.getWorldPosition(new Vector3()))
        if(side==='Left') {
          // Let the raised hand follow the forearm during stronger body acting.
          // Keeping a fixed world-facing palm would fold the wrist as the elbow moves.
          const elbow=this.root.worldToLocal(this.root.getObjectByName('LeftForeArm')!.getWorldPosition(new Vector3()))
          const forearm=wrist.clone().sub(elbow).normalize(),angle=forward.angleTo(forearm)
          const comfort=18*Math.PI/180
          if(angle>comfort)forward.lerp(forearm,(1-comfort/angle)*smooth((angle-comfort)/(14*Math.PI/180))).normalize()
        }
        this.arms.arm(side,wrist.add(target).sub(grip.point()),pole,normal,forward)
      }
      this.shareForearmTwist(side)
      for(const [i,name] of ['Arm','ForeArm','Hand'].entries()) this.root.getObjectByName(side+name)!.quaternion.slerp(before[i],1-weight)
      grip.holdCards(pose.t,weight)
      if(side==='Right') continue
      const handFrame=grip.frame()
      const up=handFrame.normal.clone(),front=handFrame.forward.clone()
      const right=up.clone().cross(front).normalize()
      const index=this.root.getObjectByName('LeftIndex2')!
      const cardFront=this.root.worldToLocal(index.localToWorld(new Vector3(0,.02,0))).sub(this.root.worldToLocal(index.getWorldPosition(new Vector3()))).normalize()
      const cardRight=up.clone().cross(cardFront).normalize(),cardUp=cardFront.clone().cross(cardRight).normalize()
      // Pinch against the middle index pad; its relaxed distal segment braces
      // the back of the cards instead of curling into a fingertip hook.
      const indexPad=this.root.worldToLocal(index.localToWorld(new Vector3(0,.012,0))).addScaledVector(cardUp,.013)
      const thumbDirection=cardFront.clone().multiplyScalar(.55).addScaledVector(cardRight,-.83).addScaledVector(cardUp,-.10).normalize()
      const pinch=indexPad.addScaledVector(cardRight,.012).addScaledVector(cardFront,-.008).addScaledVector(cardUp,DEALER_CARD_PAD+.001)
      grip.pinchThumb(pinch,weight,cardUp,thumbDirection,true)
      if(reveal.prepare>0) grip.snapFingers(reveal.prepare,reveal.release,weight)
      const orientation=new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(cardRight,cardUp,cardFront))
        .multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),reveal.turn))
      const cardNormal=new Vector3(0,1,0).applyQuaternion(orientation)
      // Meet the middle finger's skin, then open a small clearance arc before
      // the thumb returns to the card pinch. Bone-to-bone contact clips the pads.
      const thumbClearance=Math.sin(Math.PI*smooth((revealAge-DEALER_CARD_SNAP+.24)/.24))
      const snapPad=.025+.004*smooth((revealAge-DEALER_CARD_SNAP+.39)/.08)
      const snapContact=grip.tip('Middle').addScaledVector(up,-snapPad-.020*thumbClearance).addScaledVector(right,.025*thumbClearance)
      const thumbBones=[1,2,3].map(j=>this.root.getObjectByName('LeftThumb'+j)!)
      grip.pinchThumb(pinch,weight,cardUp,thumbDirection,true)
      const heldThumb=thumbBones.map(b=>b.quaternion.clone())
      const loaded=reveal.release>0?reveal.prepare*reveal.prepare:reveal.prepare
      if(loaded>0) {
        grip.pinchThumb(snapContact,Math.max(weight,reveal.prepare),up,undefined,true)
        thumbBones.forEach((b,j)=>b.quaternion.slerp(heldThumb[j],1-loaded))
        this.root.updateWorldMatrix(true,true)
      }
      const groupRotation=this.root.getWorldQuaternion(new Quaternion()).invert().multiply(this.group.getWorldQuaternion(new Quaternion()))
      // The snap produces both cards at the pinch; the fan opens around that contact.
      for(const i of [0,1]) {
        const fan=(i===0?-.13:.13)*reveal.fan
        const rotation=orientation.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),fan))
        const center=pinch.clone().addScaledVector(cardNormal,-DEALER_CARD_PAD-.001+i*.0012)
          .add(new Vector3(.016*reveal.width,0,reveal.slide).applyQuaternion(rotation))
        this.cards[i].scale.set(reveal.width,1,1)
        this.cards[i].position.copy(this.group.worldToLocal(this.root.localToWorld(center)))
        this.cards[i].quaternion.copy(groupRotation.clone().invert().multiply(rotation))
      }
      this.root.updateWorldMatrix(true,true)

    }
    this.root.updateWorldMatrix(true,true)
  }
  dispose() {this.geometries.forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose())}
}
