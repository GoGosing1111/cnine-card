import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const root=new URL('./',import.meta.url),m=JSON.parse(await fs.readFile(new URL('manifest.json',root),'utf8'));
const picks=[['idle',0],['ready',0],['ready',7],['ready',11],['attack',0],['attack',3],['attack',6],['recover',3],['dash',2]];
const layers=[],hands=[];
for(const [i,[key,n]] of picks.entries()){
 const f=m.motion[key].frames[n],bytes=await fs.readFile(new URL(f.file,root)),factor=285/f.bodyPixels,w=Math.round(512*factor),h=w,left=Math.round(260-256*factor),top=Math.round(460-440*factor);
 const large=await sharp({create:{width:800,height:900,channels:4,background:'#132034'}}).composite([{input:await sharp(bytes).resize(w,h).png().toBuffer(),left:Math.round(400-256*factor),top:Math.round(820-440*factor)}]).png().toBuffer();
 const fitted=await sharp(large).resize(400,450).png().toBuffer();layers.push({input:fitted,left:(i%3)*400,top:Math.floor(i/3)*450});
 if(f.grip){const x=Math.max(0,Math.round(f.grip[0])-28),y=Math.max(0,Math.round(f.grip[1])-28),crop=await sharp(bytes).extract({left:x,top:y,width:56,height:56}).resize(224,224).flatten({background:'#142036'}).png().toBuffer();hands.push({input:crop,left:hands.length*224,top:0});}
}
await sharp({create:{width:1200,height:1350,channels:4,background:'#132034'}}).composite(layers).png().toFile(new URL('qa/v5-normalized-poses.png',root).pathname.slice(1));
await sharp({create:{width:hands.length*224,height:224,channels:4,background:'#142036'}}).composite(hands).png().toFile(new URL('qa/v5-grip-details.png',root).pathname.slice(1));
