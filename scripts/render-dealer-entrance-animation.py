"""Render baked entrance motion; approximate body reveal with visibility, not the WebGPU mask."""
import bpy,re,json,struct,sys,math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];WORK=ROOT/'blender-bridge/casino-dealer-v3'
layout=json.loads((WORK/'entrance-layout.json').read_text())
height_shift=-layout['dealerY']/(2*layout['dealerSize'])
timing=json.loads((WORK/'entrance-timing.json').read_text())
def intro_time(t):return t if t<=.46 else .46+(t-.46)/1.6
stress_review='--stress-grip-review' in sys.argv
reveal_stress='--stress-reveal-review' in sys.argv or '--wrist-review' in sys.argv
motion_review='--motion-review' in sys.argv
idle_review=stress_review or '--idle-review' in sys.argv or motion_review or '--hands-review' in sys.argv or '--card-grip-review' in sys.argv
baked=WORK/('dealer-stress.glb' if '--extreme' in sys.argv else 'dealer-idle.glb' if idle_review else 'dealer-entrance.glb')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models/casino-dealer-v3.glb'))
materials={m.name:m for m in bpy.data.materials}
for obj in list(bpy.context.scene.objects):bpy.data.objects.remove(obj,do_unlink=True)
scene=bpy.context.scene;scene.render.fps=24
bpy.ops.import_scene.gltf(filepath=str(baked))
raw=baked.read_bytes()
document=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
mesh_names={node['mesh']:node.get('name','') for node in document['nodes'] if 'mesh' in node}
for obj in scene.objects:
    if obj.type!='MESH':continue
    # Blender gives animated morph meshes their mesh fallback name, not the node name.
    match=re.fullmatch(r'Mesh_(\d+)',obj.name)
    if match:obj.name=mesh_names[int(match[1])]
    for slot in obj.material_slots:
        if slot.material and slot.material.name.startswith('proof::'):
            key=slot.material.name[len('proof::'):]
            if key not in materials:key=re.sub(r'\.\d{3}$','',key)
            if key in materials:slot.material=materials[key]
    skull=obj.name.startswith(('Skull','Jaw','MouthInterior'))
    start=timing['chip'] if obj.name.startswith('DealerChip') else timing['cards'] if obj.name.startswith('DealerCards') else timing['hat'] if obj.name.startswith(('Hat','Hatband')) else timing['body']
    if not skull and not idle_review:
        obj.hide_render=True;obj.keyframe_insert(data_path='hide_render',frame=1)
        obj.hide_render=False;obj.keyframe_insert(data_path='hide_render',frame=1+math.ceil(start*24))
def aim(obj,point):obj.rotation_euler=(Vector(point)-obj.location).to_track_quat('-Z','Y').to_euler()
# Model-space proxy of the actual table edge, to judge the body rising from below it.
felt=bpy.data.materials.new('Study felt');felt.diffuse_color=(.025,.085,.05,1)
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,-5.5,1.005+height_shift))
table=bpy.context.object;table.name='Table proxy';table.scale=(6,10,.01);table.data.materials.append(felt)
leather=bpy.data.materials.new('Study rail');leather.diffuse_color=(.02,.027,.022,1)
curve=bpy.data.curves.new('Back rail','CURVE');curve.dimensions='3D';curve.bevel_depth=.0875;curve.bevel_resolution=3
spline=curve.splines.new('POLY');spline.points.add(1)
spline.points[0].co=(-3,-.505,.9706+height_shift,1);spline.points[1].co=(3,-.505,.9706+height_shift,1)
rail=bpy.data.objects.new('Rail proxy',curve);scene.collection.objects.link(rail);curve.materials.append(leather)
for obj in ([] if idle_review else [table,rail]):
    obj.hide_render=True;obj.keyframe_insert(data_path='hide_render',frame=1)
    obj.hide_render=False;obj.keyframe_insert(data_path='hide_render',frame=20)
camera=bpy.data.objects.new('Entrance camera',bpy.data.cameras.new('Entrance camera'));scene.collection.objects.link(camera);scene.camera=camera
camera.location=(.25,-4,2+height_shift);aim(camera,(.04,0,1.51+height_shift));camera.data.type='ORTHO';camera.data.ortho_scale=1.35*2/layout['dealerSize']
for name,loc,power in [('Key',(2,-3,4),190),('Fill',(-2,-2,2),100),('Rim',(1,2,3),180)]:
    obj=bpy.data.objects.new(name,bpy.data.lights.new(name,'AREA'));scene.collection.objects.link(obj)
    obj.location=loc;obj.data.energy=power;obj.data.size=3;aim(obj,(0,0,1.5))
