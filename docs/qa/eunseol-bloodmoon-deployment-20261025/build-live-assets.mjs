import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {BLOODMOON_MERCENARIES} from '../../../shared/mercenary-bloodmoon-catalog-v1.mjs';
const source='preview/mercenary-bloodmoon-battle-20261023-v1/',root='assets/ui/project-v/mercenaries/bloodmoon-live-20261025/';
const hash=b=>createHash('sha256').update(b).digest('hex');
const original=JSON.parse(await fs.readFile(source+'manifest.json'));
const manifest={version:1,sourceManifest:source+'manifest.json',sourceSha256:hash(await fs.readFile(source+'manifest.json')),playbackRate:2,characters:[],files:[]};
await fs.mkdir(root,{recursive:true});
for(const c of original.characters){
 const art=BLOODMOON_MERCENARIES.find(a=>a.code===c.previewCode),motion={};
 for(const [key,sheet]of Object.entries(c.motion)){
  const frames=[];let x=0,y=0,rowHeight=0,width=0;
  for(const f of sheet.frames){
   const decoded=await sharp(source+f.path).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   const w=decoded.info.width,h=decoded.info.height;if(x+w>4096){x=0;y+=rowHeight;rowHeight=0;}
   frames.push({original:f,data:decoded.data,width:w,height:h,x,y});width=Math.max(width,x+w);rowHeight=Math.max(rowHeight,h);x+=w;
  }
  const height=y+rowHeight,raw=Buffer.alloc(width*height*4);
  for(const f of frames)for(let row=0;row<f.height;row++)f.data.copy(raw,((f.y+row)*width+f.x)*4,row*f.width*4,(row+1)*f.width*4);
  const file=c.previewCode.toLowerCase()+'-'+key+'.png';
  await sharp(raw,{raw:{width,height,channels:4}}).png().toFile(root+file);
  const check=await sharp(root+file).ensureAlpha().raw().toBuffer();
  for(const f of frames){const restored=Buffer.alloc(f.data.length);for(let row=0;row<f.height;row++)check.copy(restored,row*f.width*4,((f.y+row)*width+f.x)*4,((f.y+row)*width+f.x+f.width)*4);if(hash(restored)!==hash(f.data))throw Error('Frame pixels changed');}
  motion[key]={...sheet,path:file,frames:frames.map(f=>({index:f.original.index,rect:{x:f.x,y:f.y,width:f.width,height:f.height},foot:f.original.foot,emitter:f.original.emitter,bounds:f.original.bounds,shield:f.original.shield,bodyPixelDensity:f.original.bodyPixelDensity,sourcePath:source+f.original.path,pixelSha256:hash(f.data)}))};
  manifest.files.push({file:root+file,sha256:hash(await fs.readFile(root+file)),frames:frames.length,pixelsVerified:true});
 }
 const fxFile=c.previewCode.toLowerCase()+'-fx.png';await fs.copyFile(source+c.effects.skill.path,root+fxFile);
 manifest.files.push({file:root+fxFile,sha256:hash(await fs.readFile(root+fxFile)),source:source+c.effects.skill.path});
 const idle=motion.basic.frames[0],density=idle.bodyPixelDensity??1;
 manifest.characters.push({code:c.previewCode,id:c.id,slug:c.slug,name:art.name,accent:c.accent,skillKind:c.skillKind,bodyPixels:c.bodyPixels,battleBodyHeight:c.battleBodyHeight,displayBodyHeight:c.displayBodyHeight,
  art:{...art,calmIdle:true,spriteUrl:'/'+art.battleSprite,footAnchor:c.battleSpriteFootAnchor,bodyHeight:c.battleBodyHeight,fullBodyHeight:c.battleSprite.height*c.battleBodyHeight/(c.bodyPixels*density),originalTextureHeight:c.battleSprite.height},
  motion,effects:{skill:{...c.effects.skill,path:fxFile}}});
}
await fs.writeFile(root+'manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({characters:manifest.characters.length,files:manifest.files.length+1,pixelsVerified:true}));
