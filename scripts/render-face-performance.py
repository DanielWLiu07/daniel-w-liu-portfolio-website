"""Render an animation study from the app-baked GLB with the original artwork restored."""
import bpy
import re
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'blender-bridge/casino-dealer-v3'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models/casino-dealer-v3.glb'))
materials={m.name:m for m in bpy.data.materials}
for obj in list(bpy.context.scene.objects):bpy.data.objects.remove(obj,do_unlink=True)
scene=bpy.context.scene
scene.render.fps=24
bpy.ops.import_scene.gltf(filepath=str(WORK/'face-performance.glb'))
for obj in scene.objects:
    if obj.type!='MESH':continue
    for slot in obj.material_slots:
        if slot.material and slot.material.name.startswith('proof::'):
            key=slot.material.name[len('proof::'):]
            if key not in materials:key=re.sub(r'\.\d{3}$','',key)
            if key not in materials:raise RuntimeError('Missing original material '+key)
            slot.material=materials[key]
scene.render.engine='CYCLES'
scene.cycles.samples=8
scene.render.resolution_x=scene.render.resolution_y=480
scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('StudyWorld')
scene.world.color=(.12,.16,.14)
scene.view_settings.view_transform='Standard'
def aim(obj,point):obj.rotation_euler=(Vector(point)-obj.location).to_track_quat('-Z','Y').to_euler()
for name,loc,power in [('Key',(2,-3,4),220),('Fill',(-2,-2,2),120),('Rim',(1,2,3),190)]:
    obj=bpy.data.objects.new(name,bpy.data.lights.new(name,'AREA'));scene.collection.objects.link(obj)
    obj.location=loc;obj.data.energy=power;obj.data.shape='DISK';obj.data.size=3;aim(obj,(0,0,1.6))
camera=bpy.data.objects.new('FaceStudyCamera',bpy.data.cameras.new('FaceStudyCamera'))
scene.collection.objects.link(camera);scene.camera=camera
camera.location=(.13,-3,1.6);aim(camera,(0,0,1.56));camera.data.type='ORTHO';camera.data.ortho_scale=.82
scene.frame_start=1;scene.frame_end=720;scene.frame_step=2
scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(WORK/'performance-frames/frame-')
(WORK/'performance-frames').mkdir(exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(WORK/'face-performance.blend'))
bpy.ops.render.render(animation=True)
