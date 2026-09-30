import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {partition} from './build-assets.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
for(const [file,count,rows] of [['idle-body-only-v2.png',8,2],['ready-a-body-v3.png',8,2],['ready-b-body-v3.png',8,2],['attack-a-body-v3.png',8,2],['attack-b-body-v3.png',8,2],['dash-body-only-v2.png',8,2],['guard-body-only-v2.png',8,2],['hit-body-only-v2.png',8,2],['defeat-body-only-v2.png',8,2],['cast-body-only-v2.png',12,3],['ultimate-body-only-v2.png',12,3],['recover-body-only-v2.png',12,3]]){
 const raw=await sharp(path.join(root,'assets/source',file)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 try{const {components}=partition(raw,count,rows);console.log(JSON.stringify({file,w:raw.info.width,h:raw.info.height,components:components.map(c=>[c.x0,c.y0,c.x1,c.y1])}));}
 catch(error){console.log(JSON.stringify({file,w:raw.info.width,h:raw.info.height,error:error.message}));}
}
