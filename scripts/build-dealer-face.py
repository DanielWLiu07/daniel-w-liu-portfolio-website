"""Add cartoon socket shapes to the retained v2 Blender source; export a new v3 asset."""
import bpy, math, json, hashlib
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT/'blender-bridge/casino-dealer-v3'
WORK.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'blender-bridge/casino-dealer-v2/casino-dealer-v2.blend'))
skull = bpy.data.objects['Skull']
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for o in bpy.data.objects:
    if o.type == 'MESH' and o.data.shape_keys:
        for key in o.data.shape_keys.key_blocks: key.value = 0
for bone in rig.pose.bones:
    bone.rotation_mode = 'QUATERNION'
    bone.rotation_quaternion = (1,0,0,0)
    bone.scale = (1,1,1)

def smooth(a,b,x):
    t=max(0,min(1,(x-a)/(b-a)))
    return t*t*(3-2*t)

added=[]
for side,xc in [('Left',.064),('Right',-.063)]:
    for action in ['socketWide','socketTiltIn','socketTiltOut']:
        name=action+side
        key=skull.shape_key_add(name=name)
        for v,point in zip(skull.data.vertices,key.data):
            p=v.co.copy(); dx,dz=p.x-xc,p.z-1.578
            mask=(1-smooth(-.045,.005,p.y))*(1-smooth(.037,.066,abs(dx)))*(1-smooth(.043,.080,abs(dz)))
            if action=='socketWide':
                p.x += dx*.14*mask
                p.z += dz*.28*mask
            else:
                angle=math.radians(13)*(1 if side=='Left' else -1)*(1 if action=='socketTiltIn' else -1)
                p.x += ((math.cos(angle)*dx-math.sin(angle)*dz)-dx)*mask
                p.z += ((math.sin(angle)*dx+math.cos(angle)*dz)-dz)*mask
            point.co=p
        added.append(name)

rig['characterVersion']='casino-dealer-v3'
rig['facialRig']='Independent socket shapes; jaw hinge; volume-preserving Head scale driven in app and baked on export'
parts=[o for o in bpy.data.objects if o.type=='MESH' and 'partGroup' in o]
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
for o in parts: o.select_set(True)
path=ROOT/'public/models/casino-dealer-v3.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_skins=True,export_morph=True,export_animations=False,export_extras=True,export_yup=True)
manifest=json.loads((ROOT/'public/models/casino-dealer-v2.json').read_text())
manifest.update(version=3,model='/models/casino-dealer-v3.glb?v='+hashlib.sha256(path.read_bytes()).hexdigest()[:12],expressions=manifest['expressions']+added)
(ROOT/'public/models/casino-dealer-v3.json').write_text(json.dumps(manifest,indent=2)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(WORK/'casino-dealer-v3.blend'))
print('FACE_ASSET_EXPORTED',manifest['model'],flush=True)

# Front-view expression studies, preserving the neutral editable file above.
scene=bpy.context.scene
scene.render.resolution_x=scene.render.resolution_y=700
scene.cycles.samples=16
camera=scene.camera
camera.location=(0,-5,1.59)
camera.rotation_euler=(Vector((0,0,1.59))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.ortho_scale=.59
for name,values in [('neutral',{}),('curious',{'browRaiseLeft':.65,'squintRight':.3,'socketTiltInRight':.3}),('surprised',{'socketWideLeft':.85,'socketWideRight':.85,'browRaiseLeft':.45,'browRaiseRight':.45}),('wink',{'blinkLeft':.95,'smile':.5,'browRaiseRight':.25})]:
    for key in skull.data.shape_keys.key_blocks: key.value=values.get(key.name,0)
    bpy.data.objects['Jaw'].data.shape_keys.key_blocks['jawOpen'].value=.65 if name=='surprised' else .08
    scene.render.filepath=str(WORK/f'face-{name}.png')
    bpy.ops.render.render(write_still=True)
