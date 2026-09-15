import {Matrix4,type Bone,type Object3D,type Skeleton,type SkinnedMesh,Vector3} from 'three'

/** Put the left wrist at the heel of the hand, preserving the finger bind pose. */
export function prepareDealerWrist(root:Object3D) {
  if(root.userData.dealerWristPrepared)return
  root.updateWorldMatrix(true,true)
  const hand=root.getObjectByName('LeftHand') as Bone,fore=root.getObjectByName('LeftForeArm') as Bone
  if(!hand?.isBone||!fore?.isBone)return
  const before=hand.matrixWorld.clone(),children=hand.children.map(bone=>({bone,world:bone.matrixWorld.clone()}))
  const wrist=hand.getWorldPosition(new Vector3()),elbow=fore.getWorldPosition(new Vector3())
  const axis=wrist.clone().sub(elbow).normalize(),length=wrist.distanceTo(elbow),retreat=.060
  const next=wrist.clone().addScaledVector(axis,-retreat)
  hand.position.copy(hand.parent!.worldToLocal(next));hand.updateWorldMatrix(true,true)
  for(const {bone,world} of children) {
    new Matrix4().copy(bone.parent!.matrixWorld).invert().multiply(world).decompose(bone.position,bone.quaternion,bone.scale)
    bone.updateWorldMatrix(true,true)
  }
  const skeletons=new Set<Skeleton>()
  root.traverse(object=>{
    const mesh=object as SkinnedMesh;if(!mesh.isSkinnedMesh)return
    skeletons.add(mesh.skeleton)
    if(!mesh.name.includes('ForearmLeft'))return
    const geometry=mesh.geometry.clone(),position=geometry.attributes.position,inverse=mesh.matrixWorld.clone().invert()
    for(let i=0;i<position.count;i++) {
      const point=new Vector3().fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld)
      const t=Math.max(0,Math.min(1,point.clone().sub(elbow).dot(axis)/length))
      // End the shafts just before the wrist, instead of inside the palm.
      point.addScaledVector(axis,-(retreat+.004)*t).applyMatrix4(inverse)
      position.setXYZ(i,point.x,point.y,point.z)
    }
    geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere()
    mesh.geometry=geometry;mesh.userData.dealerWristGeometry=true
  })
  for(const skeleton of skeletons) {
    skeleton.boneInverses=skeleton.boneInverses.map((inverse,i)=>skeleton.bones[i]===hand
      ?hand.matrixWorld.clone().invert().multiply(before).multiply(inverse):inverse.clone())
    skeleton.update()
  }
  root.userData.dealerWristPrepared=true
  root.updateWorldMatrix(true,true)
}
export function disposeDealerWrist(root:Object3D) {
  root.traverse(object=>{const mesh=object as SkinnedMesh;if(mesh.isSkinnedMesh&&mesh.userData.dealerWristGeometry)mesh.geometry.dispose()})
}
