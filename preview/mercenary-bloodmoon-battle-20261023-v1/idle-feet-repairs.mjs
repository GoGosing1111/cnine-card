import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';

// Keep the user-selected atlas and its 16 pixel-exact exports untouched. Only
// the two repaired idle textures override them at playback, at the same art scale.
export async function applyIdleFeetRepairs(character,dir){
 if(character.slug!=='bongsoon')return;
 for(let index=0;index<2;index++){
  const current=character.motion.basic.frames[index],original=current.restoration?.preservedOriginalFrame??current,relative=`assets/bongsoon/idle-feet-v2/0${index}.png`,bytes=await fs.readFile(path.join(dir,relative));
  const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const pixelDensity=info.width/original.rect.width;
  if(info.height/original.rect.height!==pixelDensity)throw Error('Idle repair must preserve the original square composition');
  let x0=info.width,y0=info.height,x1=0,y1=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>=80){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
  if(y1>=info.height-20)throw Error('Repaired boots lack transparent bottom margin');
  character.motion.basic.frames[index]={index,path:relative,rect:{x:0,y:0,width:info.width,height:info.height},
   foot:{x:original.foot.x*pixelDensity,y:y1},emitter:{x:original.emitter.x*pixelDensity,y:original.emitter.y*pixelDensity},bounds:[x0,y0,x1,y1],
   visibleHeight:character.bodyPixels*pixelDensity,bodyPixelDensity:pixelDensity,scaleApplied:1,
   sha256:createHash('sha256').update(bytes).digest('hex').toUpperCase(),
   restoration:{reason:'USER_REPORTED_MISSING_IDLE_BOOT_TOES',method:'BUILT_IN_IMAGEGEN',promptRecord:'prompts-idle-feet-v2.json',preservedOriginalFrame:original}};
 }
 const first=character.motion.basic.frames[0],data=await fs.readFile(path.join(dir,first.path));
 character.battleSprite={path:first.path,width:first.rect.width,height:first.rect.height,sha256:first.sha256,hasAlpha:true,bytes:data.length,frames:[first]};
 character.battleSpriteFootAnchor={x:first.foot.x/first.rect.width,y:first.foot.y/first.rect.height};
 character.displayBodyHeight=(first.bounds[3]-first.bounds[1])*character.battleBodyHeight/(character.bodyPixels*first.bodyPixelDensity);
 character.idleRestoration={status:'USER_REQUESTED_REPAIR_VISUAL_REVIEW_PENDING',frames:[0,1],unchangedOtherFrames:14,selectedAtlasPreserved:true,pixelDensityPolicy:'CANVAS_RESOLUTION_RATIO_ONLY_NEVER_FIT_POSE_BOUNDS'};
}
