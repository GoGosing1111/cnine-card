import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const root=process.cwd(),base=path.join(root,'assets/ui/pets/rework-20261114');
const gen='C:/Users/User/.codex/generated_images/01a1d8d6-19d2-79e3-81ac-3571cea25bed';
await fs.mkdir(base,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const entries=[];
async function persist(name,file,kind){
 const data=await fs.readFile(path.join(gen,file));await fs.writeFile(path.join(base,name+'-source.png'),data);
 const meta=await sharp(data).metadata();let runtime;
 if(kind==='icon')runtime=await sharp(data).resize(192,192,{fit:'inside'}).webp({quality:88,alphaQuality:100}).toBuffer();
 else{
  const parts=[];
  for(let i=0;i<12;i++){const left=Math.round(i%4*meta.width/4),top=Math.round(Math.floor(i/4)*meta.height/3),right=Math.round((i%4+1)*meta.width/4),bottom=Math.round((Math.floor(i/4)+1)*meta.height/3);
   const frame=await sharp(data).extract({left,top,width:right-left,height:bottom-top}).resize(256,256,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
   parts.push({input:frame,left:i%4*256,top:Math.floor(i/4)*256});
   if(i===6)await fs.writeFile(path.join(base,name.replace('-atlas','')+'-icon.webp'),await sharp(frame).resize(192,192).webp({quality:88,alphaQuality:100}).toBuffer());
  }
  runtime=await sharp({create:{width:1024,height:768,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(parts).webp({quality:88,alphaQuality:100}).toBuffer();
 }
 await fs.writeFile(path.join(base,name+'.webp'),runtime);
 entries.push({name,source:name+'-source.png',sourceHash:sha(data),sourceBytes:data.length,runtime:name+'.webp',runtimeHash:sha(runtime),runtimeBytes:runtime.length,alpha:meta.hasAlpha,processing:'Encoding, proportional resize and atlas packing only; original image pixels retained in source PNG.'});
}
await persist('stat-dice','exec-8edb963f-5e92-42d1-8482-d6180873d145.png','icon');
await persist('trait-dice','exec-a3e1afa8-9216-4391-86c1-ecedd2da614e.png','icon');
await persist('hunter-atlas','exec-de2b49be-b1df-493e-9df4-97347dc80b84.png','atlas');
await persist('luck-atlas','exec-6080da9b-cf64-47d4-9cb2-6dbfc6c2a68c.png','atlas');
// Read-only recovery of existing runtime assets omitted from this sparse checkout.
for(const file of ['assets/ui/mercenary-codex/command-20261021/panel-v3.webp','assets/ui/mercenary-codex/command-20261021/action-user-approved.webp',...['attack','defense','vitality','speed','barrier'].flatMap(slug=>['atlas','icon'].map(type=>'assets/ui/pets/buffs-v1/'+slug+'-'+type+'.webp'))]){
 try{await fs.access(file);}catch{try{const b=execFileSync('git',['show','HEAD:'+file],{cwd:root,maxBuffer:8e6,stdio:['ignore','pipe','ignore']});await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,b);}catch{throw Error('Existing approved asset missing: '+file);}}
}
await fs.writeFile(path.join(base,'manifest.json'),JSON.stringify({date:'2026-11-14',status:'LOCAL_REVIEW_NOT_LIVE',generator:'Built-in image_gen',prompts:'preview/pet-rework-20261114/prompts.json',entries,reused:'Original ImageGen pet buff atlases and approved codex panel/action textures. No generated geometry icons.'},null,2));
console.log(JSON.stringify(entries.map(x=>({name:x.name,sourceBytes:x.sourceBytes,runtimeBytes:x.runtimeBytes,alpha:x.alpha}))));
