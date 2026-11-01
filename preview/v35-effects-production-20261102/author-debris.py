"""Editable 3D debris for the red-coat swordsman's ground contact.
Run with Blender --background --factory-startup --python this-file.
No UI, simulation cache, external model, or raster illustration is required.
"""
import bpy, math, random, json
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'frames' / 'debris'
OUT.mkdir(parents=True, exist_ok=True)
(ROOT / 'native').mkdir(exist_ok=True)
random.seed(3502)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 12
scene.cycles.use_denoising = True
scene.render.resolution_x = 512
scene.render.resolution_y = 512
scene.render.resolution_percentage = 100
scene.render.fps = 30
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.color_depth = '8'
scene.render.threads_mode = 'FIXED'
scene.render.threads = 8
scene.frame_start, scene.frame_end = 1, 30
scene.world.color = (0.08, 0.10, 0.14)
scene.view_settings.view_transform = 'AgX'

def material(name, color, metallic=0, roughness=.45, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Emission Color'].default_value = (*color, 1)
    p.inputs['Emission Strength'].default_value = emission
    return m

slate = material('Fractured blue-black slate', (.055, .075, .10), .15, .6)
cut = material('Fresh stone facets', (.19, .23, .28), .22, .36)
gold = material('Heated cut edge', (.85, .25, .035), .65, .28, .7)

def light(name, pos, power, color, size):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy, data.color, data.shape, data.size = power, color, 'DISK', size
    ob = bpy.data.objects.new(name, data)
    scene.collection.objects.link(ob)
    ob.location = pos
    ob.rotation_euler = (Vector((0, 0, .8)) - ob.location).to_track_quat('-Z','Y').to_euler()

light('Warm contact key', (-3, -4, 6), 650, (1, .55, .25), 4)
light('Cool silhouette rim', (4, 2, 5), 900, (.38, .6, 1), 3)
light('Soft front fill', (1, -5, 2), 250, (.8, .9, 1), 4)
data = bpy.data.cameras.new('V3 side-field camera')
camera = bpy.data.objects.new('V3 side-field camera', data)
scene.collection.objects.link(camera)
camera.location = (3.4, -8, 4.2)
camera.rotation_euler = (Vector((0, 0, 1.0)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
data.type, data.ortho_scale = 'ORTHO', 6.5
scene.camera = camera

for i in range(18):
    # Individually faceted irregular solids; rotation changes exposed faces.
    radius = random.uniform(.09, .22) if i > 5 else random.uniform(.22, .34)
    height = random.uniform(.22, .7)
    n = 5
    verts = [(math.cos(j*math.tau/n)*radius*random.uniform(.7,1.3),
              math.sin(j*math.tau/n)*radius*random.uniform(.7,1.3),
              -height*.25 + random.uniform(-.06,.06)) for j in range(n)]
    verts += [(x*.66+.02, y*.66-.02, height*.65+random.uniform(-.1,.1)) for x,y,z in verts]
    faces = [tuple(range(n-1,-1,-1)), tuple(range(n,2*n))]
    faces += [(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)]
    mesh = bpy.data.meshes.new(f'Shard {i:02d} faceted mesh')
    mesh.from_pydata(verts, [], faces)
    mesh.materials.clear()
    for m in (slate, cut, gold): mesh.materials.append(m)
    ob = bpy.data.objects.new(f'Impact shard {i:02d}', mesh)
    scene.collection.objects.link(ob)
    for poly in mesh.polygons: poly.material_index = 2 if (poly.index+i)%7==0 else (poly.index+i)%2
    ang = random.uniform(0, math.tau)
    speed = random.uniform(1.0, 2.5)
    vz = random.uniform(2.5, 4.1)
    base = Vector((random.uniform(-.12,.12), random.uniform(-.12,.12), .04))
    spin = Vector((random.uniform(-9,9), random.uniform(-9,9), random.uniform(-7,7)))
    for frame in range(1,31):
        t = (frame-1)/29
        z = max(.025, vz*t-4.9*t*t)
        ob.location = base + Vector((math.cos(ang)*speed*t, math.sin(ang)*speed*t*.7, z))
        ob.rotation_euler = spin*t
        size = min(1, t*22) * max(0, min(1, (1-t)/.23))
        ob.scale = (size,size,size)
        ob.keyframe_insert('location',frame=frame)
        ob.keyframe_insert('rotation_euler',frame=frame)
        ob.keyframe_insert('scale',frame=frame)
    if ob.animation_data:
        for fcurve in ob.animation_data.action.fcurves:
            for k in fcurve.keyframe_points: k.interpolation = 'LINEAR'

scene.frame_set(1)
bpy.context.view_layer.update()
pivot = world_to_camera_view(scene,camera,Vector((0,0,0)))
meta = {'tool':'Blender','version':bpy.app.version_string,'engine':scene.render.engine,
        'fps':30,'frames':30,'width':512,'height':512,'pivot':[pivot.x*512,(1-pivot.y)*512],
        'blend':'normal','alpha':'straight','seed':3502,'source':'native/contact-debris.blend',
        'purpose':'3D rotating stone shards, ground contact only','cameraPosition':list(camera.location)}
(ROOT/'debris.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
scene.render.filepath = str(OUT/'frame-')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'native'/'contact-debris.blend'))
bpy.ops.render.render(animation=True)
