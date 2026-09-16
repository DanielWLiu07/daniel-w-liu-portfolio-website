import { Bone, Matrix4, Object3D, Quaternion, SkinnedMesh, Triangle, Vector3 } from 'three'
import { dealerPart } from './dealer-pose'

const fingerBeat=(t:number,start:number,duration:number)=>{const p=(t-start)/duration;return p>0&&p<1?Math.sin(Math.PI*p)**2:0}

/** A point on the actual deformed surface, rather than a guessed wrist position. */
export class DealerSurfaceContact {
  private mesh!:SkinnedMesh
  private indices:number[]=[]
  private weights=new Vector3()
  private normalSign=1
  constructor(private root:Object3D,part:string,target:Vector3,outward:Vector3) {
    let distance=Infinity
    root.updateWorldMatrix(true,true)
    const rootInverse = new Matrix4().copy(root.matrixWorld).invert()
    root.traverse(object=>{
      const mesh=object as SkinnedMesh
      if(!mesh.isSkinnedMesh || dealerPart(mesh)!==part) return
      mesh.skeleton.update()
      const position=mesh.geometry.attributes.position,index=mesh.geometry.index
      const count=index?.count??position.count,triangle=new Triangle(),closest=new Vector3()
      // Skin each unique vertex once. Indexed triangles share vertices, and
      // worldToLocal used to update/invert the same root for every triangle corner.
      const vertices = Array.from({length: position.count}, (_, i) =>
        mesh.getVertexPosition(i,new Vector3()).applyMatrix4(mesh.matrixWorld).applyMatrix4(rootInverse))
      const vertex=(i:number)=>vertices[i]
      for(let i=0;i<count;i+=3) {
        const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j)
        triangle.set(vertex(ids[0]),vertex(ids[1]),vertex(ids[2]))
        triangle.closestPointToPoint(target,closest)
        const d=closest.distanceToSquared(target)
        if(d<distance) {
          distance=d;this.mesh=mesh;this.indices=ids;triangle.getBarycoord(closest,this.weights)
          this.normalSign=triangle.getNormal(new Vector3()).dot(outward)<0?-1:1
        }
      }
    })
    if(!this.mesh) throw new Error(`Dealer grip cannot find ${part}`)
  }
  sample() {
    this.mesh.skeleton.update()
    const points=this.indices.map(i=>this.root.worldToLocal(this.mesh.getVertexPosition(i,new Vector3()).applyMatrix4(this.mesh.matrixWorld)))
    const triangle=new Triangle(...points as [Vector3,Vector3,Vector3])
    // Preserve the chosen material side through head turns. Comparing against
    // a fixed world direction each frame can abruptly flip a curved contact.
    const normal=triangle.getNormal(new Vector3()).multiplyScalar(this.normalSign)
    const point=new Vector3()
    points.forEach((p,i)=>point.addScaledVector(p,this.weights.getComponent(i)))
    return {point,normal}
  }
}

