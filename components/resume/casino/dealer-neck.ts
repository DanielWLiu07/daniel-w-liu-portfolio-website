import { Bone, Box3, Matrix4, Object3D, Quaternion, Skeleton, SkinnedMesh, Vector3 } from 'three'

/** Align the private cervical chain to the visible neck, preserving rest skin. */
export function prepareDealerNeck(root:Object3D) {
  if(root.userData.dealerNeckPrepared) return
  root.updateWorldMatrix(true,true)
  const neck=root.getObjectByName('neck') as Bone,head=root.getObjectByName('Head') as Bone
  if(!neck?.isBone||!head?.isBone) return
  const bounds=new Box3(),skeletons=new Set<Skeleton>()
  root.traverse(o=>{
    const mesh=o as SkinnedMesh
    if(!mesh.isSkinnedMesh)return
    skeletons.add(mesh.skeleton)
    let owner:Object3D=mesh
    while(!owner.userData.partGroup&&owner.parent)owner=owner.parent
    if((owner.userData.partGroup??mesh.name)!=='Neck')return
    mesh.skeleton.update()
    for(let i=0;i<mesh.geometry.attributes.position.count;i++) bounds.expandByPoint(root.worldToLocal(mesh.getVertexPosition(i,new Vector3()).applyMatrix4(mesh.matrixWorld)))
  })
  if(bounds.isEmpty())return
  root.userData.dealerHeadArtOrigin=root.worldToLocal(head.getWorldPosition(new Vector3())).toArray()
  const old=new Map([[neck,neck.matrixWorld.clone()],[head,head.matrixWorld.clone()]])
  const children=head.children.map(bone=>({bone,world:bone.matrixWorld.clone()}))
  const headRotation=head.getWorldQuaternion(new Quaternion()),headScale=head.getWorldScale(new Vector3())
  const center=bounds.getCenter(new Vector3())
  const put=(bone:Object3D,world:Matrix4)=>{
    world=bone.parent!.matrixWorld.clone().invert().multiply(world)
    world.decompose(bone.position,bone.quaternion,bone.scale)
    bone.quaternion.normalize()
    bone.updateWorldMatrix(true,true)
  }
  put(neck,new Matrix4().compose(root.localToWorld(new Vector3(center.x,bounds.min.y,center.z)),root.getWorldQuaternion(new Quaternion()),root.getWorldScale(new Vector3())))
  put(head,new Matrix4().compose(root.localToWorld(new Vector3(center.x,bounds.max.y,center.z)),headRotation,headScale))
  for(const {bone,world} of children)put(bone,world)
  // SkeletonUtils clones can share inverse-bind matrices. Assign private copies
  // before rebasing so another scene or the cached GLB never changes.
  for(const skeleton of skeletons) {
    skeleton.boneInverses=skeleton.boneInverses.map((inverse,i)=>{
      const bone=skeleton.bones[i],before=old.get(bone)
      return before?bone.matrixWorld.clone().invert().multiply(before).multiply(inverse):inverse.clone()
    })
    skeleton.update()
  }
  root.userData.dealerNeckPrepared=true
  root.updateWorldMatrix(true,true)
}
