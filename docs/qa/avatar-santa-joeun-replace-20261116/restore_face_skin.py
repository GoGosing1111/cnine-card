from pathlib import Path
import hashlib
import json

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageStat

ROOT = Path(__file__).resolve().parent
SOURCE = Path('C:/Users/User/.codex/generated_images/01a1e3e3-45d4-7dd2-a579-b16e6631d6f1/exec-01ea434c-313c-4f55-9e0f-d3d477ec507f.png')
POSE = Path('C:/Users/User/.codex/generated_images/01a1e3e3-45d4-7dd2-a579-b16e6631d6f1/exec-676bdf3f-ec5d-47cd-9a25-51ce45201997.png')
OUTPUT = ROOT / 'joeun-santa-original-face-natural-pose-v10.png'

source_image = Image.open(SOURCE).convert('RGB')
pose_image = Image.open(POSE).convert('RGB')
assert source_image.size == pose_image.size == (1024, 1536)
source = np.asarray(source_image, dtype=np.float32)
pose = np.asarray(pose_image, dtype=np.float32)

patches = {
    'forehead': (506, 103, 524, 121),
    'viewer_left_cheek': (464, 166, 480, 183),
    'viewer_right_cheek': (542, 166, 555, 182),
}

def patch_mean(image, box):
    return np.array(ImageStat.Stat(image.crop(box)).mean, dtype=np.float32)

patch_delta = np.stack([patch_mean(source_image, b) - patch_mean(pose_image, b) for b in patches.values()])
color_delta = np.median(patch_delta, axis=0)

# Only the exposed skin / skin visible through hosiery is selected. The face
# is restored from its source pixels afterwards, so no generated face remains.
body_polygons = {
    'neck_chest': [(474,230),(540,231),(545,253),(561,266),(594,277),(633,286),(641,311),(636,348),(622,357),(455,357),(437,318),(442,282),(461,269)],
    'viewer_left_arm': [(366,286),(402,284),(427,312),(432,355),(419,401),(408,451),(400,506),(388,570),(372,646),(360,701),(350,776),(351,824),(358,837),(350,864),(337,871),(317,857),(303,821),(306,789),(315,734),(321,665),(328,594),(334,521),(340,450),(346,383),(348,331)],
    'viewer_right_arm': [(620,280),(645,286),(658,311),(662,356),(669,432),(675,493),(679,555),(690,629),(701,700),(710,770),(717,812),(716,839),(707,858),(685,864),(675,853),(670,840),(670,816),(666,788),(660,741),(652,683),(645,625),(637,560),(632,501),(627,436),(620,378),(612,321)],
    'viewer_left_leg': [(370,808),(499,808),(490,880),(481,920),(470,992),(458,1060),(457,1115),(460,1195),(456,1280),(455,1333),(415,1333),(407,1278),(391,1205),(382,1144),(379,1106),(384,1048),(388,976),(381,922),(374,875)],
    'viewer_right_leg': [(516,811),(642,811),(649,884),(646,936),(652,988),(669,1088),(681,1154),(691,1235),(700,1334),(662,1333),(642,1274),(623,1206),(600,1164),(585,1100),(570,1032),(553,965),(540,916),(527,875)],
}
blurred = np.asarray(pose_image.filter(ImageFilter.GaussianBlur(1.8)),dtype=np.float32)
edge_score = np.pad(np.linalg.norm(blurred[:,4:]-blurred[:,:-4],axis=2),((0,0),(2,2)))
edge_score = (np.roll(edge_score,1,axis=0)+edge_score+np.roll(edge_score,-1,axis=0))/3

def boundary(anchors, start, stop):
    ys=np.arange(start,stop+1)
    expected=np.interp(ys,[p[0] for p in anchors],[p[1] for p in anchors])
    values=[]
    for y,x in zip(ys,expected):
        candidates=np.arange(max(0,int(x)-10),min(1024,int(x)+11))
        score=edge_score[y,candidates]-0.7*(candidates-x)**2
        values.append(candidates[np.argmax(score)])
    return np.convolve(np.pad(values,(2,2),mode='edge'),np.ones(5)/5,mode='valid')