/** Palm pad and independent finger hinges, kept private to the scene clone. */
export class DealerHandGrip {
  readonly hand:Bone
  readonly palm:Vector3
  private fingers:{bone:Bone;home:Quaternion;axis:Vector3;fanAxis:Vector3;angle:number;cardFan:number}[]=[]
  constructor(private root:Object3D,private side:'Left'|'Right') {
    const bone=(name:string)=>root.getObjectByName(side+name) as Bone
    const position=(node:Object3D)=>node.getWorldPosition(new Vector3())
    this.hand=bone('Hand')
    const wrist=position(this.hand),index=position(bone('Index1')),pinky=position(bone('Pinky1'))
    const knuckles=side==='Left'?['Index1','Middle1','Ring1','Pinky1'].map(name=>position(bone(name))).reduce((sum,p)=>sum.add(p),new Vector3()).multiplyScalar(.25):index.clone().add(pinky).add(position(bone('Middle1'))).divideScalar(3)
    const forward=(side==='Left'?knuckles.clone():position(bone('Middle3'))).sub(wrist).normalize()
    const normal=index.clone().sub(pinky).cross(forward).normalize().multiplyScalar(side==='Left'?-1:1)
    // The palm pad lies halfway from the wrist to the knuckles, just above the bones.
    this.palm=this.hand.worldToLocal(wrist.clone().lerp(knuckles,.55).addScaledVector(normal,.008))
    for(const digit of ['Thumb','Index','Middle','Ring','Pinky']) for(let joint=1;joint<=3;joint++) {
      const node=bone(digit+joint)
      const direction=new Vector3(0,1,0).applyQuaternion(node.getWorldQuaternion(new Quaternion()))
      const inward=digit==='Thumb'?index.clone().sub(position(node)).normalize():normal
      const axis=direction.clone().cross(inward).normalize().applyQuaternion(node.getWorldQuaternion(new Quaternion()).invert())
      const tangent=(side==='Left'?knuckles.clone():position(bone('Middle1'))).sub(wrist).normalize()
      const flat=direction.clone().addScaledVector(normal,-direction.dot(normal)).normalize()
      const forwardInPalm=tangent.addScaledVector(normal,-tangent.dot(normal)).normalize()
      const cardFan=joint===1&&digit!=='Thumb'?Math.atan2(flat.clone().cross(forwardInPalm).dot(normal),flat.dot(forwardInPalm)):0
      const angles=digit==='Thumb'?[24,22,18]:side==='Left'?[20,48,36]:[8,38,32]
      this.fingers.push({cardFan,bone:node,home:node.quaternion.clone(),axis,fanAxis:normal.clone().applyQuaternion(node.getWorldQuaternion(new Quaternion()).invert()),angle:angles[joint-1]*Math.PI/180})
    }
  }
  reset() {for(const {bone,home} of this.fingers) bone.quaternion.copy(home)}
  apply(weight:number) {
    for(const {bone,home,axis,angle} of this.fingers) bone.quaternion.copy(home).multiply(new Quaternion().setFromAxisAngle(axis,angle*weight))
    this.root.updateWorldMatrix(true,true)
  }
  /** A thumb/index pinch with the remaining fingers curled below the cards. */
  holdCards(seconds:number,weight=1) {
    const t=((seconds%10)+10)%10
    // The index bends gently behind the overlap. Each spare finger closes a
    // little farther toward the pinky, rather than repeating one rigid claw.
    const poses=this.side==='Left'
      ? [[12,18,12],[16,24,3],[24,38,18],[32,48,26],[40,58,32]]
      : [[24,22,16],[8,12,8],[12,18,10],[24,46,32],[30,54,38]]
    for(const {bone,home,axis,fanAxis,cardFan} of this.fingers) {
      const digit=['Thumb','Index','Middle','Ring','Pinky'].findIndex(name=>bone.name.includes(name))
      const joint=Number(bone.name.slice(-1))-1
      const delay=(4-digit)*.09+joint*.025
      const regrip=5*fingerBeat(t,2.1+delay,1.25)-3*fingerBeat(t,6.4+delay,1.6)
      const pressure=1.4*Math.sin(2*Math.PI*t/10-digit*.12-joint*.08)+(digit>=3?regrip:0)
      bone.quaternion.copy(home).multiply(new Quaternion().setFromAxisAngle(fanAxis,cardFan*(this.side==='Left'?weight:0))).multiply(new Quaternion().setFromAxisAngle(axis,(poses[digit][joint]+pressure)*weight*Math.PI/180))
    }
    this.root.updateWorldMatrix(true,true)
  }
  /** Thumb/index pinch; the remaining fingers close loosely with delayed pressure. */
  holdChip(seconds:number,weight=1) {
    const t=((seconds%30)+30)%30
    const poses=[[30,32,25],[32,68,42],[25,42,22],[28,46,24],[32,50,24]]
    for(const {bone,home,axis,fanAxis} of this.fingers) {
      const digit=['Thumb','Index','Middle','Ring','Pinky'].findIndex(name=>bone.name.includes(name))
      const joint=Number(bone.name.slice(-1))-1
      const pressure=(digit>=2?4:2.5)*Math.sin(2*Math.PI*t/6-digit*.28-joint*.16)
      bone.quaternion.copy(home).multiply(new Quaternion().setFromAxisAngle(axis,(poses[digit][joint]+pressure)*weight*Math.PI/180))
      if(joint===0&&digit>0) bone.quaternion.multiply(new Quaternion().setFromAxisAngle(fanAxis,(digit-2.5)*1.5*weight*Math.PI/180))
    }
    this.root.updateWorldMatrix(true,true)
  }
  /** A softly folded hand with one extended index, aimed at the actual prop. */
  pointTo(target:Vector3,weight=1,offer=1) {
    const poses=[[32,40,24],[5,7-4*offer,3],[68,88,48],[72,90,50],[76,92,52]]
    for(const {bone,home,axis} of this.fingers) {
      const digit=['Thumb','Index','Middle','Ring','Pinky'].findIndex(name=>bone.name.includes(name))
      const joint=Number(bone.name.slice(-1))-1
      const pressure=digit>1?2*offer:0
      bone.quaternion.copy(home).multiply(new Quaternion().setFromAxisAngle(axis,(poses[digit][joint]+pressure)*weight*Math.PI/180))
    }
    this.root.updateWorldMatrix(true,true)
    const base=this.root.getObjectByName(this.side+'Index1')!,parent=base.parent!
    const before=base.quaternion.clone()
    const from=parent.worldToLocal(this.root.localToWorld(this.tip('Index'))).sub(base.position).normalize()
    const to=parent.worldToLocal(this.root.localToWorld(target.clone())).sub(base.position).normalize()
    base.quaternion.premultiply(new Quaternion().setFromUnitVectors(from,to)).normalize().slerp(before,1-weight)
    this.root.updateWorldMatrix(true,true)
  }
  /** Fingers gather over a hat; spare fingers never curl into a paw. */
  holdHat(weight=1) {
    const poses=[[22,24,16],[20,38,20],[18,30,18],[22,34,18],[26,38,20]]
    for(const {bone,home,axis} of this.fingers) {
      const digit=['Thumb','Index','Middle','Ring','Pinky'].findIndex(name=>bone.name.includes(name))
      const joint=Number(bone.name.slice(-1))-1
      bone.quaternion.copy(home).multiply(new Quaternion().setFromAxisAngle(axis,poses[digit][joint]*weight*Math.PI/180))
    }
    this.root.updateWorldMatrix(true,true)
  }
  /** Relaxed fingers share a breathing rhythm and open gently into a gesture. */
  relax(seconds:number,weight=1,gesture=0) {
    const t=((seconds%30)+30)%30
    for(const {bone,home,axis,fanAxis,angle} of this.fingers) {
      const digit=['Thumb','Index','Middle','Ring','Pinky'].findIndex(name=>bone.name.includes(name))
      const side=bone.name.startsWith('Left')?0:1
      const beat=2*Math.PI*t/2.5-side*.4
      // Fingers share a soft breathing curve. Gesture extension is coordinated,
      // with only a small anatomical difference between neighbouring digits.
      const flex=.14+.045*Math.sin(beat-digit*.08)-.085*gesture
      bone.quaternion.copy(home).multiply(new Quaternion().setFromAxisAngle(axis,angle*flex*weight))
      if(digit>0&&bone.name.endsWith('1')) {
        const fan=(digit-2.5)*(.6+.8*gesture+.25*Math.sin(beat))*(this.side==='Left'?-1:1)
        bone.quaternion.multiply(new Quaternion().setFromAxisAngle(fanAxis,fan*weight*Math.PI/180))
      }
    }
    this.root.updateWorldMatrix(true,true)
  }
  tip(digit:string) {
    const chain=this.fingers.filter(f=>f.bone.name.includes(digit))
    return this.root.worldToLocal(chain[2].bone.localToWorld(new Vector3(0,chain[1].bone.position.y,0)))
  }
  /** Thumb opposition follows one smooth arc; distal joints share the bend. */
  pinchThumb(target:Vector3,weight:number,outward=this.frame().normal.negate(),tipDirection?:Vector3,stable=false) {
    this.curveFinger('Thumb',target,weight,outward,tipDirection,stable)
  }
  supportCard(target:Vector3,weight:number,digit:'Index'|'Middle'|'Ring'|'Pinky'='Middle') {
    this.curveFinger(digit,target,weight,this.frame().normal.negate())
  }
  private curveFinger(digit:string,target:Vector3,weight:number,outward:Vector3,tipDirection?:Vector3,stable=false) {
    if(weight<=0) return
    const chain=this.fingers.filter(f=>f.bone.name.includes(digit))
    const start=chain.map(f=>f.bone.quaternion.clone()),tip=chain[2].bone
    // A snap starts from a consistent thumb roll, independent of the card pinch.
    if(stable) {for(const f of chain)f.bone.quaternion.copy(f.home);this.root.updateWorldMatrix(true,true)}
    const tipLocal=new Vector3(0,chain[1].bone.position.y,0)
    const goal=this.root.localToWorld(target.clone())
    const points=chain.map(f=>f.bone.getWorldPosition(new Vector3()))
    const end=tip.localToWorld(tipLocal.clone())
    const lengths=[points[0].distanceTo(points[1]),points[1].distanceTo(points[2]),points[2].distanceTo(end)]
    const axis=goal.clone().sub(points[0]),distance=axis.length();axis.normalize()
    const bend=outward.clone().transformDirection(this.root.matrixWorld)
    bend.addScaledVector(axis,-bend.dot(axis)).normalize()
    const cosine=Math.max(.25,Math.min(.995,(distance-lengths[1])/(lengths[0]+lengths[2])))
    const first=points[0].clone().addScaledVector(axis,lengths[0]*cosine).addScaledVector(bend,lengths[0]*Math.sqrt(1-cosine*cosine))
    const second=first.clone().addScaledVector(axis,lengths[1])
    if(tipDirection) {
      // Keep the thumb pad running up the paper; an endpoint-only solve
      // can hook its last joint sideways even with perfect contact.
      second.copy(goal).addScaledVector(tipDirection.clone().transformDirection(this.root.matrixWorld),-lengths[2])
      const reach=second.clone().sub(points[0]),d=Math.max(.0001,reach.length());reach.normalize()
      const along=(lengths[0]**2-lengths[1]**2+d*d)/(2*d)
      const pole=outward.clone().transformDirection(this.root.matrixWorld)
      pole.addScaledVector(reach,-pole.dot(reach)).normalize()
      first.copy(points[0]).addScaledVector(reach,along).addScaledVector(pole,Math.sqrt(Math.max(0,lengths[0]**2-along*along)))
    }
    const aim=(i:number,point:Vector3,endpoint:Vector3)=>{
      const bone=chain[i].bone,parent=bone.parent!
      const from=parent.worldToLocal(endpoint).sub(bone.position).normalize()
      const to=parent.worldToLocal(point.clone()).sub(bone.position).normalize()
      bone.quaternion.premultiply(new Quaternion().setFromUnitVectors(from,to)).normalize()
      bone.updateWorldMatrix(true,true)
    }
    aim(0,first,chain[1].bone.getWorldPosition(new Vector3()))
    aim(1,second,chain[2].bone.getWorldPosition(new Vector3()))
    aim(2,goal,tip.localToWorld(tipLocal.clone()))
    // Correct the tiny length discrepancy introduced by cartoon chest scaling.
    for(let pass=0;pass<8;pass++) for(let i=2;i>=0;i--) aim(i,goal,tip.localToWorld(tipLocal.clone()))
    chain.forEach((f,i)=>f.bone.quaternion.slerp(start[i],1-weight))
    chain[0].bone.updateWorldMatrix(true,true)
  }
  /** The empty hand relaxes, loads the middle-finger snap, then releases into the palm. */
  snapFingers(prepare:number,release:number,weight:number) {
    const relaxed=[[12,16,8],[18,24,12],[20,28,16],[24,32,18],[28,36,20]]
    const loaded=[[24,26,20],[16,24,3],[30,92,42],[64,84,46],[68,88,50]]
    const finish=[[24,26,18],[16,24,3],[58,80,42],[64,84,46],[68,88,50]]
    for(const {bone,home,axis} of this.fingers) {
      const digit=['Thumb','Index','Middle','Ring','Pinky'].findIndex(name=>bone.name.includes(name))
      const joint=Number(bone.name.slice(-1))-1
      const load=relaxed[digit][joint]+(loaded[digit][joint]-relaxed[digit][joint])*prepare
      const angle=load+(finish[digit][joint]-load)*release
      bone.quaternion.copy(home).multiply(new Quaternion().setFromAxisAngle(axis,angle*weight*Math.PI/180))
    }
    this.root.updateWorldMatrix(true,true)
  }
  fitFinger(digit:string,target:Vector3,outward:Vector3,weight:number) {
    const chain=this.fingers.filter(f=>f.bone.name.includes(digit))
    const bones=chain.map(f=>f.bone),tip=bones[2],tipLocal=new Vector3(0,bones[1].position.y,0)
    const start=chain.map(f=>f.bone.quaternion.clone())
    const points=bones.map(b=>b.getWorldPosition(new Vector3()))
    const end=tip.localToWorld(tipLocal.clone()),goal=this.root.localToWorld(target.clone())
    const normal=outward.clone().applyQuaternion(this.root.getWorldQuaternion(new Quaternion())).normalize()
    const lengths=[points[0].distanceTo(points[1]),points[1].distanceTo(points[2]),points[2].distanceTo(end)]
    const tangent=goal.clone().sub(points[0]);tangent.addScaledVector(normal,-tangent.dot(normal)).normalize()
    // Approach the surface from outside. Unconstrained fingertip IK can put the
    // middle phalanx inside the skull even when the tip itself hits its target.
    let last=goal.clone(),best=Infinity
    for(let inward=.8;inward>=.05;inward-=.05) {
      const direction=tangent.clone().multiplyScalar(Math.sqrt(1-inward*inward)).addScaledVector(normal,-inward)
      const candidate=goal.clone().addScaledVector(direction,-lengths[2])
      const distance=candidate.distanceTo(points[0]),error=Math.max(0,distance-lengths[0]-lengths[1]+.0001)
      if(error<best) {best=error;last=candidate}
      if(error===0) break
    }
    const axis=last.clone().sub(points[0])
    const distance=Math.max(Math.abs(lengths[0]-lengths[1])+.0001,Math.min(axis.length(),lengths[0]+lengths[1]-.0001))
    axis.normalize();last=points[0].clone().addScaledVector(axis,distance)
    const along=(lengths[0]**2-lengths[1]**2+distance**2)/(2*distance)
    const bend=normal.clone().addScaledVector(axis,-normal.dot(axis)).normalize()
    const middle=points[0].clone().addScaledVector(axis,along).addScaledVector(bend,Math.sqrt(Math.max(0,lengths[0]**2-along**2)))
    const aim=(index:number,point:Vector3)=>{
      const bone=bones[index],origin=bone.getWorldPosition(new Vector3())
      const from=(index===2?tip.localToWorld(tipLocal.clone()):bones[index+1].getWorldPosition(new Vector3())).sub(origin).normalize()
      const to=point.clone().sub(origin).normalize()
      const world=bone.getWorldQuaternion(new Quaternion()).premultiply(new Quaternion().setFromUnitVectors(from,to))
      bone.quaternion.copy(bone.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(world))
      bone.updateWorldMatrix(true,true)
    }
    aim(0,middle);aim(1,last);aim(2,goal)
    chain.forEach((f,i)=>f.bone.quaternion.slerp(start[i],1-weight))
    bones[0].updateWorldMatrix(true,true)
  }
  frame() {
    const position=(suffix:string)=>this.root.worldToLocal(this.root.getObjectByName(this.side+suffix)!.getWorldPosition(new Vector3()))
    const knuckles=['Index1','Middle1','Ring1','Pinky1'].map(position).reduce((sum,p)=>sum.add(p),new Vector3()).multiplyScalar(.25)
    const forward=(this.side==='Left'?knuckles:position('Middle1')).sub(position('Hand')).normalize()
    const normal=position('Index1').sub(position('Pinky1')).cross(forward).normalize().multiplyScalar(this.side==='Left'?-1:1)
    return {forward,normal}
  }
  point() {return this.root.worldToLocal(this.hand.localToWorld(this.palm.clone()))}
}
