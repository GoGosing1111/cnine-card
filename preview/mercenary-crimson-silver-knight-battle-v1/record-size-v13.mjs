// A fixed-camera comparison of existing frames, not additional native poses.
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {makePlan,sample} from './skill.mjs';
const root=new URL('./',import.meta.url),before=JSON.parse(await fs.readFile(new URL('qa/v13/before-motion.json',root),'utf8')),after=JSON.parse(await fs.readFile(new URL('manifest.json',root),'utf8')).motion,cache=new Map();
async function frame(m,pose,label){
 const id=label+pose.key+pose.frame;if(cache.has(id))return cache.get(id);
 const spec=m[pose.key],f=spec.frames[pose.frame],fit=400/f.bodyPixels,bytes=await sharp(await fs.readFile(new URL(f.file,root))).resize(Math.round(512*fit),Math.round(512*fit)).png().toBuffer();
 const text=Buffer.from(`<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg"><text x="42" y="54" fill="#ffffff" font-family="Arial" font-size="28">${label} · ${pose.key} / ${pose.frame}</text><path d="M20 900 H1004" stroke="#4e6d88"/></svg>`);
 const composed=await sharp({create:{width:1024,height:1024,channels:4,background:'#111b2b'}}).composite([{input:bytes,left:Math.round(450-256*fit),top:Math.round(900-440*fit)},{input:text}]).png().toBuffer();
 const image=await sharp(composed).resize(640,640).png().toBuffer();cache.set(id,image);return image;
}
const plan=makePlan({mode:'overhead'}),sequence=[{key:'idle',frame:0}],delay=[600];
for(let t=.50;t<3.2;t+=1/20){sequence.push(sample(plan,t).pose);delay.push(70);}sequence.push({key:'idle',frame:0});delay.push(700);
const raw=[];for(const pose of sequence){const left=await frame(before,pose,'BEFORE'),right=await frame(after,pose,'V13');raw.push(await sharp({create:{width:1280,height:640,channels:4,background:'#111b2b'}}).composite([{input:left,left:0,top:0},{input:right,left:640,top:0}]).raw().toBuffer());}
const file=fileURLToPath(new URL('qa/v13/size-comparison.webp',root));await sharp(Buffer.concat(raw),{raw:{width:1280,height:640*raw.length,channels:4,pageHeight:640}}).webp({quality:92,effort:1,loop:0,delay}).toFile(file);console.log(file);