scene.world=bpy.data.worlds.new('StudyWorld');scene.world.color=(.08,.12,.1)
scene.render.engine='CYCLES';scene.cycles.samples=4;scene.view_settings.view_transform='Standard'
scene.render.resolution_x=scene.render.resolution_y=420;scene.render.resolution_percentage=100
scene.frame_start=1;scene.frame_end=168;scene.frame_step=1
(WORK/'body-rise-animation').mkdir(exist_ok=True)
scene.render.filepath=str(WORK/'body-rise-animation/frame-')
if not (stress_review or reveal_stress):
    bpy.ops.wm.save_as_mainfile(filepath=str(WORK/('dealer-idle-review.blend' if idle_review else 'dealer-body-rise-animation.blend')))
if stress_review or reveal_stress:
    label='reveal' if reveal_stress else 'extreme' if '--extreme' in sys.argv else 'default'
    folder=WORK/f'card-stress-{label}';folder.mkdir(exist_ok=True)
    scene.render.resolution_x=scene.render.resolution_y=480;scene.cycles.samples=4
    camera.data.ortho_scale=.62 if reveal_stress else .46
    times=[timing['cards']-timing['end']+offset for offset in [-.36,-.20,-.08,0,.08,.16,.32,.56]] if reveal_stress else [0,1.5,3,5,7.5,10,12.5,15,18,21,25,29.5]
    if '--wrist-review' in sys.argv:
        times=[timing['cards']-timing['end']+offset for offset in [-.10,.56]]
        folder=WORK/'wrist-review';folder.mkdir(exist_ok=True)
    for i,seconds in enumerate(times):
        scene.frame_set(1+round((timing['end']+seconds if reveal_stress else seconds)*24))
        for j,(view,position) in enumerate([('front',(.20,-3,1.55)),('profile',(3,-.32,1.55)),('rear',(1.6,2,1.55))]):
            camera.location=position;aim(camera,(.20,-.32,1.49 if reveal_stress else 1.44))
            scene.render.filepath=str(folder/f'frame-{i*3+j:03d}.png');bpy.ops.render.render(write_still=True)
elif '--card-grip-review' in sys.argv:
    scene.frame_set(1);scene.render.resolution_x=scene.render.resolution_y=640;scene.cycles.samples=8
    camera.data.ortho_scale=.44
    for view,position in [('front',(.20,-3,1.55)),('profile',(3,-.32,1.55)),('rear',(1.6,2,1.55))]:
        camera.location=position;aim(camera,(.20,-.32,1.44))
        scene.render.filepath=str(WORK/f'card-grip-{view}.png');bpy.ops.render.render(write_still=True)
elif '--hands-review' in sys.argv:
    scene.frame_set(1);scene.render.resolution_x=scene.render.resolution_y=640;scene.cycles.samples=8
    camera.data.ortho_scale=.43
    for side,x in [('cards',.19),('chip',-.245)]:
        for view,offset in [('front',0),('side',1.8)]:
            camera.location=(x+offset,-3,1.7);aim(camera,(x,-.32,1.36 if side=='cards' else 1.3))
            scene.render.filepath=str(WORK/f'hand-{side}-{view}.png');bpy.ops.render.render(write_still=True)
elif '--hat-review' in sys.argv:
    camera.data.ortho_scale=1.05
    for view,position in [('front',(.1,-3,1.85)),('side',(-3,0,1.85)),('rear',(0,3,1.85))]:
        camera.location=position;aim(camera,(-.08,0,1.54))
        for i,seconds in enumerate([intro_time(3.12),intro_time(4.40),11]):
            scene.frame_set(1+round(seconds*24))
            scene.render.filepath=str(WORK/f'hat-{view}-{i:02d}.png');bpy.ops.render.render(write_still=True)
elif '--hat-motion-review' in sys.argv:
    (WORK/'hat-motion').mkdir(exist_ok=True)
    camera.data.ortho_scale=1.12;camera.location=(.1,-3,1.9);aim(camera,(-.05,0,1.62))
    scene.render.resolution_x=scene.render.resolution_y=420;scene.cycles.samples=3
    scene.frame_start=1+round(1.45*24);scene.frame_end=1+round(4.3*24)
    scene.render.filepath=str(WORK/'hat-motion/frame-');bpy.ops.render.render(animation=True)