edge_guides={
    'viewer_left_arm': (
        [(330,349),(350,348),(400,348),(450,348),(500,348),(550,339),(600,330),(650,327),(700,321),(750,316),(780,313)],
        [(330,394),(350,390),(400,386),(450,390),(500,400),(550,394),(600,383),(650,367),(700,354),(750,343),(780,352)]),
    'viewer_right_arm': (
        [(330,616),(350,620),(400,627),(450,613),(500,612),(550,617),(600,631),(650,647),(700,664),(750,677),(790,682)],
        [(330,662),(350,661),(400,661),(450,658),(500,660),(550,669),(600,680),(650,684),(700,694),(750,702),(790,712)]),
    'viewer_left_leg': (
        [(810,365),(850,370),(900,381),(950,389),(1000,392),(1050,390),(1100,379),(1150,379),(1200,387),(1250,396),(1300,406),(1333,413)],
        [(810,497),(850,488),(900,480),(950,476),(1000,474),(1050,466),(1100,459),(1150,462),(1200,461),(1250,453),(1300,450),(1333,452)]),
    'viewer_right_leg': (
        [(813,516),(850,523),(900,541),(950,551),(1000,562),(1050,572),(1100,580),(1150,588),(1200,607),(1250,626),(1300,644),(1333,657)],
        [(813,650),(850,649),(900,644),(950,641),(1000,641),(1050,650),(1100,662),(1150,676),(1200,682),(1250,688),(1300,696),(1333,701)])
}
combined=np.zeros((1536,1024),dtype=np.uint8)
for name,points in body_polygons.items():
    region=Image.new('L',pose_image.size,0)
    ImageDraw.Draw(region).polygon(points,fill=255)
    region_array=np.array(region)
    if name in edge_guides:
        left,right=edge_guides[name]
        start=max(left[0][0],right[0][0]); stop=min(left[-1][0],right[-1][0])
        xs_left=boundary(left,start,stop); xs_right=boundary(right,start,stop)
        for y,lx,rx in zip(range(start,stop+1),xs_left,xs_right):
            region_array[y,:]=0
            region_array[y,int(np.ceil(lx+1.5)):int(np.floor(rx-1.5))+1]=255
    combined=np.maximum(combined,region_array)
body_selection=Image.fromarray(combined)
body_draw=ImageDraw.Draw(body_selection)

# Exclude the hair crossing the chest. Its shape and color remain from the pose.
body_draw.polygon([(405,248),(441,236),(469,255),(474,274),(473,296),(465,327),(457,345),(455,378),(447,401),(440,434),(426,457),(416,483),(398,487),(400,469),(410,444),(395,415),(388,393),(387,365),(388,339),(389,313),(395,286)], fill=0)
hard_selection=np.asarray(body_selection,dtype=np.float32)/255.0
soft_selection=np.asarray(body_selection.filter(ImageFilter.GaussianBlur(1.5)),dtype=np.float32)/255.0
spatial_weight=np.minimum(hard_selection,soft_selection)

r, g, b = pose[..., 0], pose[..., 1], pose[..., 2]
luma = 0.2126*r + 0.7152*g + 0.0722*b
skin_valid = (r > g+5) & (g > b+4) & (r/(g+1) < 1.75) & (g/(b+1) < 1.62) & (r/(b+1) < 2.45) & (luma > 65)
confidence = np.clip((luma-65)/55, 0, 1) * skin_valid
body_weight = spatial_weight * confidence
light_scale = np.clip(luma/195.0, 0.45, 1.12)
corrected = np.clip(pose + color_delta[None,None,:] * light_scale[...,None] * body_weight[...,None], 0, 255)

