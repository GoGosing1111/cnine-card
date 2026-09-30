// Inspection playback only: native drawn frames, with equal anatomical scale.
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
const root=new URL('./',import.meta.url),m=JSON.parse(await fs.readFile(new URL('manifest.json',root),'utf8'));
const sequence=[...Array(4).fill(['idle',0]),...Array.from({length:12},(_,i)=>['ready',i]),...Array.from({length:8},(_,i)=>['attack',i]),...Array.from({length:4},(_,i)=>['recover',i]),...Array(4).fill(['idle',0])],buffers=[],delay=[];
for(const [key,i] of sequence){const f=m.motion[key].frames[i],fit=400/f.bodyPixels,bytes=await sharp(await fs.readFile(new URL(f.file,root))).resize(Math.round(512*fit),Math.round(512*fit)).png().toBuffer();
 const composite=await sharp({create:{width:1024,height:1024,channels:4,background:'#111b2b'}}).composite([{input:bytes,left:Math.round(512-256*fit),top:Math.round(860-440*fit)}]).png().toBuffer();
 const png=await sharp(composite).resize(768,768).ensureAlpha().raw().toBuffer();buffers.push(png);delay.push(key==='attack'?110:130);}
await sharp(Buffer.concat(buffers),{raw:{width:768,height:768*buffers.length,channels:4,pageHeight:768}}).webp({quality:88,effort:1,loop:0,delay}).toFile(fileURLToPath(new URL('qa/motion-v5-slow.webp',root)));
console.log('Saved slow drawn-frame review, '+buffers.length+' playback samples. Repeated poses are not new artwork.');