elif '--snap-review' in sys.argv:
    camera.data.ortho_scale=.70;camera.location=(.27,-3,1.75);aim(camera,(.16,-.24,1.44))
    scene.render.resolution_x=scene.render.resolution_y=540;scene.cycles.samples=8
    for i,age in enumerate([.86,1.02,1.10,1.16,1.24,1.42,1.8]):
        scene.frame_set(1+math.ceil((timing.get('cardActionStart',timing['end'])+age)*24))
        scene.render.filepath=str(WORK/f'snap-{i:02d}.png');bpy.ops.render.render(write_still=True)
elif any(flag in sys.argv for flag in ['--snap-motion-review','--snap-close-motion-review','--snap-side-motion-review']):
    folder='finger-snap-side' if '--snap-side-motion-review' in sys.argv else 'finger-snap' if '--snap-close-motion-review' in sys.argv else 'card-snap'
    (WORK/folder).mkdir(exist_ok=True)
    if '--snap-close-motion-review' in sys.argv:
        camera.data.ortho_scale=.68;camera.location=(.27,-3,1.75);aim(camera,(.14,-.24,1.43))
        scene.render.resolution_x=scene.render.resolution_y=540
    if '--snap-side-motion-review' in sys.argv:
        camera.data.ortho_scale=.62;camera.location=(3,-.32,1.55);aim(camera,(.20,-.32,1.49))
        scene.render.resolution_x=scene.render.resolution_y=540
    scene.frame_start=1+round((timing.get('cardActionStart',timing['end'])+.35)*24);scene.frame_end=1+round((timing.get('cardActionStart',timing['end'])+3.0)*24);scene.frame_step=1
    scene.render.filepath=str(WORK/folder/'frame-');bpy.ops.render.render(animation=True)
elif '--assembly-motion-review' in sys.argv:
    (WORK/'assembly-motion').mkdir(exist_ok=True)
    scene.render.resolution_x=scene.render.resolution_y=360;scene.cycles.samples=2
    scene.frame_end=1+math.ceil(timing['end']*24);scene.frame_step=1
    scene.render.filepath=str(WORK/'assembly-motion/frame-')
    bpy.ops.render.render(animation=True)
elif '--intro-motion-review' in sys.argv:
    (WORK/'quick-intro').mkdir(exist_ok=True)
    scene.frame_end=121;scene.frame_step=2
    scene.render.filepath=str(WORK/'quick-intro/frame-')
    bpy.ops.render.render(animation=True)
elif motion_review:
    (WORK/'expressive-idle').mkdir(exist_ok=True)
    scene.frame_end=145;scene.frame_step=2
    scene.render.filepath=str(WORK/'expressive-idle/frame-')
    bpy.ops.render.render(animation=True)
elif idle_review:
    for i,seconds in enumerate([0,1.5,3.5,5.8,8.6,14.6,19,23.5,26.6,29.5]):
        scene.frame_set(1+round(seconds*24))
        scene.render.filepath=str(WORK/f'idle-{i:02d}.png')
        bpy.ops.render.render(write_still=True)
elif '--entrance-review' in sys.argv:
    for i,seconds in enumerate(map(intro_time,[.8,1.4,2.1,3.1,3.6,4.05,4.4,5.1,6.8])):
        scene.frame_set(1+round(seconds*24))
        scene.render.filepath=str(WORK/f'entrance-review-{i:02d}.png')
        bpy.ops.render.render(write_still=True)
elif '--grip-review' in sys.argv:
    camera.data.ortho_scale=.78
    scene.cycles.samples=12
    for label,position in [('front',(0,-3,1.75)),('quarter',(-2.5,-2.5,1.8)),('side',(-3,0,1.8)),('support',(2.5,-2.5,1.7))]:
        camera.location=position;aim(camera,(0,0,1.53))
        for frame in [44,52]:
            scene.frame_set(1+round(intro_time((frame-1)/24)*24))
            scene.render.filepath=str(WORK/f'grip-{label}-{frame}.png')
            bpy.ops.render.render(write_still=True)
else:
    bpy.ops.render.render(animation=True)
