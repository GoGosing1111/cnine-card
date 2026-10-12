import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../assets/ui/territory-war/renewal-skills-v1/',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex');
const definitions=[
 {code:'ARC_LANCE',slug:'arc-lance',name:'천뢰 관통포',target:'enemy-ground',duration:2.8,impactAt:1.2,anchorRows:[.74,.79,.86,.87]},
 {code:'DISRUPTION_WAVE',slug:'disruption-wave',name:'동력 교란파',target:'enemy-core',duration:2.8,impactAt:1.2,anchorRows:[.52,.50,.50,.50]},
 {code:'CITADEL_REPAIR',slug:'citadel-repair',name:'성채 재건',target:'ally-ground',duration:3.6,impactAt:1.5,anchorRows:[.86,.88,.88,.87]}
];
const assets={};
for(const d of definitions){
 const source=await readFile(new URL(d.slug+'-source.png',root)),meta=await sharp(source).metadata();
 if(!meta.hasAlpha)throw Error(d.code+' requires actual alpha');
 const cell=320,parts=[],frames=[];
 for(let index=0;index<16;index++){
  const row=Math.floor(index/4),col=index%4,left=Math.round(col*meta.width/4),top=Math.round(row*meta.height/4),width=Math.round((col+1)*meta.width/4)-left,height=Math.round((row+1)*meta.height/4)-top;
  const buffer=await sharp(source).extract({left,top,width,height}).resize(cell,cell).png().toBuffer();
  const raw=await sharp(buffer).ensureAlpha().raw().toBuffer();
  let opaque=0,transparent=0,edge=0;
  for(let y=0;y<cell;y++)for(let x=0;x<cell;x++){const alpha=raw[(y*cell+x)*4+3];if(alpha>127)opaque++;if(!alpha)transparent++;if((x===0||x===cell-1||y===0||y===cell-1)&&alpha>127)edge++;}
  if(opaque<5||transparent<cell*cell*.1)throw Error(d.slug+' frame '+index+' invalid alpha');
  parts.push({input:buffer,left:col*cell,top:row*cell});
  frames.push({x:col*cell,y:row*cell,w:cell,h:cell,anchor:[.5,d.anchorRows[row]],source:{x:left,y:top,w:width,h:height},sha256:hash(buffer),opaquePixels:opaque,transparentPixels:transparent,opaqueBorderPixels:edge});
  if(index===8){const icon=await sharp(buffer).webp({quality:94,alphaQuality:100}).toBuffer();await writeFile(new URL(d.slug+'-icon.webp',root),icon);}
 }
 const atlas=await sharp({create:{width:cell*4,height:cell*4,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(parts).webp({quality:94,alphaQuality:100,effort:6}).toBuffer();
 await writeFile(new URL(d.slug+'-atlas.webp',root),atlas);
 assets[d.code]={name:d.name,source:d.slug+'-source.png',sourceSha256:hash(source),sourceSize:[meta.width,meta.height],url:'/assets/ui/territory-war/renewal-skills-v1/'+d.slug+'-atlas.webp',icon:'/assets/ui/territory-war/renewal-skills-v1/'+d.slug+'-icon.webp',sha256:hash(atlas),bytes:atlas.length,columns:4,rows:4,anchor:frames[0].anchor,target:d.target,duration:d.duration,impactAt:d.impactAt,frames};
}
const manifest={version:'20261013-renewal-v1',generator:'built-in image_gen',visualApproval:'USER_REVIEW_PENDING',promptSet:'preview/territory-renewal-20261013-v1/fx-prompts.json',runtime:'Existing Project V V3 effectScene, PixiJS 8.20.0 / registered GSAP 3.13.0 timeline',processing:'Original PNGs preserved. Technical grid extraction, uniform frame packing and WebP encoding only. Generated alpha preserved; no recoloring, keying or drawn replacement effects.',assets,constraints:['16 independently drawn changing frames per skill','Single shared clock, no autonomous AnimatedSprite or second renderer','Target/current front derived from server event; no client damage or resources','No screen fog, blur, white wash, new synthesized sounds']};
await writeFile(new URL('manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(assets).map(([k,a])=>[k,{frames:a.frames.length,bytes:a.bytes,maxOpaqueBorder:Math.max(...a.frames.map(f=>f.opaqueBorderPixels))}]))));
