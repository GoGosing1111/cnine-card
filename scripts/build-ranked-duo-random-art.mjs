import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const dir=path.resolve('assets/ui/ranked-duo/random-20261020');
await fs.mkdir(dir,{recursive:true});
const sources={panel:'C:/Users/User/.codex/generated_images/01a15762-c2ef-7921-bd1a-1b0ea9aa776c/exec-8ca5b07c-44d1-4ca7-ac87-b06d70292019.png',control:'C:/Users/User/.codex/generated_images/01a15762-c2ef-7921-bd1a-1b0ea9aa776c/exec-19181bc8-113d-4ffd-946a-3f41d6b96b4a.png'};
const assets=[];
for(const [name,source]of Object.entries(sources)){
 const original=path.join(dir,name+'-source.png');
 try{await fs.access(original);}catch{await fs.copyFile(source,original);}
 const bytes=await fs.readFile(original),metadata=await sharp(bytes).metadata();
 const pipeline=name==='panel'?sharp(bytes).extract({left:10,top:78,width:1516,height:820}):sharp(bytes).trim();
 const target=path.join(dir,name+'.webp');await pipeline.webp({quality:92,alphaQuality:100}).toFile(target);
 const derivative=await fs.readFile(target),output=await sharp(derivative).metadata();
 assets.push({name,source:name+'-source.png',sourceSha256:createHash('sha256').update(bytes).digest('hex'),sourceSize:[metadata.width,metadata.height],sourceHasAlpha:metadata.hasAlpha,webp:name+'.webp',sha256:createHash('sha256').update(derivative).digest('hex'),size:[output.width,output.height],hasAlpha:output.hasAlpha,processing:name==='panel'?'crop exterior margins, WebP export':'trim transparent margins, WebP export'});
}
await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify({date:'2026-10-20',generator:'built-in image_gen',approval:'TECHNICAL_QA_PENDING_USER_VISUAL_APPROVAL_NOT_ASSUMED',prompts:'prompts.json',consumers:['css/ranked-duo-random-v4.css','js/ranked-duo-random-v4.mjs','admin/ranked-duo-v1.css'],assets},null,2)+'\n');
console.log(JSON.stringify(assets.map(({name,size,hasAlpha})=>({name,size,hasAlpha}))));