# Copy the original head at its ORIGINAL COORDINATES, without scaling, warping,
# resampling, color changes or new generation. Blend only outside its core.
head_outer = Image.new('L', pose_image.size, 0)
ImageDraw.Draw(head_outer).polygon([
    (415,23),(453,17),(505,20),(548,33),(574,65),(586,110),
    (594,155),(585,193),(568,215),(546,233),(540,253),
    (530,259),(501,258),(482,250),(468,234),(450,223),
    (421,219),(399,200),(388,174),(393,115),(398,65)
], fill=255)
head_outer = head_outer.filter(ImageFilter.GaussianBlur(5.0))

face_core = Image.new('L', pose_image.size, 0)
face_draw = ImageDraw.Draw(face_core)
face_draw.rectangle((430,75,579,220), fill=255)
face_draw.polygon([(457,208),(555,208),(549,224),(540,236),(521,243),(499,237),(478,224)], fill=255)
head_alpha = np.maximum(np.asarray(head_outer,dtype=np.float32),np.asarray(face_core,dtype=np.float32))/255.0
result = np.rint(corrected*(1-head_alpha[...,None]) + source*head_alpha[...,None]).clip(0,255).astype(np.uint8)
result_image = Image.fromarray(result)
result_image.save(OUTPUT)

Image.fromarray(np.rint(body_weight*255).astype(np.uint8)).save(ROOT / 'body-color-mask.png')
Image.fromarray(np.rint(head_alpha*255).astype(np.uint8)).save(ROOT / 'head-copy-mask.png')
face_core.save(ROOT / 'face-exact-pixel-mask.png')

core = np.asarray(face_core) == 255
source_u8 = source.astype(np.uint8)
pose_u8 = pose.astype(np.uint8)
outside = (body_weight == 0) & (head_alpha == 0)
assert np.array_equal(result[core], source_u8[core]), 'Original face pixel lock failed'
assert np.array_equal(result[outside], pose_u8[outside]), 'Pixels outside selected regions changed'

report = {
    'method': 'User-authorized ordinary image editing; Pillow and NumPy; no new generation',
    'authorization': '원본 픽셀을 보존하는 일반 편집으로 전환',
    'sourceFace': str(SOURCE),
    'poseSource': str(POSE),
    'output': str(OUTPUT),
    'sourceFaceSHA256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
    'outputSHA256': hashlib.sha256(OUTPUT.read_bytes()).hexdigest(),
    'size': list(result_image.size),
    'faceCorePixelCount': int(core.sum()),
    'faceCoreChangedRGBChannelsVersusOriginal': int(np.count_nonzero(result[core] != source_u8[core])),
    'faceScaleOrWarpApplied': False,
    'outsideSelectionChangedRGBChannelsVersusPose': int(np.count_nonzero(result[outside] != pose_u8[outside])),
    'medianSkinRGBDelta': [round(float(x),4) for x in color_delta],
    'facePatchMeans': {name:{'original':[round(float(x),2) for x in patch_mean(source_image,box)], 'before':[round(float(x),2) for x in patch_mean(pose_image,box)], 'after':[round(float(x),2) for x in patch_mean(result_image,box)]} for name,box in patches.items()},
    'productionChanged': False,
}
(ROOT/'verification-v10.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')

contact = Image.new('RGB',(1320,620),'#20242a')
draw = ImageDraw.Draw(contact)
box=(400,45,620,335)
for index,(label,img) in enumerate([('ORIGINAL FACE',source_image),('BEFORE CORRECTION',pose_image),('RESTORED ORIGINAL PIXELS',result_image)]):
    contact.paste(img.crop(box).resize((440,580),Image.Resampling.NEAREST),(index*440,40))
    draw.text((index*440+10,12),label,fill='white')
contact.save(ROOT/'face-after-contact.png')
print(json.dumps(report,ensure_ascii=False))
