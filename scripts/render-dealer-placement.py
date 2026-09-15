"""Render Three.js-evaluated actor geometry in a camera-matched layout study.

This is a Blender layout proof, not a screenshot of the WebGPU compositor.
The actor positions/skin deformation come from check-dealer-scene.mts.
"""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'blender-bridge/casino-dealer-v2'
proof=json.loads((WORK/'scene-pose.json').read_text())
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models/casino-dealer-v2.glb'))
materials={m.name:m for m in bpy.data.materials}
for o in list(bpy.context.scene.objects):
    bpy.data.objects.remove(o,do_unlink=True)
def xyz(p): return (p[0],-p[2],p[1])
for part in proof['meshes']:
    data=bpy.data.meshes.new(part['name'])
    indices=part['indices']
    faces=[indices[i:i+3] for i in range(0,len(indices),3)]
    data.from_pydata([xyz(v) for v in part['vertices']],[],faces)
    data.update()
    if part['uvs']:
        uv=data.uv_layers.new(name='UVMap')
        for face in data.polygons:
            for index in face.loop_indices:
                u,v=part['uvs'][data.loops[index].vertex_index]
                uv.data[index].uv=(u,1-v) # glTF texture origin differs from Blender's UV origin.
    for face in data.polygons: face.use_smooth=True
    obj=bpy.data.objects.new(part['name'],data)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(materials[part['material']])

def mat(name,color):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=.9
    return m
felt=mat('Layout felt',(.019,.064,.041))
rail_mat=mat('Layout leather',(.015,.018,.017))
floor=mat('Layout room',(.009,.015,.012))
gold=mat('Layout folder',(.54,.36,.15))
ink=mat('Layout lettering',(.14,.66,.28))
scene=bpy.context.scene
def aim(o,p): o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
camera=bpy.data.objects.new('Actual resume camera',bpy.data.cameras.new('Actual resume camera'))
scene.collection.objects.link(camera)
camera.location=xyz(proof['camera']['position'])
aim(camera,xyz(proof['camera']['target']))
camera.data.type='PERSP';camera.data.sensor_fit='VERTICAL'
camera.data.angle=math.radians(proof['camera']['fov'])
scene.camera=camera
# Flat-table's real D outline, including its straight dealer edge and padded rail.
r=proof['table']['feltR'];chord=proof['table']['chordZ'];tube=proof['table']['rail']/2
a=math.asin(chord/r)
outline=[(r*math.cos(a+(math.pi-2*a)*i/160),-(r*math.sin(a+(math.pi-2*a)*i/160)),0) for i in range(161)]
data=bpy.data.meshes.new('D felt')
data.from_pydata(outline,[],[tuple(range(len(outline)))])
obj=bpy.data.objects.new('D felt',data);scene.collection.objects.link(obj);obj.data.materials.append(felt)
curve=bpy.data.curves.new('Padded rail','CURVE');curve.dimensions='3D';curve.bevel_depth=tube;curve.bevel_resolution=3
spline=curve.splines.new('POLY');spline.points.add(len(outline)-1)
for p,v in zip(spline.points,outline): p.co=(*Vector(v[:-1]+(-tube*.45,)),1)
spline.use_cyclic_u=True
obj=bpy.data.objects.new('Padded rail',curve);scene.collection.objects.link(obj);obj.data.materials.append(rail_mat)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.06))
bpy.context.object.data.materials.append(floor)
# Folder proxy for scale/occlusion; the actual page keeps its existing model.
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,-1.15,.08))
obj=bpy.context.object;obj.name='Folder layout proxy';obj.scale=(2.4,1.55,.045);obj.data.materials.append(gold)
# Same arc centres, sizes and spacing as the current title. Typeface is a proxy.
for text,scale,offset in [('ALWAYS BET ON',.82,1.1),('DANIEL W LIU',1.14,-.78)]:
    count=len(text)
    for i,ch in enumerate(text):
        if ch==' ': continue
        theta=math.pi/2+(.5*(count-1)/16)/2-(i/(count-1))*(.5*(count-1)/16)
        x=math.cos(theta)*16*scale
        y=(3.45+math.sin(theta)*16*.92)*scale-16*.92*scale+offset
        data=bpy.data.curves.new(ch,'FONT');data.body=ch;data.align_x='CENTER';data.align_y='CENTER'
        data.size=.58*1.45*scale
        obj=bpy.data.objects.new(ch,data);scene.collection.objects.link(obj)
        obj.location=xyz((x,y,0));obj.rotation_euler=camera.rotation_euler
        obj.data.materials.append(ink)
for name,loc,power,size in [('House lamp',(0,-0,7.5),1300,5),('Camera fill',(0,-7,4),400,5),('Back edge',(2,6,4),500,3)]:
    o=bpy.data.objects.new(name,bpy.data.lights.new(name,'AREA'));scene.collection.objects.link(o)
    o.location=loc;o.data.energy=power;o.data.shape='DISK';o.data.size=size;aim(o,(0,2,1))
scene.world.color=(.06,.06,.06)
scene.render.engine='CYCLES';scene.cycles.samples=32
scene.render.resolution_x=1500;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.view_settings.view_transform='Standard'
scene.render.filepath=str(WORK/'dealer-in-casino-layout.png')
bpy.ops.wm.save_as_mainfile(filepath=str(WORK/'dealer-in-casino-layout.blend'))
bpy.ops.render.render(write_still=True)
camera.location=xyz((1.4,2.0,proof['placement']['position'][2]+5.5))
aim(camera,xyz((0,.8,proof['placement']['position'][2])))
scene.render.filepath=str(WORK/'dealer-at-table-close.png')
bpy.ops.render.render(write_still=True)
