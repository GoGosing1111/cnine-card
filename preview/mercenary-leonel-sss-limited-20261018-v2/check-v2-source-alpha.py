from PIL import Image
from pathlib import Path
import numpy as np,json
p=Path(__file__).parent/'assets/sources'
names=['fx-aura-v2.png']+['fx-'+n+'-v2-candidate1.png' for n in ['slash','crosscut','ultimate','fracture','pressure-retry']]
out=[]
for n in names:
 im=Image.open(p/n).convert('RGBA');a=np.array(im)[:,:,3];w,h=im.size;frames=[]
 for i in range(12):
  x0,x1=round(i%4*w/4),round((i%4+1)*w/4);y0,y1=round(i//4*h/3),round((i//4+1)*h/3);b=a[y0:y1,x0:x1];edge=np.concatenate([b[0],b[-1],b[:,0],b[:,-1]])
  frames.append({'index':i,'edge128':int((edge>128).sum()),'edge16':int((edge>16).sum()),'transparent':float((b<16).mean())})
 out.append({'source':n,'size':[w,h],'frames':frames})
print(json.dumps(out))
