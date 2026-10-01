import fs from 'node:fs/promises';
import sharp from 'sharp';
import {root,sha} from './compose-weapon.mjs';
import path from 'node:path';
const read=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
const m=await read('manifest.json'),landmarks=await read('size-landmarks-v13.json');
const out=path.join(root,'qa/v13');await fs.mkdir(out,{recursive:true});
let before;
try{before=await read('qa/v13/before-motion.json');}catch(e){if(e.code!=='ENOENT'||m.version!==12)throw e;before=m.motion;await fs.writeFile(path.join(out,'before-motion.json'),JSON.stringify(before,null,2)+'\n');}
const chain=p=>p.slice(1).reduce((n,b,i)=>n+Math.hypot(b[0]-p[i][0],b[1]-p[i][1]),0);
const baseline=chain(landmarks.anchor.points),body=400;
const records=[];
for(const key of ['twohandGrip','twohandLift','twohandStrike','twohandReturn'])for(const [i,f] of before[key].frames.entries()){
 const points=landmarks.poses[key][i],standing=landmarks.standingHeights?.[key+':'+i],reference=standing?Math.round(standing/(692/694)):Math.round(694*chain(points)/baseline);
 records.push({key,index:i,source:f.source,sourceIndex:f.sourceIndex,points,sourceHash:sha(await fs.readFile(path.join(root,f.source))),chain:chain(points),oldReference:f.sourceBodyPixels,reference,uniformCorrection:f.sourceBodyPixels/reference,method:standing?'NEUTRAL_STANDING_HEIGHT':'ARTICULATED_BODY_CHAIN'});
}
await fs.writeFile(path.join(out,'scale-estimates.json'),JSON.stringify({anchor:landmarks.anchor,baseline,records},null,2)+'\n');
if(process.argv.includes('--before')){
 for(const key of ['twohandGrip','twohandLift','twohandStrike','twohandReturn']){
  const rows=records.filter(r=>r.key===key&&r.index<4),source=path.join(root,rows[0].source),svg=Buffer.from(`<svg width="1024" height="1536" xmlns="http://www.w3.org/2000/svg">${rows.map(r=>`<polyline points="${r.points.map(p=>p.join(',')).join(' ')}" fill="none" stroke="#00e5ff" stroke-width="3"/>${r.points.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="#fffd6a"/><text x="${p[0]+7}" y="${p[1]}" font-size="16" fill="white">${i}</text>`).join('')}`).join('')}</svg>`);
  await sharp(source).flatten({background:'#152235'}).composite([{input:svg}]).png().toFile(path.join(out,key+'-landmarks.png'));
 }
}
// Fixed world size and floor, unlike an atlas thumbnail grid. Full lifted blades fit.
async function card(spec,f,key,index){
 const fit=body/f.bodyPixels,s=await sharp(path.join(root,f.file)).resize(Math.round(spec.cellSize*fit),Math.round(spec.cellSize*fit)).png().toBuffer();
 const left=Math.round(1340-f.footAnchor.x*spec.cellSize*fit),top=Math.round(1740-f.footAnchor.y*spec.cellSize*fit);
 const label=Buffer.from(`<svg width="800" height="800" xmlns="http://www.w3.org/2000/svg"><path d="M0 741 H800" stroke="#47758c"/><text x="20" y="28" fill="white" font-family="Arial" font-size="21">${key} / ${index}</text><path d="M338 340 h6 M340 340 v400" stroke="#487180" opacity=".35"/></svg>`);
 const stage=await sharp({create:{width:2600,height:2600,channels:4,background:'#111c2c'}}).composite([{input:s,left,top}]).png().toBuffer();return sharp(stage).extract({left:1000,top:1000,width:800,height:800}).composite([{input:label}]).png().toBuffer();
}
const motions=process.argv.includes('--before')?before:m.motion,suffix=process.argv.includes('--before')?'before':'after';
for(const key of ['twohandGrip','twohandLift','twohandStrike','twohandReturn','dash','hit','defeat']){
 const list=[{key:'idle',f:motions.idle.frames[0],s:motions.idle},...motions[key].frames.map(f=>({key,f,s:motions[key]}))],tiles=[];
 for(const [i,p] of list.entries())tiles.push({input:await card(p.s,p.f,p.key,p.f.index),left:(i%3)*800,top:Math.floor(i/3)*800});
 await sharp({create:{width:2400,height:Math.ceil(list.length/3)*800,channels:4,background:'#111c2c'}}).composite(tiles).png().toFile(path.join(out,`${key}-${suffix}.png`));
}
console.log(JSON.stringify(records.map(r=>({key:r.key,i:r.index,old:r.oldReference,new:r.reference,correction:+r.uniformCorrection.toFixed(4)}))));
