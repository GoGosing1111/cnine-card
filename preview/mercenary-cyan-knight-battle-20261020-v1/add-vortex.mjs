import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url),m=JSON.parse(await fs.readFile(new URL('manifest.json',root))),url='assets/sources/fx-vortex-v2.png',bytes=await fs.readFile(new URL(url,root)),meta=await sharp(bytes).metadata();
m.effects['vortex-v2']={url,columns:4,rows:3,width:meta.width,height:meta.height,sha256:createHash('sha256').update(bytes).digest('hex'),frames:Array.from({length:12},(_,i)=>{const x=Math.round(i%4*meta.width/4)+3,y=Math.round(Math.floor(i/4)*meta.height/3)+3;return{index:i,rect:{x,y,width:Math.round((i%4+1)*meta.width/4)-x-3,height:Math.round((Math.floor(i/4)+1)*meta.height/3)-y-3}};})};
m.summary.effectFrames=108;m.version='CYAN_KNIGHT_BATTLE_REVIEW_20261020_ARRAY_V2';m.rejectedVersions=[{version:'ARRAY_V1',reason:'User rejected weak multi-sword ultimate; V2 reauthors cutting trajectories, impact timing, painted effects and camera.'}];
await fs.writeFile(new URL('manifest.json',root),JSON.stringify(m,null,2)+'\n');
