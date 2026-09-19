import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';

const root=path.dirname(fileURLToPath(import.meta.url));
const project=path.resolve(root,'../..');
const art='assets/ui/project-v/mercenaries/approved-20260919/mercenary-v045-mangisa-source-art-v1.png';
const sd='assets/ui/project-v/characters/mercenary/mercenary-v045-mangisa-sd-v2.png';
const hash=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
async function inspect(file){
 const bytes=await fs.readFile(file),meta=await sharp(bytes).metadata();
 const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let transparent=0,opaque=0,border=0,minX=info.width,minY=info.height,maxX=0,maxY=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  const a=data[(y*info.width+x)*4+3];if(a<8)transparent++;if(a>=240)opaque++;
  if(a>=24){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);if(x<4||y<4||x>=info.width-4||y>=info.height-4)border++;}
 }
 return {bytes,data,info,record:{width:meta.width,height:meta.height,hasAlpha:!!meta.hasAlpha,sha256:hash(bytes),transparentFraction:transparent/(info.width*info.height),opaqueFraction:opaque/(info.width*info.height),borderPixels:border,bounds:[minX,minY,maxX,maxY]}};
}
const source=await inspect(path.join(project,art)),sprite=await inspect(path.join(project,sd));
if(!sprite.record.hasAlpha||sprite.record.transparentFraction<.4||sprite.record.opaqueFraction<.15||sprite.record.borderPixels)throw Error('SD alpha or clipping check failed');
await sharp(source.bytes).resize({width:640}).webp({quality:92}).toFile(path.join(root,'assets/source-art-preview.webp'));

const effect=await inspect(path.join(root,'assets/source/golden-orchid-impact-v1.png'));
if(!effect.record.hasAlpha)throw Error('Effect must have native alpha');
const effectCell=384,effectTiles=[],effectFrames=[];
await fs.mkdir(path.join(root,'assets/impact'),{recursive:true});
for(let i=0;i<16;i++){
 const col=i%4,row=Math.floor(i/4),x=Math.round(col*effect.info.width/4),y=Math.round(row*effect.info.height/4);
 const width=Math.round((col+1)*effect.info.width/4)-x,height=Math.round((row+1)*effect.info.height/4)-y;
 const tile=await sharp(effect.bytes).extract({left:x,top:y,width,height}).png().toBuffer();
 const left=Math.floor((effectCell-width)/2),top=Math.floor((effectCell-height)/2);
 const packed=await sharp({create:{width:effectCell,height:effectCell,channels:4,background:'#00000000'}}).composite([{input:tile,left,top}]).png().toBuffer();
 const file=`assets/impact/frame-${String(i).padStart(2,'0')}.png`;
 await fs.writeFile(path.join(root,file),packed);
 effectTiles.push({input:packed,left:col*effectCell,top:row*effectCell});
 effectFrames.push({index:i,file,sha256:hash(packed),sourceRect:[x,y,width,height]});
}
await sharp({create:{width:effectCell*4,height:effectCell*4,channels:4,background:'#00000000'}}).composite(effectTiles).webp({lossless:true}).toFile(path.join(root,'assets/impact-atlas.webp'));

