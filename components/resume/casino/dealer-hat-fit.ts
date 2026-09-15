import { BufferAttribute, Plane, Vector3, type Bone, type Object3D, type SkinnedMesh } from 'three'
import { ConvexHull } from 'three/addons/math/ConvexHull.js'
import { dealerPart } from './dealer-pose'

/** A real opening for the crown, instead of the generated hat's solid underside. */
export function dealerCrownPlanes(root:Object3D,head:Bone) {
  const points:Vector3[]=[]
  root.traverse(object=>{
    const mesh=object as SkinnedMesh
    if(!mesh.isSkinnedMesh || dealerPart(mesh)!=='Skull') return
    mesh.skeleton.update()
    for(let i=0;i<mesh.geometry.attributes.position.count;i++) {
      points.push(head.worldToLocal(mesh.getVertexPosition(i,new Vector3()).applyMatrix4(mesh.matrixWorld)))
    }
  })
  return new ConvexHull().setFromPoints(points).faces.map(face=>new Plane(face.normal.clone(),-face.constant-.003))
}

/** Cut only private geometry; retain its exterior, UVs and interpolated normals. */
export function openDealerHat(mesh:SkinnedMesh,head:Bone,origin:Vector3,home:Vector3,fit:Vector3,planes:Plane[]) {
  const geometry=mesh.geometry,attributes=Object.entries(geometry.attributes)
  const values=Object.fromEntries(attributes.map(([name,a])=>[name,Array.from(a.array)]))
  type Vertex={point:Vector3;values:Record<string,number[]>;index:number}
  mesh.skeleton.update()
  const vertices:Vertex[]=Array.from({length:geometry.attributes.position.count},(_,i)=>({
    point:head.worldToLocal(mesh.getVertexPosition(i,new Vector3()).applyMatrix4(mesh.matrixWorld)).sub(origin).multiply(fit).add(home),
    values:Object.fromEntries(attributes.map(([name,a])=>[name,Array.from({length:a.itemSize},(_,c)=>a.getComponent(i,c))])),index:i,
  }))
  const interpolate=(a:Vertex,b:Vertex,t:number):Vertex=>({point:a.point.clone().lerp(b.point,t),index:-1,
    values:Object.fromEntries(attributes.map(([name])=>[name,a.values[name].map((v,i)=>v+(b.values[name][i]-v)*t)]))})
  const indices:number[]=[],groups:{start:number;count:number;materialIndex:number}[]=[]
  const emit=(polygon:Vertex[])=>{
    if(polygon.length<3)return
    for(const v of polygon)if(v.index<0){v.index=values.position.length/3;for(const [name] of attributes)values[name].push(...v.values[name])}
    for(let i=1;i<polygon.length-1;i++) {
      const a=polygon[i].point.clone().sub(polygon[0].point),b=polygon[i+1].point.clone().sub(polygon[0].point)
      if(a.cross(b).lengthSq()>1e-16)indices.push(polygon[0].index,polygon[i].index,polygon[i+1].index)
    }
  }
  const index=geometry.index!,sourceGroups=geometry.groups.length?geometry.groups:[{start:0,count:index.count,materialIndex:0}]
  for(const group of sourceGroups){
    const start=indices.length
    for(let i=group.start;i<group.start+group.count;i+=3){
      let inside=[vertices[index.getX(i)],vertices[index.getX(i+1)],vertices[index.getX(i+2)]]
      // Most exterior faces need no clipping or new vertices.
      if(planes.some(p=>inside.every(v=>p.distanceToPoint(v.point)>=0))){emit(inside);continue}
      for(const plane of planes){
        const next:Vertex[]=[],outside:Vertex[]=[]
        for(let j=0;j<inside.length;j++){
          const a=inside[j],b=inside[(j+1)%inside.length],da=plane.distanceToPoint(a.point),db=plane.distanceToPoint(b.point)
          ;(da<=0?next:outside).push(a)
          if((da<0&&db>0)||(da>0&&db<0)){const cut=interpolate(a,b,da/(da-db));next.push(cut);outside.push(cut)}
        }
        emit(outside);inside=next
        if(inside.length<3)break
      }
      // Anything left is inside the skull clearance volume: the opening.
    }
    groups.push({start,count:indices.length-start,materialIndex:group.materialIndex??0})
  }
  for(const [name,a] of attributes)geometry.setAttribute(name,new BufferAttribute(new Float32Array(values[name]),a.itemSize,a.normalized))
  geometry.setIndex(indices);geometry.clearGroups()
  for(const group of groups)geometry.addGroup(group.start,group.count,group.materialIndex)
  geometry.normalizeNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere()
}
