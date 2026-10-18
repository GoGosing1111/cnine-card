from PIL import Image
from pathlib import Path
import numpy as np,json
p=Path(r'C:/Users/User/.codex/worktrees/defense-join-fix-20261018/cnine-card/preview/mercenary-leonel-sss-limited-20261018-v2/assets/sources')
for n in ['fx-crosscut-v2-candidate1.png','fx-fracture-v2-candidate1.png']:
 a=np.array(Image.open(p/n).convert('RGBA'))[:,:,3];h,w=a.shape;out=[]
 for i in range(12):
  x0,x1=round(i%4*w/4),round((i%4+1)*w/4);yy=[0,333,666,h] if 'fracture' in n else [0,round(h/3),round(h*2/3),h];y0,y1=yy[i//4],yy[i//4+1];b=a[y0:y1,x0:x1];y,x=np.where(b>64)
  out.append([i,[int((k>128).sum()) for k in [b[:,0],b[:,-1],b[0],b[-1]]],[int(x.min()),int(y.min()),int(x.max()),int(y.max())]])
 print(n,out)
