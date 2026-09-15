import {rebuildDealerPalm} from './dealer-palm'
import {Vector3,type Object3D,type SkinnedMesh} from 'three'

/** Repair the generated knuckle weights on a private instance of the left hand.
 * Nearest-digit weights pull the shared palm apart when the fingers curl.
 * Anchor that shared surface to the hand, with a smooth knuckle transition.
 */
export function prepareDealerHandSkin(root:Object3D) {
  root.traverse(object=>{
    const mesh=object as SkinnedMesh
    if(!mesh.isSkinnedMesh||!mesh.name.includes('HandLeft')||mesh.userData.dealerHandSkin)return
    const original=mesh.geometry,geometry=rebuildDealerPalm(mesh,original.clone())
    const {position,skinIndex,skinWeight}=geometry.attributes
    const hand=mesh.skeleton.bones.findIndex(b=>b.name==='LeftHand')
    for(let i=0;i<(geometry.userData.dealerPalmSourceVertices??position.count);i++) {
      let strongest=0,bone=hand
      for(let j=0;j<4;j++)if(skinWeight.getComponent(i,j)>strongest){strongest=skinWeight.getComponent(i,j);bone=skinIndex.getComponent(i,j)}
      const name=mesh.skeleton.bones[bone].name,match=name.match(/^Left(Thumb|Index|Middle|Ring|Pinky)[123]$/)
      if(!match)continue
      const base=mesh.skeleton.bones.findIndex(b=>b.name===`Left${match[1]}1`)
      const point=new Vector3().fromBufferAttribute(position,i).applyMatrix4(mesh.bindMatrix).applyMatrix4(mesh.skeleton.boneInverses[base])
      // The thumb saddle needs a broader transition than the finger knuckles.
      const start=match[1]==='Thumb'?.012:.022,span=match[1]==='Thumb'?.040:.030
      const t=Math.max(0,Math.min(1,(point.y-start)/span)),finger=t*t*(3-2*t)
      if(finger===1)continue
      const weights=new Map<number,number>([[hand,1-finger]])
      for(let j=0;j<4;j++){const b=skinIndex.getComponent(i,j);weights.set(b,(weights.get(b)??0)+skinWeight.getComponent(i,j)*finger)}
      const entries=[...weights].sort((a,b)=>b[1]-a[1]).slice(0,4),total=entries.reduce((sum,e)=>sum+e[1],0)
      for(let j=0;j<4;j++){skinIndex.setComponent(i,j,entries[j]?.[0]??hand);skinWeight.setComponent(i,j,(entries[j]?.[1]??0)/total)}
    }
    mesh.geometry=geometry;mesh.userData.dealerHandSkin=true
  })
}

export function disposeDealerHandSkin(root:Object3D) {
  root.traverse(object=>{const mesh=object as SkinnedMesh;if(mesh.isSkinnedMesh&&mesh.userData.dealerHandSkin)mesh.geometry.dispose()})
}
