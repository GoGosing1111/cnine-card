import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const root=process.cwd(),qa='docs/qa/tower-monsters-20261022/',runtime='assets/ui/tower-monsters-20261022/';
const prompts=JSON.parse(await fs.readFile(qa+'prompts.json','utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
await fs.mkdir(runtime,{recursive:true});
const sprites=[];
for(const row of prompts.rows){
 const source=qa+'sources/'+row.key+'-v1.png',bytes=await fs.readFile(source);
 const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let left=info.width,top=info.height,right=0,bottom=0,empty=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const a=data[(y*info.width+x)*4+3];if(a===0)empty++;if(a>8){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}
 if(empty/info.width/info.height<.1)throw Error('Transparency missing: '+row.key);
 // Deterministic packing only: retain original art/alpha; fit a common foot line.
 const bounds={left:Math.max(0,left-3),top:Math.max(0,top-3),width:Math.min(info.width,right+4)-Math.max(0,left-3),height:Math.min(info.height,bottom+4)-Math.max(0,top-3)};
 const sprite=await sharp(bytes).extract(bounds).resize({width:576,height:552,fit:'inside',withoutEnlargement:true}).png().toBuffer();
 const size=await sharp(sprite).metadata(),output=runtime+row.key+'.webp';
 await sharp({create:{width:640,height:640,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:sprite,left:Math.floor((640-size.width)/2),top:576-size.height}]).webp({quality:86,alphaQuality:100,effort:6}).toFile(output);
 const webp=await fs.readFile(output);
 sprites.push({monsterId:row.monsterId,key:row.key,name:row.name,role:row.role,image:'/'+output,battleSprite:'/'+output,source,sourceSha256:sha(bytes),sha256:sha(webp),bytes:webp.length,canvas:{width:640,height:640},footAnchor:{x:.5,y:.9},artFacing:-1,sourceBounds:bounds,sourceTransparentRatio:empty/info.width/info.height});
}
await fs.writeFile(runtime+'manifest.json',JSON.stringify({version:'TOWER_MONSTERS_20261022_V1',scope:'TOWER_ONLY',tool:'builtin image_gen',prompts:qa+'prompts.json',visualApproval:null,notes:'User requested complete Tower resource replacement. Technical verification is not user visual approval. Original source PNGs preserved; WebPs use alpha trim, proportional resize and transparent padding only.',sprites},null,2)+'\n');
console.log({sprites:sprites.length,totalRuntimeBytes:sprites.reduce((n,r)=>n+r.bytes,0),maxBytes:Math.max(...sprites.map(r=>r.bytes))});
