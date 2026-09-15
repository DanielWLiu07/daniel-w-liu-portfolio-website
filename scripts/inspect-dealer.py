"""Inspect and render the Meshy output without opening Blender's UI."""
import bpy
import json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'blender-bridge/casino-dealer-v1'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(WORK / 'meshy-source.glb'))
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
points = [o.matrix_world @ Vector(p) for o in meshes for p in o.bound_box]
lo = Vector([min(p[i] for p in points) for i in range(3)])
hi = Vector([max(p[i] for p in points) for i in range(3)])
scale = 1.8 / (hi.z - lo.z)
offset = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
for o in meshes:
    world = o.matrix_world.copy()
    o.parent = None
    for v in o.data.vertices:
        v.co = (world @ v.co - offset) * scale
    o.matrix_world.identity()
    o.data.update()
bpy.context.view_layer.update()
inventory = []
for o in meshes:
    points = [Vector(p) for p in o.bound_box]
    inventory.append(dict(name=o.name, vertices=len(o.data.vertices), faces=len(o.data.polygons),
                          min=[min(p[i] for p in points) for i in range(3)],
                          max=[max(p[i] for p in points) for i in range(3)],
                          materials=[m.name for m in o.data.materials if m]))
(WORK / 'mesh-inventory.json').write_text(json.dumps(inventory, indent=2))
print('DEALER_INVENTORY', json.dumps(inventory))
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.render.resolution_x = 1000
scene.render.resolution_y = 1200
scene.render.resolution_percentage = 100
scene.world.color = (0.3, 0.3, 0.3)
scene.view_settings.view_transform = 'Standard'
def aim(o, p):
    o.rotation_euler = (Vector(p) - o.location).to_track_quat('-Z', 'Y').to_euler()
for name, loc, power, size in [('Key', (2, -4, 4), 250, 4), ('Fill', (-3, -2, 2), 130, 3), ('Rim', (1, 3, 3), 250, 3)]:
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = power
    data.shape = 'DISK'
    data.size = size
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = loc
    aim(obj, (0, 0, 1))
camera = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera'))
scene.collection.objects.link(camera)
camera.location = (0, -5, 1.03)
aim(camera, (0, 0, 0.93))
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 2.07
scene.camera = camera
scene.render.film_transparent = True
scene.render.filepath = str(WORK / 'meshy-front.png')
bpy.ops.wm.save_as_mainfile(filepath=str(WORK / 'meshy-inspection.blend'))
bpy.ops.render.render(write_still=True)
