"""Build an editable modular dealer from the retained Meshy rigged output.

Run in background Blender 4.5: blender -b --factory-startup -t 6 -P scripts/build-dealer.py
No network calls, generation charges, scene integration or browser interaction.
"""
import bpy
import bmesh
import json
import math
import hashlib
from collections import defaultdict
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'blender-bridge/casino-dealer-v2'
WORK.mkdir(exist_ok=True)
SOURCE = ROOT / 'blender-bridge/casino-dealer-v1'
OUT = ROOT / 'public/models'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(SOURCE / 'meshy-rigged.glb'))
source = bpy.data.objects['char1']
old_rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
bone_info = {b.name: (old_rig.matrix_world @ b.head_local,
                     b.parent.name if b.parent else None) for b in old_rig.data.bones}
# Bake the centimetre import transform without changing the rest mesh or weights.
world = source.matrix_world.copy()
source.parent = None
source.data.transform(world)
source.matrix_world.identity()
source.modifiers.clear()
for o in list(bpy.context.scene.objects):
    if o != source:
        bpy.data.objects.remove(o, do_unlink=True)

bm = bmesh.new()
bm.from_mesh(source.data)
bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.00002)
bm.to_mesh(source.data)
bm.free()
source.data.update()
mesh = source.data
surface = mesh.materials[0].node_tree
shader = next(n for n in surface.nodes if n.type == 'BSDF_PRINCIPLED')
# The rigging service adds emissive/specular factors to the supplied material.
# Restore the source's matte cloth/bone response rather than glowing white bone.
for link in list(shader.inputs['Emission Color'].links):
    surface.links.remove(link)
shader.inputs['Emission Color'].default_value = (0, 0, 0, 1)
shader.inputs['Emission Strength'].default_value = 0
shader.inputs['Metallic'].default_value = 0
shader.inputs['Roughness'].default_value = .8
shader.inputs['Specular IOR Level'].default_value = .25
shader.inputs['Specular Tint'].default_value = (1, 1, 1, 1)
image = shader.inputs['Base Color'].links[0].from_node.image
pixels = list(image.pixels)
w, h = image.size
uv = mesh.uv_layers.active.data
def color(face):
    coord = sum((uv[i].uv for i in face.loop_indices), Vector((0, 0))) / len(face.loop_indices)
    ix = (int(coord.y * h) % h * w + int(coord.x * w) % w) * 4
    return pixels[ix:ix+3]

# Native parts are disconnected once glTF UV-seam duplicates are welded.
adj = [[] for _ in mesh.vertices]
for e in mesh.edges:
    a, b = e.vertices
    adj[a].append(b)
    adj[b].append(a)
component = {}
groups = []
for vertex in mesh.vertices:
    if vertex.index in component:
        continue
    ids, stack = [], [vertex.index]
    component[vertex.index] = len(groups)
    while stack:
        index = stack.pop()
        ids.append(index)
        for neighbor in adj[index]:
            if neighbor not in component:
                component[neighbor] = len(groups)
                stack.append(neighbor)
    points = [mesh.vertices[i].co for i in ids]
    lo = Vector([min(p[k] for p in points) for k in range(3)])
    hi = Vector([max(p[k] for p in points) for k in range(3)])
    groups.append((lo, hi, (lo+hi)/2))

labels = defaultdict(list)
for face in mesh.polygons:
    lo, hi, center = groups[component[face.vertices[0]]]
    p = face.center
    r, g, b = color(face)
    side = 'Left' if center.x > 0 else 'Right'
    if lo.z > 1.63 and hi.z > 1.79:
        label = 'Hatband' if r > g * 1.2 and r > b * 1.05 else 'Hat'
    elif hi.z > 1.54 and lo.z > 1.40:
        label = 'Jaw' if p.z < 1.478 and p.y < 0.065 else 'Skull'
    elif hi.z < .17:
        label = 'Shoe' + side
    elif lo.z < .10 and hi.z > .90:
        label = 'Trousers'
    elif abs(center.x) > .42 and hi.z < .91:
        label = 'Hand' + side
    elif abs(center.x) > .24 and hi.z < 1.13:
        label = 'Forearm' + side
    elif abs(center.x) > .18 and hi.z > 1.30:
        label = 'Shirt'
    elif hi.z > 1.5 and lo.z < 1.0:
        if p.z > 1.40:
            label = 'Neck'
        elif r > g * 1.25 and r > b * 1.04 and p.y < -.02:
            label = 'Tie'
        elif r + g + b > 1.35 and min(r, g, b) > .30:
            label = 'Shirt'
        else:
            label = 'Waistcoat'
    elif center.z > 1.03 and center.z < 1.25 and abs(center.x) < .025:
        label = 'Waistcoat'
    else:
        label = 'Skull' if center.z > 1.5 else 'Shirt'
    labels[label].append(face.index)

