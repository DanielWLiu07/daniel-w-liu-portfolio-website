import assert from 'node:assert/strict'
import {readFileSync,existsSync} from 'node:fs'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {Texture,SRGBColorSpace,MeshStandardMaterial,type Mesh} from 'three'
import {poseDealerAtTable} from '../components/resume/casino/dealer-pose'
import {DealerShuffleRig,DEALER_CARD_ART,DEALER_CARD_THICKNESS} from '../components/resume/casino/dealer-shuffle'

const loader=new GLTFLoader();loader.register(()=>({name:'T',loadTexture:()=>Promise.resolve(new Texture())}))
const bytes=readFileSync('public/models/casino-dealer-v3.glb')
const {scene:root}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
poseDealerAtTable(root)
const rig=new DealerShuffleRig(root),maps=DEALER_CARD_ART.map(()=>new Texture())
for(const path of DEALER_CARD_ART)assert.ok(existsSync(`public${path.split('?')[0]}`),`Existing scene artwork is available: ${path}`)
rig.setArtwork(maps)
const sharedBack=new MeshStandardMaterial(),sharedRim=new MeshStandardMaterial()
rig.setStockMaterials(sharedBack,sharedRim)
const meshes=rig.cards.map(card=>card.children[0] as Mesh)
assert.equal(meshes[0].geometry,meshes[1].geometry,'Both held cards share the rounded stock geometry')
const mats=meshes.map(mesh=>mesh.material as MeshStandardMaterial[])
assert.equal(mats[0][1],mats[1][1],'Both cards use the same casino back')
assert.equal(mats[0][2],mats[1][2],'Both cards share the cream stock edge')
mats.forEach((materials,i)=>{
 assert.equal(materials[0].map,maps[i],'Each face uses its original scene plate')
 assert.equal(materials[1],sharedBack,'The held back reuses the flying-card material unchanged')
 assert.equal(materials[2],sharedRim,'The held rim reuses the flying-card material unchanged')
})
assert.ok(maps.every(map=>map.colorSpace===SRGBColorSpace))
const geometry=meshes[0].geometry
assert.deepEqual(geometry.groups.map(group=>group.materialIndex),[0,1,2],'Separate face, back and edge printing')
geometry.computeBoundingBox()
const box=geometry.boundingBox!
assert.ok(Math.abs((box.max.x-box.min.x)/(box.max.z-box.min.z)-2/3)<1e-6,'Artwork keeps its 2:3 proportion')
assert.ok(Math.abs(box.max.y-box.min.y-DEALER_CARD_THICKNESS)<1e-8,'The established grip thickness is preserved')
const position=geometry.attributes.position,normal=geometry.attributes.normal,uv=geometry.attributes.uv
for(const [i,group] of geometry.groups.slice(0,2).entries())for(let v=group.start;v<group.start+group.count;v++){
 assert.ok(Math.abs(normal.getY(v)-(i===0?1:-1))<1e-6,'Face looks toward the dealer; back faces the viewer')
 assert.ok(Math.abs(uv.getY(v)-(position.getZ(v)+.065)/.13)<1e-6,'Both prints are upright along the held card')
 const expectedU=.5+(i===0?-1:1)*position.getX(v)/(.13*2/3)
 assert.ok(Math.abs(uv.getX(v)-expectedU)<1e-6,'Neither print is mirrored')
}
let disposed=false
for(const resource of [...maps,sharedBack,sharedRim])resource.addEventListener('dispose',()=>{disposed=true})
rig.dispose();assert.equal(disposed,false,'Disposing the character does not dispose shared scene textures')
maps.forEach(map=>map.dispose());sharedBack.dispose();sharedRim.dispose()
console.log('Shared artwork, rounded stock, face/back orientation, UVs, thickness and texture ownership passed.')
