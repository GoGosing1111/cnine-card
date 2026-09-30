// Enlarged native artwork inspection. Repeated playback samples are not new art.
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {makePlan,sample} from './skill.mjs';
const root=new URL('./',import.meta.url),m=JSON.parse(await fs.readFile(new URL('manifest.json',root),'utf8')),cache=new Map();
async function frame(key,n){
 const id=key+':'+n;if(cache.has(id))return cache.get(id);
 const f=m.motion[key].frames[n],fit=400/f.bodyPixels,bytes=await sharp(await fs.readFile(new URL(f.file,root))).resize(Math.round(512*fit),Math.round(512*fit)).png().toBuffer();
 const composite=await sharp({create:{width:1024,height:1024,channels:4,background:'#111b2b'}}).composite([{input:bytes,left:Math.round(512-256*fit),top:Math.round(860-440*fit)}]).png().toBuffer();
 const raw=await sharp(composite).resize(768,768).ensureAlpha().raw().toBuffer();cache.set(id,raw);return raw;
}
async function save(file,sequence){const buffers=[],delay=[];for(const [key,n,ms] of sequence){buffers.push(await frame(key,n));delay.push(ms);}await sharp(Buffer.concat(buffers),{raw:{width:768,height:768*buffers.length,channels:4,pageHeight:768}}).webp({quality:90,effort:1,loop:0,delay}).toFile(fileURLToPath(new URL(file,root)));}
const plan=makePlan({mode:'overhead'}),normal=[['idle',0,600]];
for(let t=.42;t<3.35;t+=1/30){const p=sample(plan,t).pose;normal.push([p.key,p.frame,33]);}normal.push(['idle',0,700]);
await save('qa/motion-v10-twohand-preview.webp',normal);
const slow=[['idle',0,650],...['twohandGrip','twohandLift','twohandStrike','twohandReturn'].flatMap(key=>m.motion[key].frames.map((f,i)=>[key,i,key==='attack'?140:190])),['idle',0,700]];
await save('qa/motion-v10-twohand-slow.webp',slow);
console.log('V10 actual-timing attack and individual-pose slow review saved.');
