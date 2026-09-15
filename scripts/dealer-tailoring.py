"""Actual garment construction for dealer v2; coordinates are metres/Z-up.

The waistcoat has a neck opening, two bored armscyes and continuous shoulders.
It fits the independently modelled shirt; accessories are attached to its surface.
"""
import bpy
import bmesh
import math
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def build_outfit(parts, material, bone_info):
    ivory = material('Bone crown ivory', (.79, .79, .75))
    cotton = material('Warm ivory cotton', (.69, .67, .60), .9)
    wool = material('Bottle green waistcoat wool', (.022, .059, .041), .88)
    lining = material('Dark waistcoat seam', (.012, .029, .021), .88)
    red = material('Oxblood tie silk', (.14, .015, .021), .64)
    felt = material('Charcoal hat felt', (.022, .025, .028), .95)
    brass = material('Antique brass', (.37, .235, .074), .44)
    thread = material('Ivory stitching', (.43, .42, .37), .9)

    def active(obj):
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj

    def apply(obj, modifier):
        active(obj)
        bpy.ops.object.modifier_apply(modifier=modifier.name)

    def set_material(obj, mat):
        obj.data.materials.clear()
        obj.data.materials.append(mat)
        for face in obj.data.polygons:
            face.material_index = 0

    def mesh(name, verts, faces, mat):
        data = bpy.data.meshes.new(name)
        data.from_pydata(verts, [], faces)
        data.update()
        obj = bpy.data.objects.new(name, data)
        bpy.context.scene.collection.objects.link(obj)
        obj.data.materials.append(mat)
        return obj

    def join(objects, name):
        active(objects[0])
        for obj in objects[1:]:
            obj.select_set(True)
        bpy.ops.object.join()
        objects[0].name = name
        return objects[0]

    def solidify(obj, thickness):
        mod = obj.modifiers.new('Real sewn edge thickness', 'SOLIDIFY')
        mod.thickness = thickness
        mod.offset = -1
        mod.use_even_offset = True
        apply(obj, mod)

    def soften(obj, width=.00065):
        mod = obj.modifiers.new('Soft cloth edge', 'BEVEL')
        mod.width, mod.segments = width, 2
        mod.limit_method = 'ANGLE'
        mod.angle_limit = .5
        apply(obj, mod)

    def difference(obj, cutter):
        bm=bmesh.new();bm.from_mesh(cutter.data)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.to_mesh(cutter.data);bm.free()
        mod = obj.modifiers.new('Sewn garment opening', 'BOOLEAN')
        mod.operation, mod.solver, mod.object = 'DIFFERENCE', 'EXACT', cutter
        apply(obj, mod)
        bpy.data.objects.remove(cutter, do_unlink=True)

    def curve(name, points, radius, mat):
        data = bpy.data.curves.new(name, 'CURVE')
        data.dimensions = '3D'
        data.resolution_u = 2
        data.bevel_depth, data.bevel_resolution = radius, 2
        spline = data.splines.new('POLY')
        spline.points.add(len(points)-1)
        for p, co in zip(spline.points, points):
            p.co = (*co, 1)
        obj = bpy.data.objects.new(name, data)
        bpy.context.scene.collection.objects.link(obj)
        obj.data.materials.append(mat)
        active(obj)
        bpy.ops.object.convert(target='MESH')
        return bpy.context.object

    def ellipsoid(name, center, scale, mat, segments=24):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=12, location=center)
        obj = bpy.context.object
        obj.name = name
        obj.scale = scale
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        obj.data.materials.append(mat)
        return obj

    # Keep only the complete original sleeve components. Delete the fused torso,
    # false vest lapels, old buttons and tie impression instead of painting them white.
    sleeves = parts.pop('Shirt')
    bm = bmesh.new()
    bm.from_mesh(sleeves.data)
    seen, discard = set(), []
    for start in bm.verts:
        if start in seen:
            continue
        stack, connected = [start], []
        seen.add(start)
        while stack:
            v = stack.pop()
            connected.append(v)
            for edge in v.link_edges:
                nxt = edge.other_vert(v)
                if nxt not in seen:
                    seen.add(nxt)
                    stack.append(nxt)
        xs, zs = [v.co.x for v in connected], [v.co.z for v in connected]
        keep = abs((min(xs)+max(xs))*.5) > .18 and min(zs) > 1.0 and max(zs) > 1.30
        if not keep:
            discard.extend(connected)
    bmesh.ops.delete(bm, geom=discard, context='VERTS')
    bm.to_mesh(sleeves.data)
    bm.free()
    set_material(sleeves, cotton)
    for name in ['Waistcoat', 'Tie']:
        bpy.data.objects.remove(parts.pop(name), do_unlink=True)

    # Shared measurements maintain a consistent 5–7 mm clothing clearance.
    profile = [(.96,.167,.133), (1.00,.163,.131), (1.08,.146,.118),
               (1.17,.157,.122), (1.25,.161,.126), (1.31,.151,.116),
               (1.345,.135,.094), (1.365,.107,.073), (1.388,.045,.036),
               (1.411,.036,.032)]
    def dimensions(z):
        for (a,xa,ya),(b,xb,yb) in zip(profile, profile[1:]):
            if a <= z <= b:
                t=(z-a)/(b-a)
                t=t*t*(3-2*t)
                return xa+(xb-xa)*t, ya+(yb-ya)*t
        return profile[0][1:] if z < profile[0][0] else profile[-1][1:]

    def torso(name, mat, garment=False):
        verts, faces = [], []
        segments, rows = 64, 32
        top = 1.388 if garment else 1.407
        for row in range(rows+1):
            t=row/rows
            base=.970+(top-.970)*t
            rx,ry=dimensions(base)
            for i in range(segments):
                theta=2*math.pi*i/segments
                s,c=math.sin(theta),math.cos(theta)
                extra=.006 if garment else 0
                tuck = 0 if garment else .027*max(0,min(1,(1.09-base)/.03))
                # Modest tension creases at the side waist, not random noise.
                fold=.0014*math.sin(27*base+4*theta)*math.sin(math.pi*t)**2
                fold*=abs(s)**5
                bottom = -.017*math.exp(-((abs(s)-.35)/.21)**2)*max(0,c) if garment else -.011
                z=base+bottom*(1-t)**10
                verts.append(((rx+extra+fold-tuck)*s,.008-(ry+extra+fold-tuck)*c,z))
        for row in range(rows):
            for i in range(segments):
                a=row*segments+i; b=row*segments+(i+1)%segments
                faces.append((a,b,b+segments,a+segments))
        obj=mesh(name,verts,faces,mat)
        solidify(obj,.0015 if garment else .001)
        return obj

    shirt_body=torso('Clean shirt body',cotton)
    # A shirt has an actual front placket, small buttons, and no vest neckline.
    shirt_details=[shirt_body,sleeves]
    def front_point(x,z,extra=.001):
        rx,ry=dimensions(z)
        return (x,.008-ry*math.sqrt(max(.02,1-(x/rx)**2))-extra,z)
    shirt_details.append(curve('Shirt placket',[front_point(-.004,1.0+i*.37/40,.0013) for i in range(41)],.00065,thread))
    for z in [1.325,1.272,1.219,1.166,1.113,1.060,1.007]:
        shirt_details.append(ellipsoid('Shirt button',front_point(.001,z,.0025),(.0035,.0012,.0035),cotton,16))
    # Give the new torso and its trim the same spine blend as the vest. The
    # original sleeve weights remain intact through shoulders and elbows.
    for obj in shirt_details:
        if obj == sleeves: continue
        groups=[obj.vertex_groups.new(name=name) for name in ['Spine02','Spine01','Spine']]
        for vertex in obj.data.vertices:
            t=max(0,min(1,(vertex.co.z-1.06)/.23))*2
            for i,group in enumerate(groups):
                weight=max(0,1-abs(t-i))
                if weight>0: group.add([vertex.index],weight,'REPLACE')
    parts['Shirt']=join(shirt_details,'Shirt')

    # A continuous collar stand and two folded points framing the tie knot.
    verts,faces=[],[]
    for row in range(3):
        for i in range(64):
            a=2*math.pi*i/64
            verts.append((.043*math.sin(a),-.014-.041*math.cos(a),1.379+row*.010))
    for row in range(2):
        for i in range(64):
            a=row*64+i;b=row*64+(i+1)%64
            faces.append((a,b,b+64,a+64))
    stand=mesh('Collar stand',verts,faces,cotton)
    solidify(stand,.0017)
    collars=[stand]
    for side in [-1,1]:
        coords=[(side*.004,-.058,1.393),(side*.036,-.042,1.400),
                (side*.062,-.069,1.365),(side*.030,-.102,1.337),
                (side*.017,-.082,1.370)]
        leaf=mesh('Folded collar point',coords,[(0,1,2,3,4)],cotton)
        solidify(leaf,.002)
        soften(leaf,.0008)
        collars.append(leaf)
    parts['Collar']=join(collars,'Collar')
    bpy.data.objects.remove(parts.pop('Neck'),do_unlink=True)
    parts['Neck']=join([ellipsoid('Cervical vertebra',(0,.009,z),(.021,.022,.013),ivory,20)
                         for z in [1.405,1.425,1.445]],'Neck')

    # The generated radius stopped short of the wrist. Fit two complete shafts
    # between the rig joints, with narrow middles and rounded articular ends.
    for side in ['Left','Right']:
        bpy.data.objects.remove(parts.pop('Forearm'+side),do_unlink=True)
        start=bone_info[side+'ForeArm'][0].copy()
        end=bone_info[side+'Hand'][0].copy()
        direction=(end-start).normalized()
        across=Vector((0,1,0))
        across=(across-direction*across.dot(direction)).normalized()
        other=direction.cross(across).normalized()
        shafts=[]
        for sign in [-1,1]:
            verts,faces=[],[]
            rings,sides=28,14
            for row in range(rings+1):
                t=row/rings
                center=start.lerp(end,t)+across*(sign*(.011+.006*math.sin(math.pi*t)))
                radius=.0055+.0045*(math.exp(-(t/.11)**2)+math.exp(-((1-t)/.11)**2))
                for i in range(sides):
                    angle=2*math.pi*i/sides
                    verts.append(center+radius*(across*math.cos(angle)+other*math.sin(angle)))
            for row in range(rings):
                for i in range(sides):
                    a=row*sides+i;b=row*sides+(i+1)%sides
                    faces.append((a,b,b+sides,a+sides))
            faces.extend([tuple(reversed(range(sides))),tuple(rings*sides+i for i in range(sides))])
            shafts.append(mesh('Radius' if sign<0 else 'Ulna',verts,faces,ivory))
        parts['Forearm'+side]=join(shafts,'Forearm'+side)

    vest=torso('Waistcoat',wool,True)
    # One transverse elliptical cutter makes TWO real arm openings and leaves
    # cloth above them to connect the front shoulders to the back yoke.
    bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=1,depth=1,location=(0,.016,1.281),rotation=(0,math.pi/2,0))
    cutter=bpy.context.object
    cutter.scale=(.068,.091,1)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    difference(vest,cutter)
    # Open V neck only through the front panel; back neckline stays intact.
    triangle=[(-.115,1.420),(0,1.225),(.115,1.420)]
    verts=[(x,y,z) for y in [-.3,-.021] for x,z in triangle]
    cutter=mesh('V neck cutter',verts,[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)],wool)
    difference(vest,cutter)
    soften(vest)
    tree=BVHTree.FromPolygons([v.co for v in vest.data.vertices],[p.vertices[:] for p in vest.data.polygons])
    chest_hit=tree.ray_cast(Vector((0,-1,1.32)),Vector((0,1,0)),2)[0]
    assert chest_hit is not None and chest_hit.y>0, 'V neck must expose the shirt, not a closed green chest'
    arm_hit=tree.ray_cast(Vector((1,.016,1.281)),Vector((-1,0,0)),2)[0]
    assert arm_hit is None, 'Both arm openings must pass through the garment'
    def on_vest(x,z,back=False,offset=.001):
        origin=Vector((x,1 if back else -1,z))
        direction=Vector((0,-1 if back else 1,0))
        hit,_,_,_=tree.ray_cast(origin,direction,2)
        if hit is None:
            return Vector(front_point(x,z,.007))
        hit.y+=offset if back else -offset
        return hit
    details=[vest]
    # Slight overlap seam, four buttons and quiet buttonhole stitching.
    details.append(curve('Lapped front seam',[on_vest(-.006,.977+i*.244/50) for i in range(51)],.0006,lining))
    for z in [1.197,1.141,1.085,1.029]:
        details.append(ellipsoid('Vest brass button',on_vest(.002,z,offset=.0032),(.0064,.0026,.0064),brass,20))
        details.append(curve('Buttonhole',[on_vest(x,z) for x in [-.014,-.006]],.0005,lining))
    # Two welt pockets follow the front surface rather than floating in front.
    for sign in [-1,1]:
        line=[on_vest(sign*(.048+.072*i/24),1.067+.010*i/24,offset=.0017) for i in range(25)]
        details.append(curve('Pocket opening',line,.0013,lining))
        details.append(curve('Welt pocket lip',[p+Vector((0,-.0005,-.004)) for p in line],.0020,wool))
        details.append(curve('Front fitting dart',[on_vest(sign*.090,1.10+i*.11/25) for i in range(26)],.0004,lining))
    details.append(curve('Back seam',[on_vest(0,1.008+i*.345/50,True) for i in range(51)],.0005,lining))
    details.append(curve('Back adjuster strap',[on_vest(-.073+i*.146/30,1.081,True,.002) for i in range(31)],.003,wool))
    buckle_points=[on_vest(x,z,True,.004) for x,z in [(-.009,1.074),(.009,1.074),(.009,1.088),(-.009,1.088),(-.009,1.074)]]
    details.append(curve('Back buckle',buckle_points,.0011,brass))
    parts['Waistcoat']=join(details,'Waistcoat')

    # Shaped four-in-hand knot and convex blade tucked into the waistcoat.
    knot=mesh('Tie knot',[(-.011,-.091,1.384),(.011,-.091,1.384),(.008,-.101,1.359),(-.006,-.101,1.358),
                           (-.010,-.078,1.384),(.010,-.078,1.384),(.007,-.088,1.359),(-.005,-.088,1.358)],
              [(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],red)
    soften(knot,.0015)
    verts,faces=[],[]
    for i in range(30):
        t=i/29; z=1.362-.160*t
        width=.006+.010*math.sin(t*math.pi/2)
        if t>.88: width*=max(.025,(1-t)/.12)
        for j in range(5):
            u=-1+j*.5
            x=width*u+.002*math.sin(t*math.pi)
            # Blade follows the sternum and passes behind the waistcoat at its V.
            y=front_point(x,z,.003)[1]-.002*(1-u*u)
            y=min(y,-.092)
            verts.append((x,y,z))
    for i in range(29):
        for j in range(4):
            a=i*5+j;faces.append((a,a+1,a+6,a+5))
    blade=mesh('Tie blade',verts,faces,red)
    solidify(blade,.0013)
    parts['Tie']=join([knot,blade],'Tie')

    # Preserve the hat silhouette; replace the painted band by a fitted ribbon.
    hat=join([parts.pop('Hat'),parts.pop('Hatband')],'Hat')
    set_material(hat,felt)
    parts['Hat']=hat
    tree=BVHTree.FromPolygons([v.co for v in hat.data.vertices],[p.vertices[:] for p in hat.data.polygons])
    verts,faces=[],[]
    for row in range(3):
        for i in range(96):
            a=2*math.pi*i/96
            direction=Vector((math.sin(a),-math.cos(a),0))
            start=Vector((-.007,.03,1.695+.022*row/2+.026*math.sin(a)))
            point,normal,_,_=tree.ray_cast(start,direction,.3)
            if point is None: point,normal=start+direction*.13,direction
            verts.append(point+normal*.0012)
    for row in range(2):
        for i in range(96):
            a=row*96+i;b=row*96+(i+1)%96
            faces.append((a,b,b+96,a+96))
    band=mesh('Hatband',verts,faces,red)
    solidify(band,.0008)
    parts['Hatband']=band

    # Smooth small generated cap fragments and restore ivory beneath the hat.
    skull=parts['Skull']
    skull.data.materials.append(ivory)
    for face in skull.data.polygons:
        if face.center.z>1.662+.20*face.center.x:
            face.material_index=len(skull.data.materials)-1
    bm=bmesh.new();bm.from_mesh(skull.data)
    seen,fragments=set(),[]
    for start in bm.verts:
        if start in seen: continue
        stack,component=[start],[];seen.add(start)
        while stack:
            v=stack.pop();component.append(v)
            for edge in v.link_edges:
                other=edge.other_vert(v)
                if other not in seen: seen.add(other);stack.append(other)
        if len(component)<40 and min(v.co.z for v in component)>1.62:
            fragments.extend(component)
    bmesh.ops.delete(bm,geom=fragments,context='VERTS')
    top=[v for v in bm.verts if v.co.z>1.685+.2*v.co.x]
    for _ in range(4):
        bmesh.ops.smooth_vert(bm,verts=top,factor=.25,use_axis_x=True,use_axis_y=True,use_axis_z=True)
    bm.to_mesh(skull.data);bm.free()
    for obj in parts.values():
        for face in obj.data.polygons:
            face.use_smooth=True
    return parts
