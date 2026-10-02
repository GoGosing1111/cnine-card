import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {APOCALYPSE_SHANKS_SHISUI_BOSSES as BOSSES} from '../shared/apocalypse-shanks-shisui-v1.mjs';
const digest=data=>createHash('sha256').update(data).digest('hex');
const files=[];
for(const boss of BOSSES){
 for(const asset of [boss.sourceArt,boss.battleSprite,...boss.skills.map(s=>s.atlas.replace('-atlas.json','-sheet.png'))]){
  const path=asset.slice(1),buffer=await fs.readFile(path),meta=await sharp(buffer).metadata();
  const row={path,width:meta.width,height:meta.height,sha256:digest(buffer)};
  if(path.endsWith('.png')){
   if(!meta.hasAlpha)throw Error('Missing alpha: '+path);
   const {data,info}=await sharp(buffer).raw().toBuffer({resolveWithObject:true});
   let clear=0,visible=0;for(let i=3;i<data.length;i+=4){clear+=data[i]===0;visible+=data[i]>24;}
   row.transparentRatio=clear/(info.width*info.height);row.visibleRatio=visible/(info.width*info.height);
   if(info.channels!==4||row.transparentRatio<.10||row.visibleRatio<.005)throw Error('Invalid alpha: '+path);
  }
  files.push(row);
 }
 for(const skill of boss.skills){
  const sheet=skill.atlas.replace('-atlas.json','-sheet.png'),meta=files.find(f=>f.path===sheet.slice(1));
  const w=Math.floor(meta.width/4),h=Math.floor(meta.height/3),frames={},frameQa=[];
  for(let i=0;i<12;i++){
   const x=i%4*w,y=Math.floor(i/4)*h;
   const {data,info}=await sharp(sheet.slice(1)).extract({left:x,top:y,width:w,height:h}).raw().toBuffer({resolveWithObject:true});
   let visible=0,clear=0,border=0,borderCount=0;
   for(let py=0;py<h;py++)for(let px=0;px<w;px++){
    const alpha=data[(py*w+px)*info.channels+3];visible+=alpha>24;clear+=alpha===0;
    if(px<2||py<2||px>=w-2||py>=h-2){border+=alpha>24;borderCount++;}
   }
   if(visible<20||clear<20)throw Error('Empty/opaque frame '+skill.code+':'+i);
   frameQa.push({index:i,sha256:digest(data),visibleRatio:visible/(w*h),borderRatio:border/borderCount});
   frames[skill.asset+'_'+String(i).padStart(2,'0')]={frame:{x,y,w,h},rotated:false,trimmed:false,spriteSourceSize:{x:0,y:0,w,h},sourceSize:{w,h}};
  }
  if(new Set(frameQa.map(f=>f.sha256)).size!==12)throw Error('Repeated static frames: '+skill.code);
  const atlas={frames,meta:{image:sheet.split('/').pop(),format:'RGBA8888',size:{w:meta.width,h:meta.height},scale:'1',collisionFrame:6,impactAt:skill.impactAt,sha256:meta.sha256}};
  await fs.writeFile(skill.atlas.slice(1),JSON.stringify(atlas,null,2)+'\n');
  files.find(f=>f.path===sheet.slice(1)).frames=frameQa;
 }
}
const manifest={generator:'built-in image_gen',pixelEdits:false,sourceArtPreserved:true,bosses:BOSSES.map(b=>({id:b.monsterId,key:b.key,name:b.name,sourceArt:b.sourceArt,battleSprite:b.battleSprite,skillCodes:b.skills.map(s=>s.code)})),files};
await fs.writeFile('assets/ui/project-v/monsters/apocalypse-shanks-shisui-v1/manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({bossSprites:2,skills:6,animationFrames:72,files:files.length,alpha:true,frameBorders:files.filter(f=>f.frames).map(f=>({path:f.path,maxBorderRatio:Math.max(...f.frames.map(r=>r.borderRatio))}))}));
