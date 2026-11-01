import bpy,json
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
root=Path(__file__).resolve().parent.parent
scene=bpy.context.scene
shards=[o for o in scene.objects if o.name.startswith('Impact shard')]
assert len(shards)==18
assert all(o.animation_data and o.animation_data.action for o in shards)
assert scene.render.film_transparent and scene.render.fps==30
scene.frame_set(1)
assert all(max(o.scale)<1e-5 for o in shards)
scene.frame_set(30)
assert all(max(o.scale)<1e-5 for o in shards)
scene.frame_set(10)
bpy.context.view_layer.update()
p=world_to_camera_view(scene,scene.camera,Vector((0,0,0)))
scene.render.filepath=str(root/'qa'/'blender-reopened-frame-0010.png')
bpy.ops.render.render(write_still=True)
(root/'qa'/'blender-roundtrip.json').write_text(json.dumps({
 'version':bpy.app.version_string,'openedNative':str(bpy.data.filepath),
 'shards':len(shards),'animatedShards':len(shards),'frames':30,
 'firstAndLastFramesInvisible':True,'renderedReopenedFrame':10,
 'pivot':[p.x*512,(1-p.y)*512],'transparent':scene.render.film_transparent
},indent=2),encoding='utf8')
