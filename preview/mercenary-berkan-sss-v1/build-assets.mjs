import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {readImage,partition,sha} from './image-tools.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),project=path.resolve(root,'../..');
const save=async(file,bytes)=>{await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file),bytes);return {file,sha256:sha(bytes)};};
const motionSpecs={idle:[8,2],aim:[8,2],attack:[12,3],hit:[8,2],defeat:[8,2],ultimate:[12,3]};
async function buildMotion(key,[count,rows]){
 const source='assets/source/'+key+'-v1.png',im=await readImage(path.join(root,source)),{components,owner}=partition(im,count,rows);
 if(!im.record.hasAlpha||im.record.border)throw Error(key+': native transparent margins required');
 const cell=512,frames=[],tiles=[],w=im.info.width;
 const feet=components.map((c,i)=>{
  let left=w,right=0;
  for(let y=Math.max(c.y0,c.y1-12);y<=c.y1;y++)for(let x=c.x0;x<=c.x1;x++)if(owner[y*w+x]===i+1&&im.data[(y*w+x)*4+3]>100){left=Math.min(left,x);right=Math.max(right,x);}
  const authored=key==='hit'?{1:690,3:1570}[i]:undefined;
  return [authored??(left+right)/2,c.y1];
 });
 // Collapse keeps the standing scale. Only the registration point changes;
 // a crouched/slumped frame is never resized to the standing frame's bounds.
 for(let i=0;i<count;i++){
  const foot=feet[i],dx=Math.round(cell*.5-foot[0]),dy=Math.round(cell*.92-foot[1]),raw=Buffer.alloc(cell*cell*4);
  for(let p=0;p<owner.length;p++)if(owner[p]===i+1){const x=p%w+dx,y=Math.floor(p/w)+dy,a=im.data[p*4+3];
   if(x<2||y<2||x>=cell-2||y>=cell-2){if(a>=16)throw Error(key+' frame '+i+': insufficient padding');continue;}
   im.data.copy(raw,(y*cell+x)*4,p*4,p*4+4);
  }
  const png=await sharp(raw,{raw:{width:cell,height:cell,channels:4}}).png().toBuffer();
  frames.push({...await save('assets/frames/'+key+'/'+String(i).padStart(2,'0')+'.png',png),index:i,footAnchor:{x:.5,y:.92},sourceFeet:foot,sourceBounds:components[i],bodyPixels:components[0].y1-components[0].y0});
  tiles.push({input:png,left:i%4*cell,top:Math.floor(i/4)*cell});
 }
 const atlas=await sharp({create:{width:cell*4,height:cell*rows,channels:4,background:'#00000000'}}).composite(tiles).webp({lossless:true}).toBuffer();
 return {source,sourceInfo:im.record,...await save('assets/'+key+'-atlas.webp',atlas),atlas:'assets/'+key+'-atlas.webp',cellSize:cell,columns:4,rows,frameCount:count,bodyPixels:components[0].y1-components[0].y0,frames};
}
async function buildEffect(key,rows,version=1){
 const source='assets/source/fx-'+key+'-v'+version+'.png',im=await readImage(path.join(root,source)),cell=512,frames=[],tiles=[];
 if(!im.record.hasAlpha||im.record.border)throw Error(key+': alpha/margin failed');
 for(let i=0;i<4*rows;i++){
  const col=i%4,row=Math.floor(i/4),x=Math.round(col*im.info.width/4),y=Math.round(row*im.info.height/rows),w=Math.round((col+1)*im.info.width/4)-x,h=Math.round((row+1)*im.info.height/rows)-y;
  const part=await sharp(im.bytes).extract({left:x,top:y,width:w,height:h}).raw().toBuffer();
  let border=0;for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)if((xx===0||yy===0||xx===w-1||yy===h-1)&&part[(yy*w+xx)*4+3]>=24)border++;
  if(border)throw Error(key+' frame '+i+': glow reaches cell boundary ('+border+')');
  const tile=await sharp(im.bytes).extract({left:x,top:y,width:w,height:h}).png().toBuffer(),left=Math.floor((cell-w)/2),top=Math.floor((cell-h)/2);
  const png=await sharp({create:{width:cell,height:cell,channels:4,background:'#00000000'}}).composite([{input:tile,left,top}]).png().toBuffer();
  const ground=key==='aura'||key==='afterglow';
  frames.push({...await save('assets/frames/fx-'+key+'/'+String(i).padStart(2,'0')+'.png',png),index:i,anchor:{x:(left+w*.5)/cell,y:(top+h*(ground?.77:.5))/cell},sourceRect:[x,y,w,h]});
  tiles.push({input:png,left:col*cell,top:row*cell});
 }
 const atlas=await sharp({create:{width:cell*4,height:cell*rows,channels:4,background:'#00000000'}}).composite(tiles).webp({lossless:true}).toBuffer();
 return {source,sourceInfo:im.record,...await save('assets/fx-'+key+'-atlas.webp',atlas),atlas:'assets/fx-'+key+'-atlas.webp',cellSize:cell,columns:4,rows,frameCount:4*rows,collisionFrame:key==='impact'?4:null,frames};
}
const source=await readImage(path.join(root,'assets/source-art.png')),sd=await readImage(path.join(root,'assets/berkan-sd-v1.png'));
if(source.record.width!==1024||source.record.height!==1536)throw Error('Source art dimensions');
if(!sd.record.hasAlpha||sd.record.border)throw Error('SD transparency or clipping');
await save('assets/source-art-preview.webp',await sharp(source.bytes).resize({width:640}).webp({quality:94}).toBuffer());
const motion={};for(const [key,spec]of Object.entries(motionSpecs))motion[key]=await buildMotion(key,spec);
const effects={};for(const [key,rows,version]of [['charge',3,2],['projectile',2,1],['impact',4,2],['afterglow',3,1],['aura',3,2]])effects[key]=await buildEffect(key,rows,version);
const lock=JSON.parse(await fs.readFile(path.join(project,'package-lock.json'),'utf8'));
const manifest={version:1,name:'베르칸',title:'흑금의 궁수',rank:'SSS',code:'V-055',nameStatus:'USER_ASSIGNED_NAME',rankStatus:'USER_ASSIGNED_RANK',sourceArtStatus:'USER_SUPPLIED_SOURCE_ART',battleSpriteStatus:'USER_APPROVED_LIVE',motionStatus:'USER_APPROVED_LIVE',effectStatus:'USER_APPROVED_LIVE',runtimeEnabled:true,
 sourceArt:'preview/mercenary-berkan-sss-v1/assets/source-art.png',sourceArtInfo:source.record,battleSprite:'preview/mercenary-berkan-sss-v1/assets/berkan-sd-v1.png',battleSpriteInfo:sd.record,battleSpriteSha256:sd.record.sha256,battleSpriteFootAnchor:{x:716/1254,y:1237/1254},bodyPixels:1221,battleSpriteFacing:'RIGHT',motion,effects,
 renderer:{pixi:lock.packages['node_modules/pixi.js'].version,gsap:lock.packages['node_modules/gsap'].version,engine:'preview/project-v-v3/source/battle/BattleEngine.js',implementation:'source/BerkanFX.js',clockOwner:'V3_REGISTERED_GSAP',extraTicker:false,spritePool:40,atlasBytesRGBA:Object.values({...motion,...effects}).reduce((n,s)=>n+s.cellSize*s.cellSize*s.frameCount*4,0)},
 registration:{status:'USER_APPROVED_LIVE',code:'V-055',skillId:'MS-055',rarity:'MATCH_CURRENT_CRYVERN_WEIGHT',damageAuthority:'SERVER_ONLY'},
 generation:{mode:'BUILT_IN_IMAGEGEN',prompts:(await fs.readdir(path.join(root,'prompts'))).filter(p=>!p.startsWith('run-')).map(p=>'prompts/'+p)},
 excluded:[{file:'assets/source/run-v1.png',reason:'User confirmed ranged stationary attacks; no running motion used.'}],
 processing:'Generated masters preserved. Native-alpha character ownership and foot registration; separate authored frames, lossless atlas packing with transparent padding. No procedural redrawing, no recoloring, no invented motion frames.'};
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({name:manifest.name,motionFrames:Object.values(motion).reduce((n,s)=>n+s.frameCount,0),effectFrames:Object.values(effects).reduce((n,s)=>n+s.frameCount,0),renderer:manifest.renderer,sourceHash:source.record.sha256,sdHash:sd.record.sha256},null,2));