parts = {}
for label, faces in labels.items():
    obj = source.copy()
    obj.data = source.data.copy()
    obj.name = label
    bpy.context.scene.collection.objects.link(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    keep = set(faces)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    parts[label] = obj
bpy.data.objects.remove(source, do_unlink=True)

def material(name, rgb, roughness=.75):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*rgb, 1)
    p.inputs['Roughness'].default_value = roughness
    return m
import importlib.util
spec = importlib.util.spec_from_file_location('dealer_tailoring', ROOT / 'scripts/dealer-tailoring.py')
tailoring = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tailoring)
parts = tailoring.build_outfit(parts, material, bone_info)

# Add interpolation resolution before shape keys, keeping the neutral silhouette.
for name in ['Skull', 'Jaw']:
    obj = parts[name]
    for v in obj.data.vertices:
        if name == 'Jaw' and v.co.z > 1.478:
            v.co.z = 1.478
        elif name == 'Skull' and v.co.z < 1.478 and v.co.y < .065:
            v.co.z = 1.478
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new('Facial interpolation topology', 'SUBSURF')
    mod.subdivision_type = 'SIMPLE'
    mod.levels = 1
    bpy.ops.object.modifier_apply(modifier=mod.name)

mouth_mat = material('Mouth cavity', (.008, .007, .006))
bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, location=(0,-.052,1.466))
mouth = bpy.context.object
mouth.name = 'MouthInterior'
mouth.scale = (.061,.007,.054)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
mouth.data.materials.append(mouth_mat)
parts['MouthInterior'] = mouth

# Rebuild readable metre-scale bone lengths. Meshy's glTF heads/weights are useful,
# but Blender imports excessively long tails; those tails are not control handles.
rig = bpy.data.objects.new('DealerRig', bpy.data.armatures.new('DealerSkeleton'))
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
root = rig.data.edit_bones.new('Root')
root.head, root.tail = (0, 0, 0), (0, 0, .15)
for name, (head, parent) in bone_info.items():
    b = rig.data.edit_bones.new(name)
    b.head = head
    children = [p for n, (p, par) in bone_info.items() if par == name]
    b.tail = children[0] if children else head + Vector((0, 0, .045))
    if (b.tail-b.head).length < .01:
        b.tail = b.head + Vector((0, 0, .035))
for name, (_, parent) in bone_info.items():
    rig.data.edit_bones[name].parent = rig.data.edit_bones[parent or 'Root']
jaw_pivot = Vector((0, .015, 1.496))
b = rig.data.edit_bones.new('JawHinge')
b.head, b.tail = jaw_pivot, (0, -.085, 1.445)
b.parent = rig.data.edit_bones['Head']
finger_segments = {}
for side, sign in [('Left', 1), ('Right', -1)]:
    digit_defs = [('Thumb', (sign*.441, -.072, .874), (sign*.477, -.080, .787)),
                  ('Index', (sign*.490, -.030, .834), (sign*.544, -.041, .738)),
                  ('Middle', (sign*.482, .004, .834), (sign*.539, .001, .703)),
                  ('Ring', (sign*.480, .035, .835), (sign*.530, .035, .699)),
                  ('Pinky', (sign*.471, .067, .832), (sign*.508, .072, .718))]
    segments = []
    for digit, start, end in digit_defs:
        start, end = Vector(start), Vector(end)
        parent = side + 'Hand'
        for i in range(3):
            a = start.lerp(end, i/3)
            z = start.lerp(end, (i+1)/3)
            name = f'{side}{digit}{i+1}'
            bone = rig.data.edit_bones.new(name)
            bone.head, bone.tail = a, z
            bone.parent = rig.data.edit_bones[parent]
            bone.align_roll(Vector((0, -1, 0)))
            segments.append((name, a.copy(), z.copy()))
            parent = name
    finger_segments[side] = segments
    socket = rig.data.edit_bones.new(side + 'HandSocket')
    socket.head = (sign*.465, -.02, .857)
    socket.tail = socket.head + Vector((0, -.04, 0))
    socket.parent = rig.data.edit_bones[side + 'Hand']
bpy.ops.object.mode_set(mode='OBJECT')
rig.show_in_front = True
rig.data.display_type = 'OCTAHEDRAL'

