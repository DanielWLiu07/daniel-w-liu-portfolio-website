"""Eight Three.js-evaluated entrance poses; this is not a WebGPU compositor capture."""
import bpy,json,math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'blender-bridge/casino-dealer-v3'
proof=json.loads((WORK/'entrance-study.json').read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models/casino-dealer-v3.glb'))
materials={m.name:m for m in bpy.data.materials}
for obj in list(bpy.context.scene.objects):bpy.data.objects.remove(obj,do_unlink=True)
def xyz(p):return (p[0],-p[2],p[1])
objects={}
for part in proof['parts']:
    data=bpy.data.meshes.new(part['name'])
    initial=next(p for p in proof['frames'][0]['parts'] if p['name']==part['name'])
    indices=part['indices']
    data.from_pydata([xyz(v) for v in initial['vertices']],[],[indices[i:i+3] for i in range(0,len(indices),3)])
    if part['uvs']:
        uv=data.uv_layers.new(name='UVMap')
        for face in data.polygons:
            for i in face.loop_indices:
                u,v=part['uvs'][data.loops[i].vertex_index];uv.data[i].uv=(u,1-v)
    for face in data.polygons:face.use_smooth=True
    obj=bpy.data.objects.new(part['name'],data);bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(materials[part['material']]);objects[part['name']]=obj
scene=bpy.context.scene
def aim(obj,point):obj.rotation_euler=(Vector(point)-obj.location).to_track_quat('-Z','Y').to_euler()
camera=bpy.data.objects.new('Entrance study camera',bpy.data.cameras.new('Entrance study camera'))
scene.collection.objects.link(camera);scene.camera=camera
camera.location=(.25,-4,1.65);aim(camera,(.04,0,1.51));camera.data.type='ORTHO';camera.data.ortho_scale=1.35
for name,loc,power in [('Key',(2,-3,4),190),('Fill',(-2,-2,2),100),('Rim',(1,2,3),180)]:
    obj=bpy.data.objects.new(name,bpy.data.lights.new(name,'AREA'));scene.collection.objects.link(obj)
    obj.location=loc;obj.data.energy=power;obj.data.size=3;aim(obj,(0,0,1.5))
scene.world=bpy.data.worlds.new('StudyWorld');scene.world.color=(.08,.12,.1)
scene.render.engine='CYCLES';scene.cycles.samples=16
scene.view_settings.view_transform='Standard'
scene.render.resolution_x=scene.render.resolution_y=600;scene.render.resolution_percentage=100
for i,frame in enumerate(proof['frames']):
    for part in frame['parts']:
        obj=objects[part['name']];obj.hide_render=not part['visible']
        for vertex,point in zip(obj.data.vertices,part['vertices']):vertex.co=xyz(point)
        obj.data.update()
    scene.render.filepath=str(WORK/f'entrance-{i:02d}.png')
    bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(WORK/'entrance-study.blend'))
