"""Compare room placement with the actual camera/table and proxy title typography."""
import bpy,json,math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];WORK=ROOT/'blender-bridge/casino-dealer-v3'
proof=json.loads((WORK/'entrance-study.json').read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models/casino-dealer-v3.glb'))
materials={m.name:m for m in bpy.data.materials}
for obj in list(bpy.context.scene.objects):bpy.data.objects.remove(obj,do_unlink=True)
scene=bpy.context.scene
def xyz(p):return (p[0],-p[2],p[1])
def material(name,color):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);return m
def aim(obj,point):obj.rotation_euler=(Vector(point)-obj.location).to_track_quat('-Z','Y').to_euler()
camera=bpy.data.objects.new('Resume camera',bpy.data.cameras.new('Resume camera'));scene.collection.objects.link(camera);scene.camera=camera
camera.location=xyz((0,4.6,12.5));aim(camera,xyz((0,1.4,-.6)))
camera.data.sensor_fit='VERTICAL';camera.data.angle=math.radians(25)
felt=material('Felt',(.018,.055,.035));rail=material('Rail',(.015,.018,.016));ink=material('Title',(.12,.8,.32))
r=9.84;chord=-2.5;a=math.asin(chord/r)
outline=[(r*math.cos(a+(math.pi-2*a)*i/160),-r*math.sin(a+(math.pi-2*a)*i/160),0) for i in range(161)]
mesh=bpy.data.meshes.new('Felt');mesh.from_pydata(outline,[],[tuple(range(161))])
obj=bpy.data.objects.new('Table',mesh);scene.collection.objects.link(obj);mesh.materials.append(felt)
curve=bpy.data.curves.new('Rail','CURVE');curve.dimensions='3D';curve.bevel_depth=.35;curve.bevel_resolution=3
spline=curve.splines.new('POLY');spline.points.add(160)
for p,v in zip(spline.points,outline):p.co=(*v[:2],-.1575,1)
spline.use_cyclic_u=True
obj=bpy.data.objects.new('Rail',curve);scene.collection.objects.link(obj);curve.materials.append(rail)
letters=[]
for text,scale,offset in [('ALWAYS BET ON',.82,1.1),('DANIEL W LIU',1.14,-.78)]:
    for i,ch in enumerate(text):
        if ch==' ':continue
        theta=math.pi/2+.5*(len(text)-1)/16/2-i*.5/16
        x=math.cos(theta)*16*scale;y=(3.45+math.sin(theta)*16*.92)*scale-16*.92*scale+offset
        data=bpy.data.curves.new(ch,'FONT');data.body=ch;data.align_x=data.align_y='CENTER';data.size=.58*1.45*scale
        obj=bpy.data.objects.new(ch,data);scene.collection.objects.link(obj);obj.location=xyz((x,y,0));obj.rotation_euler=camera.rotation_euler;data.materials.append(ink)
        letters.append((obj,obj.location.copy()))
objects={}
frame=proof['frames'][-1]
for part in proof['parts']:
    pose=next(p for p in frame['parts'] if p['name']==part['name'])
    data=bpy.data.meshes.new(part['name']);indices=part['indices']
    data.from_pydata([xyz(v) for v in pose['vertices']],[],[indices[i:i+3] for i in range(0,len(indices),3)])
    if part['uvs']:
        uv=data.uv_layers.new(name='UVMap')
        for face in data.polygons:
            for i in face.loop_indices:
                u,v=part['uvs'][data.loops[i].vertex_index];uv.data[i].uv=(u,1-v)
    for face in data.polygons:face.use_smooth=True
    obj=bpy.data.objects.new(part['name'],data);scene.collection.objects.link(obj);data.materials.append(materials[part['material']]);objects[obj.name]=obj
for name,loc,power in [('Key',(2,-4,7),1000),('Fill',(-3,-3,3),600),('Rim',(2,5,5),700)]:
    obj=bpy.data.objects.new(name,bpy.data.lights.new(name,'AREA'));scene.collection.objects.link(obj);obj.location=loc;obj.data.energy=power;obj.data.size=5;aim(obj,(0,0,1.5))
scene.world=bpy.data.worlds.new('Room');scene.world.color=(.04,.06,.05)
scene.render.engine='CYCLES';scene.cycles.samples=16;scene.view_settings.view_transform='Standard'
scene.render.resolution_x=1200;scene.render.resolution_y=720;scene.render.resolution_percentage=100
for label,depth in [('previous',5.5),('table',0),('layered',0)]:
    for letter,home in letters:
        factor=1.8 if label=='layered' else 1
        letter.location=camera.location+(home-camera.location)*factor;letter.scale=(factor,)*3
    for obj in objects.values():obj.scale=(4,4,4);obj.location=xyz((0,-4.04,-4.52+depth))
    scene.render.filepath=str(WORK/f'placement-{label}.png');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(WORK/'placement-review.blend'))