def rigid(obj, bone):
    obj.vertex_groups.clear()
    obj.vertex_groups.new(name=bone).add(list(range(len(obj.data.vertices))), 1, 'REPLACE')

def distance_segment(p, a, b):
    t = max(0, min(1, (p-a).dot(b-a)/(b-a).length_squared))
    return (p-a.lerp(b, t)).length

for name, o in parts.items():
    if name in ['Skull', 'Hat', 'Hatband', 'HatUnderBand', 'MouthInterior']:
        rigid(o, 'Head')
    elif name == 'Jaw':
        rigid(o, 'JawHinge')
    elif name in ['Tie', 'Collar']:
        rigid(o, 'Spine')
    elif name == 'Neck':
        rigid(o, 'neck')
    elif name == 'Waistcoat':
        for bone in ['Spine02','Spine01','Spine']:
            o.vertex_groups.new(name=bone)
        for v in o.data.vertices:
            z=v.co.z
            t=max(0,min(1,(z-1.06)/.23))*2
            weights=[max(0,1-abs(t-i)) for i in range(3)]
            for bone,weight in zip(['Spine02','Spine01','Spine'],weights):
                if weight>0:
                    o.vertex_groups[bone].add([v.index],weight,'REPLACE')
    elif name.startswith('Forearm'):
        rigid(o, name[7:] + 'ForeArm')
    elif name.startswith('Hand'):
        side = name[4:]
        o.vertex_groups.clear()
        vg = {n: o.vertex_groups.new(name=n) for n, _, _ in finger_segments[side]}
        vg[side+'Hand'] = o.vertex_groups.new(name=side+'Hand')
        # Some generated phalanges are fused. Assign along each digit, with a
        # short transition across joints instead of treating a whole finger as
        # one rigid component and leaving intermediate joints unweighted.
        for v in o.data.vertices:
            if v.co.z > .852 and v.co.y > -.055:
                vg[side+'Hand'].add([v.index], 1, 'REPLACE')
                continue
            distances = sorted([(distance_segment(v.co,a,b), n) for n,a,b in finger_segments[side]])
            digit = distances[0][1][:-1]
            nearest = [(distance,n) for distance,n in distances if n[:-1]==digit][:2]
            weights = [(1/(distance+.003)**4,n) for distance,n in nearest]
            total = sum(weight for weight,_ in weights)
            for weight,n in weights:
                vg[n].add([v.index], weight/total, 'REPLACE')
    # Normalize inherited weights and guarantee every vertex has a valid influence.
    valid = {g.index for g in o.vertex_groups if g.name in rig.data.bones}
    for v in o.data.vertices:
        weights = sorted([(g.group, g.weight) for g in v.groups if g.group in valid and g.weight > 0],
                         key=lambda it: -it[1])[:4]
        total = sum(w for _, w in weights)
        for g in list(v.groups):
            o.vertex_groups[g.group].remove([v.index])
        if total:
            for index, weight in weights:
                o.vertex_groups[index].add([v.index], weight/total, 'REPLACE')
        else:
            group = o.vertex_groups.get('Spine') or o.vertex_groups.new(name='Spine')
            group.add([v.index], 1, 'REPLACE')
    o.parent = rig
    o.modifiers.new('Shared dealer skeleton', 'ARMATURE').object = rig
    for p in o.data.polygons:
        p.use_smooth = True

# Editable morphs on the original UV-mapped skull. They reshape socket rims and
# their dark interiors together; these are stylized expressions, not human FACS.
skull = parts['Skull']
skull.shape_key_add(name='Basis')
expressions = []
def add_morph(obj, name, transform):
    key = obj.shape_key_add(name=name)
    for v, point in zip(obj.data.vertices, key.data):
        point.co = transform(v.co.copy())
    expressions.append(name)
    return key
def smooth(a, b, x):
    t = max(0, min(1, (x-a)/(b-a)))
    return t*t*(3-2*t)
for side, xcenter in [('Left', .064), ('Right', -.063)]:
    for action in ['blink', 'squint', 'browRaise', 'browDown']:
        def transform(p, xc=xcenter, action=action):
            dx, dz = p.x-xc, p.z-1.578
            front = 1-smooth(-.045, .005, p.y)
            horizontal = 1-smooth(.042, .064, abs(dx))
            vertical = 1-smooth(.047, .080, abs(dz))
            mask = front*horizontal*vertical
            if action in ['blink', 'squint']:
                p.z -= dz*mask*(.96 if action=='blink' else .55)
            else:
                mask *= smooth(-.005, .035, dz)
                p.z += mask*(.020 if action=='browRaise' else -.016)
            return p
        add_morph(skull, action+side, transform)
