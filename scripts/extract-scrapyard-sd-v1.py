"""2026-09-11 user approval: remove only the four generated checker backgrounds.
The connected neutral matte is removed without repainting any foreground RGB.
"""
import json, hashlib, sys
from pathlib import Path
import numpy as np
import cv2
from PIL import Image

root=Path(__file__).resolve().parent.parent
assets=root/'preview/scrapyard-v3-v1/assets'
jobs=['polarity','atlas','ravager','moloch']
expected={'polarity':'eed0e7e1d092e0e967ed8a5d9a26b6697fdca5f52b0cccef01c623c96b31d0b9',
 'atlas':'c1317b2fbea7d3e3dece115fb3bfec8cba93e5e19bc73953f34a3976c08bfb33',
 'ravager':'41d1b14d1f62e8126ba16138b60e864ec301f32c56b33567dfe9627f0967d1ef',
 'moloch':'86af2a32e3a26459ef7fd2781e6a20583cc47427f433b8a8ce2a1693aec948f3'}
report=[]
for code in jobs:
    source=assets/f'{code}-sd-source-v1.png'
    if hashlib.sha256(source.read_bytes()).hexdigest()!=expected[code]:
        raise RuntimeError('Source changed; review the new background before extraction: '+code)
    rgb=np.array(Image.open(source).convert('RGB'))
    h,w,_=rgb.shape
    spread=np.ptp(rgb.astype(np.int16),axis=2)
    light=rgb.mean(axis=2)
    candidate=((spread<=22)&(light>=185)).astype(np.uint8)
    n,labels,stats,_=cv2.connectedComponentsWithStats(candidate,4)
    borders=set(np.unique(np.concatenate([labels[0],labels[-1],labels[:,0],labels[:,-1]])))
    borders.discard(0)
    apertures={'polarity':[(300,340),(846,306),(842,403),(559,206),(638,210)]}
    for x,y in apertures.get(code,[]):
        if candidate[y,x]:borders.add(labels[y,x])
    outside=np.isin(labels,list(borders))
    # No global white/gray color key: pale metal enclosed by its dark outline
    # remains opaque. Only connected exterior/background apertures are removed.
    alpha=np.where(outside,0,255).astype(np.uint8)
    dist=cv2.distanceTransform(alpha,cv2.DIST_L2,3)
    alpha[(dist>0)&(dist<1.1)]=170
    if code=='atlas':
        # Soft cyan exhaust already belongs to the source; matte only its
        # outer transition into the painted gray background.
        exhaust=np.indices((h,w))[0]<110
        alpha[exhaust]=np.minimum(alpha[exhaust],np.clip(dist[exhaust]/3*255,0,255).astype(np.uint8))
    rgba=np.dstack([rgb,alpha])
    output=assets/f'{code}-sd-v1.png'
    Image.fromarray(rgba).save(output,optimize=True)
    y,x=np.where(alpha>16)
    report.append({'code':code,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
      'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'width':w,'height':h,
      'bounds':{'x':int(x.min()),'y':int(y.min()),'width':int(x.max()-x.min()+1),'height':int(y.max()-y.min()+1)},
      'transparentPixels':int((alpha==0).sum()),'opaqueRgbChanged':int(np.any(rgba[:,:,:3]!=rgb,axis=2).sum()),
      'status':'TECH_QA_COMPLETE_USER_REVIEW_PENDING'})
    # Review contact sheet contains composited copies, never production pixels.
    for name,color in [('dark',(13,23,30)),('light',(225,229,226))]:
      bg=Image.new('RGBA',(w,h),color+(255,));bg.alpha_composite(Image.fromarray(rgba))
      bg.convert('RGB').resize((500,500)).save(root/f'tmp/v3-overhaul-ready-20260911/{code}-{name}.png')
(assets.parent/'sd-completion-qa-v1.json').write_text(json.dumps({'method':'CONNECTED_BACKGROUND_ONLY','userAuthorized':'2026-09-11','assets':report},indent=2)+'\n',encoding='utf8')
print(json.dumps(report))
