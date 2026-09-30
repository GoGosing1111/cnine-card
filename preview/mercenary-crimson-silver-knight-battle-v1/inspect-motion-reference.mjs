// Read-only analysis of the user-provided animation, never production art.
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
const root=new URL('./',import.meta.url),source='C:/Users/User/Documents/Honeycam/Honeycam 2026-10-01 06-29-24.gif';
const meta=await sharp(source,{animated:true}).metadata(),times=[0];for(const ms of meta.delay)times.push(times.at(-1)+ms);
await fs.mkdir(new URL('qa/reference/',root),{recursive:true});
const indices=process.argv.includes('--fine')?Array.from({length:30},(_,i)=>i):Array.from({length:18},(_,i)=>Math.min(meta.pages-1,i*8));
const layers=[];
for(const [j,i] of indices.entries()){
 const crop=await sharp(source,{page:i,pages:1}).extract({left:520,top:125,width:340,height:260}).resize(408,312).png().toBuffer();
 const label=Buffer.from(`<svg width="408" height="28"><rect width="408" height="28" fill="#101826"/><text x="12" y="20" fill="white" font-size="17">${i} | ${(times[i]/1000).toFixed(2)}s</text></svg>`);
 layers.push({input:crop,left:j%6*408,top:Math.floor(j/6)*340+28},{input:label,left:j%6*408,top:Math.floor(j/6)*340});
}
const out=new URL('qa/reference/'+(process.argv.includes('--fine')?'first-cycle':'overview')+'.png',root);
await sharp({create:{width:2448,height:Math.ceil(indices.length/6)*340,channels:4,background:'#101826'}}).composite(layers).png().toFile(fileURLToPath(out));
await fs.writeFile(new URL('qa/reference/metadata.json',root),JSON.stringify({source,pages:meta.pages,durationMs:times.at(-1),frameTimesMs:times},null,2)+'\n');
console.log(JSON.stringify({out:fileURLToPath(out),duration:times.at(-1),pages:meta.pages}));
