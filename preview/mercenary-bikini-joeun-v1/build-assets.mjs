import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const root=path.dirname(fileURLToPath(import.meta.url)),project=path.resolve(root,'../..');
const hash=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
async function inspect(file){
 const bytes=await fs.readFile(file),{data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let transparent=0,opaque=0,border=0,x0=info.width,y0=info.height,x1=-1,y1=-1;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const a=data[(y*info.width+x)*4+3];if(a<8)transparent++;if(a>=240)opaque++;if(a>=24){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);if(x<4||y<4||x>=info.width-4||y>=info.height-4)border++;}}
 return {bytes,data,info,record:{width:info.width,height:info.height,hasAlpha:(await sharp(bytes).metadata()).hasAlpha,sha256:hash(bytes),transparentFraction:transparent/(info.width*info.height),opaqueFraction:opaque/(info.width*info.height),borderPixels:border,bounds:[x0,y0,x1,y1]}};
}
const motion=await inspect(path.join(root,'assets/source/bikini-joeun-fire-motion-v1.png'));
if(!motion.record.hasAlpha||motion.record.borderPixels)throw Error('Motion needs native alpha and complete unclipped figures');
const {width:w,height:h}=motion.info,seen=new Uint8Array(w*h),components=[];
for(let n=0;n<w*h;n++){
 if(seen[n]||motion.data[n*4+3]<24)continue;
 const stack=[n];seen[n]=1;let count=0,x0=w,y0=h,x1=0,y1=0;
 while(stack.length){const p=stack.pop(),x=p%w,y=Math.floor(p/w);count++;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
  for(const q of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(q>=0&&!seen[q]&&motion.data[q*4+3]>=24){seen[q]=1;stack.push(q);}
 }
 if(count>12000)components.push({count,x0,y0,x1,y1});
}
components.sort((a,b)=>Math.floor(a.y0/(h/2))-Math.floor(b.y0/(h/2))||a.x0-b.x0);
if(components.length!==6)throw Error(`Expected six authored figures, got ${components.length}`);
const cell=640,motionFrames=[],tiles=[];
await fs.mkdir(path.join(root,'assets/motion'),{recursive:true});
for(const [index,b]of components.entries()){
 const left=Math.max(0,b.x0-4),top=Math.max(0,b.y0-4),width=b.x1+5-left,height=b.y1+5-top;
 let footLeft=w,footRight=0,mx=0,my=0,mc=0;
 for(let y=b.y0;y<=b.y1;y++)for(let x=b.x0;x<=b.x1;x++)if(motion.data[(y*w+x)*4+3]>=128){
  if(y>b.y1-(b.y1-b.y0)*.1){footLeft=Math.min(footLeft,x);footRight=Math.max(footRight,x);}
  if(y<b.y0+(b.y1-b.y0)*.5){if(x>mx){mx=x;my=y;mc=1;}else if(x===mx){my+=y;mc++;}}
 }
 my/=mc;const dx=Math.round(260-((footLeft+footRight)/2-left)),dy=600-(b.y1-top);
 if(dx<0||dy<0||dx+width>cell||dy+height>cell)throw Error(`Pose ${index} would clip`);
 const tile=await sharp(motion.bytes).extract({left,top,width,height}).png().toBuffer();
 const packed=await sharp({create:{width:cell,height:cell,channels:4,background:'#00000000'}}).composite([{input:tile,left:dx,top:dy}]).png().toBuffer();
 const file=`assets/motion/frame-${index}.png`;await fs.writeFile(path.join(root,file),packed);
 tiles.push({input:packed,left:index%3*cell,top:Math.floor(index/3)*cell});
 motionFrames.push({index,file,sha256:hash(packed),sourceRect:[left,top,width,height],footAnchor:{x:260/cell,y:600/cell},muzzle:{x:(mx-left+dx)/cell,y:(my-top+dy)/cell},bodyPixels:b.y1-b.y0+1});
}
await sharp({create:{width:cell*3,height:cell*2,channels:4,background:'#00000000'}}).composite(tiles).webp({lossless:true}).toFile(path.join(root,'assets/motion-atlas.webp'));
// Idle is the exact first animation pose, so costume, scale and face never pop on firing.
const sd='assets/ui/project-v/characters/mercenary/mercenary-v047-bikini-joeun-sd-v1.png';
await fs.copyFile(path.join(root,motionFrames[0].file),path.join(project,sd));
const sprite=await inspect(path.join(project,sd));
const art='assets/ui/project-v/mercenaries/approved-20260921/mercenary-v047-bikini-joeun-source-art-v1.png',source=await inspect(path.join(project,art));
await sharp(source.bytes).resize({width:640}).webp({quality:92}).toFile(path.join(root,'assets/source-art-preview.webp'));
const effect=await inspect(path.join(root,'assets/source/lavender-ricochet-impact-v1.png'));
if(!effect.record.hasAlpha)throw Error('Impact needs native alpha');
const effectCell=384,effectFrames=[],effectTiles=[];
await fs.mkdir(path.join(root,'assets/impact'),{recursive:true});
for(let index=0;index<16;index++){
 const col=index%4,row=Math.floor(index/4),left=Math.round(col*effect.info.width/4),top=Math.round(row*effect.info.height/4),width=Math.round((col+1)*effect.info.width/4)-left,height=Math.round((row+1)*effect.info.height/4)-top;
 const tile=await sharp(effect.bytes).extract({left,top,width,height}).png().toBuffer();
 const packed=await sharp({create:{width:effectCell,height:effectCell,channels:4,background:'#00000000'}}).composite([{input:tile,left:Math.floor((effectCell-width)/2),top:Math.floor((effectCell-height)/2)}]).png().toBuffer();
 const file=`assets/impact/frame-${String(index).padStart(2,'0')}.png`;await fs.writeFile(path.join(root,file),packed);
 effectTiles.push({input:packed,left:col*effectCell,top:row*effectCell});effectFrames.push({index,file,sha256:hash(packed),sourceRect:[left,top,width,height]});
}
await sharp({create:{width:effectCell*4,height:effectCell*4,channels:4,background:'#00000000'}}).composite(effectTiles).webp({lossless:true}).toFile(path.join(root,'assets/impact-atlas.webp'));
const manifest={version:1,code:'V-047',name:'비키니 조은',rank:'SS',sourceArt:art,sourceArtInfo:source.record,battleSprite:sd,battleSpriteInfo:sprite.record,battleSpriteFootAnchor:motionFrames[0].footAnchor,battleSpriteFacing:'RIGHT',battleSpriteMuzzle:motionFrames[0].muzzle,status:'USER_REQUESTED_LIVE',runtimeEnabled:true,
 renderer:{pixi:'8.20.0',gsap:'3.13.0',engine:'preview/project-v-v3/source/battle/BattleEngine.js',clockOwner:'V3_REGISTERED_GSAP',audio:'EXISTING_LICENSED_MARKSMAN_PROFILE'},
 impact:{source:'assets/source/lavender-ricochet-impact-v1.png',sourceInfo:effect.record,atlas:'assets/impact-atlas.webp',cellSize:effectCell,columns:4,rows:4,frameCount:16,collisionFrame:4,frames:effectFrames},
 motion:{source:'assets/source/bikini-joeun-fire-motion-v1.png',sourceInfo:motion.record,atlas:'assets/motion-atlas.webp',cellSize:cell,columns:3,rows:2,frameCount:6,frames:motionFrames},
 processing:'Approved illustration unchanged. Native-alpha motion components extracted and transparently padded, no retouching or synthetic intermediate poses. Idle uses pose 0. SD sports top has more coverage; opaque wrap skirt retained.',
 generation:{mode:'BUILT_IN_IMAGEGEN',prompts:['prompt-sd-v1.txt','prompt-impact-v1.txt','prompt-motion-v1.txt','prompt-motion-v2.txt']}};
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({sd:sprite.record,motion:motionFrames.map(f=>({index:f.index,bodyPixels:f.bodyPixels,muzzle:f.muzzle})),impactFrames:effectFrames.length},null,2));
