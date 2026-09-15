"""Validate the shipped GLB by reimporting it, then render rig/part proofs."""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'blender-bridge/casino-dealer-v2'
manifest = json.loads((ROOT/'public/models/casino-dealer-v2.json').read_text())
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models/casino-dealer-v2.glb'))
meshes = [o for o in bpy.context.scene.objects if o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers)]
# Blender's importer creates an Icosphere bone-display helper; it is not a GLB part.
for obj in list(bpy.context.scene.objects):
    if obj.type=='MESH' and obj not in meshes:
        bpy.data.objects.remove(obj, do_unlink=True)
rig = next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
assert set(manifest['parts']) == {o.name for o in meshes}
assert set(manifest['bones']) == set(rig.data.bones.keys())
targets, used, morph_checks = set(), set(), []
for obj in meshes:
    assert obj.get('detachable') and obj.get('partGroup'), obj.name
    assert any(m.type=='ARMATURE' and m.object==rig for m in obj.modifiers), obj.name
    for v in obj.data.vertices:
        assert all(math.isfinite(x) for x in v.co)
        weights = [g for g in v.groups if g.weight > 0]
        assert 1 <= len(weights) <= 4, (obj.name, v.index)
        assert abs(sum(g.weight for g in weights)-1) < 1e-4, obj.name
        for g in weights:
            name = obj.vertex_groups[g.group].name
            assert name in rig.data.bones
            used.add(name)
    if obj.data.shape_keys:
        basis = obj.data.shape_keys.key_blocks[0]
        for key in list(obj.data.shape_keys.key_blocks)[1:]:
            targets.add(key.name)
            maximum = max((v.co-b.co).length for v,b in zip(key.data,basis.data))
            assert maximum > .00001, (obj.name,key.name,maximum)
            for value in [0, .5, 1, 0]:
                key.value = value
                bpy.context.view_layer.update()
                evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
                evaluated_mesh = evaluated.to_mesh()
                assert all(math.isfinite(x) for v in evaluated_mesh.vertices for x in v.co)
                if value == 0:
                    assert max((v.co-b.co).length for v,b in zip(evaluated_mesh.vertices,basis.data)) < .00001
                evaluated.to_mesh_clear()
            morph_checks.append(dict(mesh=obj.name, morph=key.name, maxDelta=maximum))
assert set(manifest['expressions']) == targets
missing_fingers = [name for name in rig.data.bones.keys() if any(digit in name for digit in ['Thumb','Index','Middle','Ring','Pinky']) and name not in used]
assert not missing_fingers, missing_fingers
points = [o.matrix_world @ Vector(p) for o in meshes for p in o.bound_box]
height = max(p.z for p in points)-min(p.z for p in points)
assert abs(height-1.8)<.005, height
report = dict(parts=len(meshes), bones=len(rig.data.bones), morphs=morph_checks,
              height=height, skinWeights='normalized, valid indices, 1–4 influences', fingerBonesWeighted=30)
(WORK/'validation.json').write_text(json.dumps(report,indent=2)+'\n')
print('DEALER_VALIDATED',json.dumps(report))

# Render the exact exported mesh with face controls and a body pose applied.
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.render.resolution_x, scene.render.resolution_y = 1000,1200
scene.render.resolution_percentage = 100
scene.world.color = (.25,.25,.25)
scene.view_settings.view_transform='Standard'
scene.render.film_transparent=True
def aim(o,p):
    o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
for name,loc,power,size in [('Key',(2,-4,4),250,4),('Fill',(-3,-2,2),130,3),('Rim',(1,3,3),250,3)]:
    o=bpy.data.objects.new(name,bpy.data.lights.new(name,'AREA'))
    scene.collection.objects.link(o)
    o.location=loc
    o.data.energy,o.data.size=power,size
    aim(o,(0,0,1))
camera=bpy.data.objects.new('Camera',bpy.data.cameras.new('Camera'))
scene.collection.objects.link(camera)
camera.location=(.5,-5,1.10)
aim(camera,(0,0,.95))
camera.data.type,camera.data.ortho_scale='ORTHO',2.15
scene.camera=camera
for b in rig.pose.bones:
    b.rotation_mode='XYZ'
rig.pose.bones['Head'].rotation_euler.y=.25
rig.pose.bones['Spine01'].rotation_euler.x=.10
rig.pose.bones['LeftForeArm'].rotation_euler.x=.65
for name in used:
    if any(digit in name for digit in ['Thumb','Index','Middle','Ring','Pinky']):
        rig.pose.bones[name].rotation_euler.x=.45
for o in meshes:
    if o.data.shape_keys:
        for key in o.data.shape_keys.key_blocks:
            key.value={'blinkLeft':.8,'browRaiseRight':.5,'smile':.5,'jawOpen':.25}.get(key.name,0)
bpy.context.view_layer.update()
scene.render.filepath=str(WORK/'dealer-pose-proof.png')
bpy.ops.render.render(write_still=True)
for b in rig.pose.bones:
    b.rotation_euler=(0,0,0)
for o in meshes:
    if o.data.shape_keys:
        for key in o.data.shape_keys.key_blocks:
            key.value=0
    if o.get('partGroup') in ['Hat','Hatband','Waistcoat','Tie']:
        o.hide_render=True
scene.render.filepath=str(WORK/'dealer-detached-proof.png')
bpy.ops.render.render(write_still=True)
for o in meshes:
    o.hide_render=False
offsets={'Hat':(0,0,.38),'Hatband':(.4,0,.35),'Skull':(0,0,.14),'Jaw':(0,-.30,.03),
         'Waistcoat':(0,-.48,0),'Tie':(.27,-.65,.04),'Shirt':(0,.22,0),
         'HandLeft':(.3,0,0),'HandRight':(-.3,0,0),'ForearmLeft':(.17,0,0),'ForearmRight':(-.17,0,0)}
for o in meshes:
    offset=Vector(offsets.get(o.get('partGroup'),(0,0,0)))
    if o.data.shape_keys:
        for key in o.data.shape_keys.key_blocks:
            for v in key.data:
                v.co+=offset
    else:
        for v in o.data.vertices:
            v.co+=offset
camera.location=(2.4,-5,2.3)
aim(camera,(0,0,1.08))
camera.data.ortho_scale=2.6
scene.render.filepath=str(WORK/'dealer-exploded-proof.png')
bpy.ops.render.render(write_still=True)
