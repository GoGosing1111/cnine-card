import fs from 'node:fs/promises';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
const root=new URL('./',import.meta.url),m=JSON.parse(await fs.readFile(new URL('manifest.json',root),'utf8'));
const keys=['twohandGrip','twohandLift','twohandStrike','twohandReturn'];
const poses=[],hands=[];
for(const [row,key] of keys.entries())for(let i=0;i<4;i++)poses.push({input:await sharp(await fs.readFile(new URL(m.motion[key].frames[i].file,root))).flatten({background:'#132034'}).png().toBuffer(),left:i*512,top:row*512});
await sharp({create:{width:2048,height:2048,channels:4,background:'#132034'}}).composite(poses).png().toFile(fileURLToPath(new URL('qa/v10-twohand-poses.png',root)));
for(const [key,n] of [['twohandGrip',1],['twohandGrip',3],['twohandLift',1],['twohandLift',2],['twohandStrike',1],['twohandStrike',2],['twohandReturn',0],['twohandReturn',1]]){
 const f=m.motion[key].frames[n],left=Math.max(0,Math.min(416,Math.round(f.grip[0]-48))),top=Math.max(0,Math.min(416,Math.round(f.grip[1]-48)));
 const input=await sharp(await fs.readFile(new URL(f.file,root))).extract({left,top,width:96,height:96}).resize(288,288).flatten({background:'#132034'}).png().toBuffer();
 hands.push({input,left:hands.length%4*288,top:Math.floor(hands.length/4)*288});
}
await sharp({create:{width:1152,height:576,channels:4,background:'#132034'}}).composite(hands).png().toFile(fileURLToPath(new URL('qa/v10-twohand-grips.png',root)));
