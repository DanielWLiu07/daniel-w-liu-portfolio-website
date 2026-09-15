import {BufferGeometry,Float32BufferAttribute,SphereGeometry,Uint16BufferAttribute,Vector3,type SkinnedMesh} from 'three'

/** Replace the fused palm component with metacarpals and a compact carpal arch. */
export function rebuildDealerPalm(mesh:SkinnedMesh,geometry:BufferGeometry) {
  const {position,skinIndex,skinWeight}=geometry.attributes,index=geometry.index!
  const parent=Array.from({length:position.count},(_,i)=>i)
  const find=(i:number):number=>parent[i]===i?i:parent[i]=find(parent[i])
  const welded=new Map<string,number>()
  for(let i=0;i<position.count;i++) {
    const key=new Vector3().fromBufferAttribute(position,i).toArray().map(n=>Math.round(n*1e6)).join(',')
    if(welded.has(key))parent[find(i)]=find(welded.get(key)!);else welded.set(key,i)
  }
  for(let i=0;i<index.count;i+=3)for(let j=1;j<3;j++)parent[find(index.getX(i+j))]=find(index.getX(i))
  const hand=mesh.skeleton.bones.findIndex(b=>b.name==='LeftHand'),counts=new Map<number,number>()
  for(let i=0;i<position.count;i++)for(let j=0;j<4;j++)if(skinIndex.getComponent(i,j)===hand&&skinWeight.getComponent(i,j)>.5)counts.set(find(i),(counts.get(find(i))??0)+1)
  const palm=[...counts].sort((a,b)=>b[1]-a[1])[0]?.[0]
  if(palm===undefined)return geometry
  const pos=Array.from(position.array),weights=Array.from(skinWeight.array),bones=Array.from(skinIndex.array)
  const indices:number[]=[]
  for(let i=0;i<index.count;i+=3)if(find(index.getX(i))!==palm)indices.push(index.getX(i),index.getX(i+1),index.getX(i+2))
  const inverse=mesh.matrixWorld.clone().invert()
  const joint=(name:string)=>mesh.skeleton.bones.find(b=>b.name===name)!.getWorldPosition(new Vector3())
  const wrist=joint('LeftHand'),digits=['Index','Middle','Ring','Pinky']
  const knuckles=digits.map(d=>joint(`Left${d}1`)),center=knuckles.reduce((s,p)=>s.add(p),new Vector3()).multiplyScalar(.25)
  const forward=center.clone().sub(wrist).normalize(),across=knuckles[0].clone().sub(knuckles[3]).normalize()
  const normal=forward.clone().cross(across).normalize()
  const add=(point:Vector3,bone=hand)=>{const p=point.clone().applyMatrix4(inverse),id=pos.length/3;pos.push(p.x,p.y,p.z);bones.push(bone,0,0,0);weights.push(1,0,0,0);return id}
  const ellipsoid=(point:Vector3,x:number,y:number,z:number,bone=hand)=>{
    const g=new SphereGeometry(1,12,8),p=g.attributes.position,base=pos.length/3
    for(let i=0;i<p.count;i++)add(point.clone().addScaledVector(across,p.getX(i)*x).addScaledVector(forward,p.getY(i)*y).addScaledVector(normal,p.getZ(i)*z),bone)
    for(const i of g.index!.array)indices.push(base+i);g.dispose()
  }
  const shaft=(a:Vector3,b:Vector3,radius:number,bone=hand)=>{
    const axis=b.clone().sub(a).normalize(),u=normal.clone().addScaledVector(axis,-normal.dot(axis)).normalize(),v=axis.clone().cross(u).normalize()
    const profile=[.35,.8,1,.78,.61,.60,.77,1,.8,.35],sides=12,base=pos.length/3
    for(let row=0;row<profile.length;row++)for(let i=0;i<sides;i++) {
      const angle=i*2*Math.PI/sides
      add(a.clone().lerp(b,row/(profile.length-1)).addScaledVector(u,Math.cos(angle)*radius*profile[row]*.8).addScaledVector(v,Math.sin(angle)*radius*profile[row]),bone)
    }
    for(let row=0;row<profile.length-1;row++)for(let i=0;i<sides;i++){const a=base+row*sides+i,b=base+row*sides+(i+1)%sides;indices.push(a,b,a+sides,b,b+sides,a+sides)}
    const start=add(a,bone),end=add(b,bone),last=base+(profile.length-1)*sides
    for(let i=0;i<sides;i++){const j=(i+1)%sides;indices.push(start,base+j,base+i,end,last+i,last+j)}
  }
  // Two small rows bridge the wrist to the splayed palm bones.
  for(let row=0;row<2;row++)for(let i=0;i<4;i++)ellipsoid(wrist.clone().addScaledVector(forward,.010+row*.020).addScaledVector(across,(i-1.5)*.013).addScaledVector(normal,-.001*Math.abs(i-1.5)),.006,.006,.0045,row===0?mesh.skeleton.bones.findIndex(b=>b.name==='LeftForeArm'):hand)
  for(let i=0;i<4;i++) {
    const lateral=knuckles[i].clone().sub(center).dot(across)
    const start=wrist.clone().addScaledVector(forward,.039).addScaledVector(across,lateral*.5)
    shaft(start,knuckles[i].clone().addScaledVector(forward,i===3?-.006:-.002),i===3?.007:.008)
  }
  const rigidVertexEnd=pos.length/3
  // The source fused the first pinky phalanx into the removed palm slab.
  shaft(knuckles[3].clone().lerp(joint('LeftPinky2'),.075),joint('LeftPinky2'),.009,mesh.skeleton.bones.findIndex(b=>b.name==='LeftPinky1'))
  const result=new BufferGeometry()
  result.setAttribute('position',new Float32BufferAttribute(pos,3));result.setIndex(indices)
  result.setAttribute('skinIndex',new Uint16BufferAttribute(bones,4));result.setAttribute('skinWeight',new Float32BufferAttribute(weights,4))
  const uv=new Float32Array(pos.length/3*2),oldUV=geometry.attributes.uv
  if(oldUV){uv.set(oldUV.array);for(let i=position.count;i<pos.length/3;i++){uv[i*2]=oldUV.getX(palm);uv[i*2+1]=oldUV.getY(palm)}}
  result.userData.dealerPalmSourceVertices=position.count
  result.userData.dealerPalmRigidVertexEnd=rigidVertexEnd
  result.setAttribute('uv',new Float32BufferAttribute(uv,2));result.computeVertexNormals();result.computeBoundingBox();result.computeBoundingSphere()
  // Removed source components leave unused vertices; give them valid normals.
  const normals=result.attributes.normal
  for(let i=0;i<normals.count;i++)if(normals.getX(i)===0&&normals.getY(i)===0&&normals.getZ(i)===0)normals.setXYZ(i,0,1,0)
  geometry.dispose()
  return result
}
