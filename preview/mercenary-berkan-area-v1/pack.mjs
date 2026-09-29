import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex');
const source=await fs.readFile(new URL('assets/source/arrow-rain-v1.png',root)),meta=await sharp(source).metadata();
if(!meta.hasAlpha||meta.width!==meta.height)throw Error('Expected square 4x4 RGBA sheet');
const rawCell=320,pad=32,cellSize=rawCell+pad*2,frames=[],inputs=[];
const normalized=await sharp(source).resize(rawCell*4,rawCell*4).png().toBuffer();
await fs.mkdir(new URL('assets/frames/',root),{recursive:true});
for(let i=0;i<16;i++){
 const file=`assets/frames/arrow-rain-${String(i).padStart(2,'0')}.png`;
 const png=await sharp(normalized).extract({left:i%4*rawCell,top:Math.floor(i/4)*rawCell,width:rawCell,height:rawCell}).extend({top:pad,bottom:pad,left:pad,right:pad,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
 await fs.writeFile(new URL(file,root),png);inputs.push({input:png,left:i%4*cellSize,top:Math.floor(i/4)*cellSize});
 frames.push({file,sha256:hash(png),anchor:{x:.5,y:(pad+rawCell*.87)/cellSize}});
}
const atlas=await sharp({create:{width:cellSize*4,height:cellSize*4,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(inputs).png().toBuffer();
await fs.writeFile(new URL('assets/arrow-rain-atlas-v1.png',root),atlas);
const manifest={format:'BERKAN_AREA_SKILL_REVIEW_V1',name:'흑금 천우',code:'V-055',status:'USER_APPROVED_LIVE_PVE',runtimeEnabled:true,skillId:'MS-056',approvedAt:'2026-09-30',battleModes:['PVE'],
 renderer:{pixi:'8.20.0',gsap:'3.13.0',clock:'V3_REGISTERED_GSAP',maxSprites:40},
 source:{file:'assets/source/arrow-rain-v1.png',sha256:hash(source),width:meta.width,height:meta.height,hasAlpha:meta.hasAlpha,tool:'image_gen',prompt:'generation-prompt.txt'},
 arrowRainArea:{atlas:'../mercenary-berkan-area-v1/assets/arrow-rain-atlas-v1.png',sha256:hash(atlas),frameCount:16,columns:4,rows:4,cellSize,frames},
 timing:{duration:3.4,release:1.05,contact:1.62,settled:3.22},target:'ALL_ENEMIES',damageAuthority:'NONE_VISUAL_PREVIEW'};
await fs.writeFile(new URL('manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({source:manifest.source,atlasBytes:atlas.length,frames:16}));