for action, sign in [('smile', 1), ('frown', -1)]:
    def transform(p, sign=sign):
        mask = math.exp(-((abs(p.x)-.063)/.035)**2 - ((p.z-1.503)/.034)**2)
        mask *= 1-smooth(-.055, .015, p.y)
        p.z += sign*.012*mask
        p.x += (1 if p.x>0 else -1)*.005*mask*sign
        return p
    add_morph(skull, action, transform)
jaw = parts['Jaw']
jaw.shape_key_add(name='Basis')
rotation = Matrix.Rotation(math.radians(23), 3, 'X')
add_morph(jaw, 'jawOpen', lambda p: jaw_pivot + rotation @ (p-jaw_pivot))

# Whole-part metadata survives glTF as extras; no Blender-only visibility drivers.
for name, o in parts.items():
    group = {'HatUnderBand': 'Hat', 'ShirtUnderVest': 'Shirt', 'MouthInterior': 'Skull'}.get(name, name)
    o.data.name = name
    o['partGroup'] = group
    o['detachable'] = True
rig['characterVersion'] = 'casino-dealer-v2'
rig['facialRig'] = 'Stylized socket morphs plus jaw hinge; not ARKit/FACS'

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.render.resolution_x, scene.render.resolution_y = 1000, 1200
scene.render.resolution_percentage = 100
scene.world.color = (.25, .25, .25)
scene.view_settings.view_transform = 'Standard'
scene.render.film_transparent = True
def aim(o, p):
    o.rotation_euler = (Vector(p)-o.location).to_track_quat('-Z', 'Y').to_euler()
for name, loc, power, size in [('Key', (2,-4,4),250,4), ('Fill',(-3,-2,2),130,3), ('Rim',(1,3,3),250,3)]:
    light = bpy.data.objects.new(name, bpy.data.lights.new(name, 'AREA'))
    scene.collection.objects.link(light)
    light.location = loc
    light.data.energy, light.data.size = power, size
    aim(light, (0,0,1))
camera = bpy.data.objects.new('ReviewCamera', bpy.data.cameras.new('ReviewCamera'))
scene.collection.objects.link(camera)
camera.location = (0,-5,1.03)
aim(camera, (0,0,.93))
camera.data.type, camera.data.ortho_scale = 'ORTHO', 2.07
scene.camera = camera

bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
for o in parts.values():
    o.select_set(True)
OUT.mkdir(exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'casino-dealer-v2.glb'), export_format='GLB',
    use_selection=True, export_skins=True, export_morph=True, export_animations=False,
    export_extras=True, export_yup=True)
bpy.ops.wm.save_as_mainfile(filepath=str(WORK/'casino-dealer-v2.blend'))
revision = hashlib.sha256((OUT/'casino-dealer-v2.glb').read_bytes()).hexdigest()[:12]
manifest = dict(version=2, model=f'/models/casino-dealer-v2.glb?v={revision}', height=1.8,
    parts={name: dict(group=o['partGroup'], vertices=len(o.data.vertices), faces=len(o.data.polygons)) for name,o in parts.items()},
    bones=list(rig.data.bones.keys()), expressions=list(dict.fromkeys(expressions)),
    limitations=['Clothing is detachable; a complete naked skeleton is not modelled beneath shirt and trousers.',
                 'First-pass socket morphs, not a FACS or ARKit facial rig.',
                 'Jaw morph and JawHinge bone are alternative controls; do not apply both simultaneously.'])
(OUT/'casino-dealer-v2.json').write_text(json.dumps(manifest, indent=2)+'\n')
scene.render.filepath = str(WORK/'dealer-neutral.png')
bpy.ops.render.render(write_still=True)
camera.location = (0,-5,1.60)
aim(camera, (0,0,1.60))
camera.data.ortho_scale = .49
scene.render.resolution_x, scene.render.resolution_y = 900, 1000
scene.render.filepath = str(WORK/'dealer-face-neutral.png')
bpy.ops.render.render(write_still=True)
skull.data.shape_keys.key_blocks['blinkLeft'].value = 1
skull.data.shape_keys.key_blocks['browRaiseRight'].value = .7
skull.data.shape_keys.key_blocks['smile'].value = .8
jaw.data.shape_keys.key_blocks['jawOpen'].value = .55
scene.render.filepath = str(WORK/'dealer-face-expression.png')
bpy.ops.render.render(write_still=True)
print('DEALER_BUILT', json.dumps(manifest))