// Find the six native opaque characters; this only extracts/places source pixels.
// No chroma key, alpha replacement, painted content or invented in-between frames.
const motion=await inspect(path.join(root,'assets/source/mangisa-fire-motion-v1.png'));
const {width:mw,height:mh}=motion.info,seen=new Uint8Array(mw*mh),components=[];
for(let n=0;n<mw*mh;n++){
 if(seen[n]||motion.data[n*4+3]<24)continue;
 const stack=[n];seen[n]=1;let count=0,x0=mw,y0=mh,x1=0,y1=0;
 while(stack.length){const p=stack.pop(),x=p%mw,y=Math.floor(p/mw);count++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
  for(const q of [x>0?p-1:-1,x<mw-1?p+1:-1,y>0?p-mw:-1,y<mh-1?p+mw:-1])if(q>=0&&!seen[q]&&motion.data[q*4+3]>=24){seen[q]=1;stack.push(q);}
 }
 if(count>12000)components.push({count,x0,y0,x1,y1});
}
components.sort((a,b)=>Math.floor(a.y0/(mh/2))-Math.floor(b.y0/(mh/2))||a.x0-b.x0);
if(components.length!==6)throw Error(`Expected six disconnected authored poses, got ${components.length}`);
const motionCell=640,motionTiles=[],motionFrames=[];
await fs.mkdir(path.join(root,'assets/motion'),{recursive:true});
for(let i=0;i<6;i++){
 const b=components[i],left=Math.max(0,b.x0-4),top=Math.max(0,b.y0-4),width=Math.min(mw-1,b.x1+4)-left+1,height=Math.min(mh-1,b.y1+4)-top+1;
 let footLeft=mw,footRight=0,muzzleX=0,muzzleY=0,muzzleCount=0;
 for(let y=b.y0;y<=b.y1;y++)for(let x=b.x0;x<=b.x1;x++)if(motion.data[(y*mw+x)*4+3]>=128){
  if(y>b.y1-(b.y1-b.y0)*.1){footLeft=Math.min(footLeft,x);footRight=Math.max(footRight,x);}
  if(y<b.y0+(b.y1-b.y0)*.5){if(x>muzzleX){muzzleX=x;muzzleY=y;muzzleCount=1;}else if(x===muzzleX){muzzleY+=y;muzzleCount++;}}
 }
 muzzleY/=muzzleCount;const footX=(footLeft+footRight)/2,dx=Math.round(280-(footX-left)),dy=600-(b.y1-top);
 if(dx<0||dy<0||dx+width>motionCell||dy+height>motionCell)throw Error(`Pose ${i} does not fit without clipping`);
 const tile=await sharp(motion.bytes).extract({left,top,width,height}).png().toBuffer();
 const packed=await sharp({create:{width:motionCell,height:motionCell,channels:4,background:'#00000000'}}).composite([{input:tile,left:dx,top:dy}]).png().toBuffer();
 const file=`assets/motion/frame-${i}.png`;await fs.writeFile(path.join(root,file),packed);
 motionTiles.push({input:packed,left:i%3*motionCell,top:Math.floor(i/3)*motionCell});
 motionFrames.push({index:i,file,sha256:hash(packed),sourceRect:[left,top,width,height],footAnchor:{x:280/motionCell,y:600/motionCell},muzzle:{x:(muzzleX-left+dx)/motionCell,y:(muzzleY-top+dy)/motionCell},bodyPixels:b.y1-b.y0+1});
}
await sharp({create:{width:motionCell*3,height:motionCell*2,channels:4,background:'#00000000'}}).composite(motionTiles).webp({lossless:true}).toFile(path.join(root,'assets/motion-atlas.webp'));
const manifest={version:1,code:'V-045',name:'망이사',rank:'SS',nameStatus:'USER_ASSIGNED_NAME',rankStatus:'USER_ASSIGNED_RANK',sourceArtStatus:'APPROVED_SOURCE_ART',approvedAt:'2026-09-19',sourceArt:art,sourceArtInfo:source.record,battleSprite:sd,battleSpriteInfo:sprite.record,battleSpriteFootAnchor:{x:.502,y:.973},battleSpriteFacing:'RIGHT',battleSpriteStatus:'TECH_QA_COMPLETE_USER_REVIEW_PENDING',runtimeEnabled:false,skillStatus:'IMPLEMENTED_PREVIEW_USER_REVIEW_PENDING',
 renderer:{pixi:'8.20.0',gsap:'3.13.0',engine:'preview/project-v-v3/source/battle/BattleEngine.js',clockOwner:'V3_REGISTERED_GSAP',audio:'SILENT_VISUAL_REVIEW'},
 impact:{source:'assets/source/golden-orchid-impact-v1.png',sourceInfo:effect.record,atlas:'assets/impact-atlas.webp',cellSize:effectCell,columns:4,rows:4,frameCount:16,collisionFrame:4,frames:effectFrames},
 motion:{source:'assets/source/mangisa-fire-motion-v1.png',sourceInfo:motion.record,atlas:'assets/motion-atlas.webp',cellSize:motionCell,columns:3,rows:2,frameCount:6,frames:motionFrames},
 processing:'Unmodified native masters; exact native alpha frame extraction and transparent atlas padding. No generated intermediate frames, no recolor, no keying.',
 generation:{mode:'BUILT_IN_IMAGEGEN',prompts:['prompt-sd-v1.txt','prompt-sd-v2.txt','prompt-impact-v1.txt','prompt-motion-v1.txt']}};
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({sourceArt:source.record,battleSprite:sprite.record,effectFrames:effectFrames.length,motionFrames:motionFrames.length,motionAnchors:motionFrames.map(f=>({frame:f.index,muzzle:f.muzzle,bodyPixels:f.bodyPixels}))},null,2));
