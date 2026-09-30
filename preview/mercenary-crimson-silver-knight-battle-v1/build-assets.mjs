import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {weaponAt,foreground,cleanAlpha} from './compose-weapon.mjs';
import {inspect} from '../mercenary-ragniel-v1/inspect-image.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),project=path.resolve(root,'../..');
const sha=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
const write=async(file,bytes)=>{await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file),bytes);return {file,sha256:sha(bytes)};};
async function read(file){const bytes=await fs.readFile(path.join(root,file)),raw=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});return {bytes,...raw,record:{...await inspect(path.join(root,file)),sha256:sha(bytes)}};}
export function partition(image,count,rows){
 const {width:w,height:h}=image.info,labels=new Int32Array(w*h),components=[];let label=0;
 const gridWhite=p=>{const [r,g,b,a]=image.data.subarray(p*4,p*4+4);return a>90&&Math.min(r,g,b)>200&&Math.max(r,g,b)-Math.min(r,g,b)<45;};
 const columns=count/rows;
 for(let k=1;k<columns;k++)for(let x=Math.round(k*w/columns)-2;x<=Math.round(k*w/columns)+1;x++){let line=0;for(let y=0;y<h;y++)if(gridWhite(y*w+x))line++;if(line>h*.7)for(let y=0;y<h;y++)image.data.fill(0,(y*w+x)*4,(y*w+x)*4+4);}
 for(let k=1;k<rows;k++)for(let y=Math.round(k*h/rows)-2;y<=Math.round(k*h/rows)+1;y++){let line=0;for(let x=0;x<w;x++)if(gridWhite(y*w+x))line++;if(line>w*.7)image.data.fill(0,y*w*4,(y+1)*w*4);}
 for(let p=0;p<w*h;p++){
  if(labels[p]||image.data[p*4+3]<100)continue;
  const stack=[p];labels[p]=++label;let pixels=0,x0=w,y0=h,x1=-1,y1=-1;
  while(stack.length){const n=stack.pop(),x=n%w,y=Math.floor(n/w);pixels++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
   for(const q of [x>0?n-1:-1,x<w-1?n+1:-1,y>0?n-w:-1,y<h-1?n+w:-1])if(q>=0&&!labels[q]&&image.data[q*4+3]>=100){labels[q]=label;stack.push(q);}
  }
  if(pixels>Math.max(1500,w*h/count*.045))components.push({label,pixels,x0,y0,x1,y1});
 }
 components.sort((a,b)=>Math.floor((a.y0+a.y1)/2/(h/rows))-Math.floor((b.y0+b.y1)/2/(h/rows))||a.x0-b.x0);
 if(components.length!==count)throw Error(`Expected ${count} separate bodies, found ${components.length}. Inspect and repair this source only.`);
 const big=new Map(components.map((c,i)=>[c.label,i+1])),owner=new Uint8Array(w*h),queue=new Int32Array(w*h);let end=0;
 for(let p=0;p<w*h;p++){const id=big.get(labels[p]);if(id){owner[p]=id;queue[end++]=p;}}
 for(let next=0;next<end;next++){const p=queue[next],x=p%w,y=Math.floor(p/w);for(const q of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(q>=0&&!owner[q]&&image.data[q*4+3]>0){owner[q]=owner[p];queue[end++]=q;}}
 for(let p=0;p<w*h;p++)if(!owner[p]&&image.data[p*4+3]>0){const x=p%w,y=Math.floor(p/w);let best=Infinity,id=0;components.forEach((c,i)=>{const dx=Math.max(c.x0-x,0,x-c.x1),dy=Math.max(c.y0-y,0,y-c.y1),d=dx*dx+dy*dy;if(d<best){best=d;id=i+1;}});if(best<=25)owner[p]=id;}
 return {components,owner};
}
async function isolate(image,c,owner,id){
 const w=c.x1-c.x0+1,h=c.y1-c.y0+1,raw=Buffer.alloc(w*h*4);
 for(let y=c.y0;y<=c.y1;y++)for(let x=c.x0;x<=c.x1;x++){const p=y*image.info.width+x;if(owner[p]===id)image.data.copy(raw,((y-c.y0)*w+x-c.x0)*4,p*4,p*4+4);}
 return cleanAlpha(await sharp(raw,{raw:{width:w,height:h,channels:4}}).png().toBuffer());
}
function feet(image,c,owner,id){
 const {width:w}=image.info;let bottom=c.y0;
 for(let y=c.y0;y<=c.y1;y++)for(let x=c.x0;x<=c.x1;x++){const p=y*w+x,[r,g,b,a]=image.data.subarray(p*4,p*4+4);if(owner[p]===id&&a>=160&&g>35&&!(r>g*1.6&&r>b*1.6))bottom=Math.max(bottom,y);}
 let sum=0,weight=0;for(let y=Math.max(c.y0,bottom-(c.y1-c.y0)*.075);y<=bottom;y++)for(let x=c.x0;x<=c.x1;x++){const p=Math.floor(y)*w+x,[r,g,b,a]=image.data.subarray(p*4,p*4+4);if(owner[p]===id&&a>=160&&g>35&&!(r>g*1.6&&r>b*1.6)){weight+=a;sum+=x*a;}}
 return [weight?sum/weight:(c.x0+c.x1)/2,bottom];
}
async function motion(key,spec){
 const poses=[],sources=[];
 for(const part of spec.parts){
  const file='assets/source/'+part.source,image=await read(file),{components,owner}=partition(image,part.count,part.rows);
  if(!image.record.hasAlpha||image.record.clear<.3)throw Error(key+': native transparent body required');
  sources.push({file,...image.record});const reference=part.bodyPixels??Math.max(...components.map(c=>c.y1-c.y0));
  for(let i=0;i<part.count;i++){
   const c=components[i],sourceFeet=part.feet?.[i]??feet(image,c,owner,i+1),body=await isolate(image,c,owner,i+1),entry=part.hands[i];
   if(!entry||entry.length!==3)throw Error(key+' '+i+': reviewed grip/angle required');
   const [gx,gy,angle]=entry,grip=[gx-c.x0,gy-c.y0],radius=reference*.05;
   const glove=await foreground(body,Array.from({length:24},(_,n)=>{const a=n/24*Math.PI*2;return [grip[0]+Math.cos(a)*radius*.9,grip[1]+Math.sin(a)*radius];}));
   const placed=await weaponAt({scale:reference/1452,angle,grip});const bx=c.x0-sourceFeet[0],by=c.y0-sourceFeet[1],wx=placed.left+bx,wy=placed.top+by;
   poses.push({body,glove,weapon:placed.input,bounds:[Math.min(bx,wx),Math.min(by,wy),Math.max(bx+c.x1-c.x0+1,wx+placed.width),Math.max(by+c.y1-c.y0+1,wy+placed.height)],bodyOrigin:[bx,by],weaponOrigin:[wx,wy],reference,sourceBounds:[c.x0,c.y0,c.x1,c.y1],sourceFeet,hand:[gx,gy],weaponRecord:placed.record,source:file,index:poses.length});
  }
 }
 const x0=Math.min(...poses.map(p=>p.bounds[0])),y0=Math.min(...poses.map(p=>p.bounds[1])),x1=Math.max(...poses.map(p=>p.bounds[2])),y1=Math.max(...poses.map(p=>p.bounds[3]));
 const fit=Math.min(1,236/Math.max(1,-x0),236/Math.max(1,x1),420/Math.max(1,-y0),56/Math.max(1,y1));
 const cell=512,frames=[],tiles=[];
 for(const p of poses){
  const layers=[];for(const [bytes,origin]of [[p.body,p.bodyOrigin],[p.weapon,p.weaponOrigin],[p.glove,p.bodyOrigin]]){
   const meta=await sharp(bytes).metadata(),w=Math.max(1,Math.round(meta.width*fit)),h=Math.max(1,Math.round(meta.height*fit));
   const input=await sharp(bytes).resize(w,h).png().toBuffer();layers.push({input,left:Math.round(256+origin[0]*fit),top:Math.round(440+origin[1]*fit)});
  }
  const png=await sharp({create:{width:cell,height:cell,channels:4,background:'#00000000'}}).composite(layers).png().toBuffer();
  const angle=p.weaponRecord.angle*Math.PI/180,scale=p.weaponRecord.scale*fit,grip=[256+(p.hand[0]-p.sourceFeet[0])*fit,440+(p.hand[1]-p.sourceFeet[1])*fit];
  const tip=[grip[0]+scale*(11*Math.cos(angle)-1119*Math.sin(angle)),grip[1]+scale*(11*Math.sin(angle)+1119*Math.cos(angle))];
  frames.push({...await write(`assets/frames/${key}/${String(p.index).padStart(2,'0')}.png`,png),index:p.index,footAnchor:{x:.5,y:440/512},bodyPixels:p.reference*fit,source:p.source,sourceBounds:p.sourceBounds,sourceFeet:p.sourceFeet,grip,tip,weapon:{...p.weaponRecord,packedUniformScale:fit},foreground:'BODY_GLOVE_PIXELS'});tiles.push({input:png,left:p.index%4*cell,top:Math.floor(p.index/4)*cell});
 }
 const rows=Math.ceil(frames.length/4),pngAtlas='assets/'+key+'-atlas.png',png=await cleanAlpha(await sharp({create:{width:4*cell,height:rows*cell,channels:4,background:'#00000000'}}).composite(tiles).png().toBuffer());await write(pngAtlas,png);
 const atlas=await sharp(png).webp({lossless:true}).toBuffer();await write('assets/'+key+'-atlas.webp',atlas);
 const contacts=(spec.contacts??[]).map(({frame,targetHeightFraction})=>({frame,sourcePoint:frames[frame].tip,sourceFoot:[256,440],targetHeightFraction}));
 return {sources,atlas:'assets/'+key+'-atlas.webp',atlasSha256:sha(atlas),pngAtlas,pngAtlasSha256:sha(png),cellSize:cell,columns:4,rows,frameCount:frames.length,uniformScale:fit,bodyPixels:frames[0].bodyPixels,frames,contacts};
}
async function effect(key,spec){
 const file='assets/source/'+spec.source,image=await read(file),cell=512,frames=[],tiles=[];if(!image.record.hasAlpha||image.record.clear<.2)throw Error(key+': native transparent effect required');
 for(let i=0;i<spec.count;i++){
  const col=i%spec.columns,row=Math.floor(i/spec.columns),x=Math.round(col*image.info.width/spec.columns),y=Math.round(row*image.info.height/spec.rows),w=Math.round((col+1)*image.info.width/spec.columns)-x,h=Math.round((row+1)*image.info.height/spec.rows)-y;
  const scale=Math.min(1,480/w,480/h),rw=Math.round(w*scale),rh=Math.round(h*scale),left=Math.floor((cell-rw)/2),top=Math.floor((cell-rh)/2),tile=await cleanAlpha(await sharp(image.bytes).extract({left:x,top:y,width:w,height:h}).resize(rw,rh).png().toBuffer());
  let ay=.5;if(spec.anchor==='ground'){let best=-1;for(let yy=Math.floor(h*.68);yy<h*.96;yy++){let brightness=0;for(let xx=Math.floor(w*.15);xx<w*.85;xx++){const p=((y+yy)*image.info.width+x+xx)*4;brightness+=(image.data[p]+image.data[p+1]+image.data[p+2])*image.data[p+3];}if(brightness>best){best=brightness;ay=(top+yy*scale)/cell;}}}
  const png=await sharp({create:{width:cell,height:cell,channels:4,background:'#00000000'}}).composite([{input:tile,left,top}]).png().toBuffer();
  frames.push({...await write(`assets/frames/fx-${key}/${String(i).padStart(2,'0')}.png`,png),index:i,anchor:{x:.5,y:ay},sourceRect:[x,y,w,h]});tiles.push({input:png,left:col*cell,top:row*cell});
 }
 const pngAtlas=`assets/fx-${key}-atlas.png`,png=await cleanAlpha(await sharp({create:{width:spec.columns*cell,height:spec.rows*cell,channels:4,background:'#00000000'}}).composite(tiles).png().toBuffer());await write(pngAtlas,png);
 const atlas=await sharp(png).webp({lossless:true}).toBuffer();await write(`assets/fx-${key}-atlas.webp`,atlas);
 return {source:file,sourceInfo:image.record,atlas:`assets/fx-${key}-atlas.webp`,atlasSha256:sha(atlas),pngAtlas,pngAtlasSha256:sha(png),cellSize:cell,columns:spec.columns,rows:spec.rows,frameCount:spec.count,collisionFrame:spec.peak,frames};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const specs=JSON.parse(await fs.readFile(path.join(root,'asset-specs.json'),'utf8')),motions={},effects={};
 for(const [key,spec]of Object.entries(specs.motion)){motions[key]=await motion(key,spec);console.log(key+': '+motions[key].frameCount+' rigid-weapon frames');}
 for(const [key,spec]of Object.entries(specs.effects)){effects[key]=await effect(key,spec);console.log(key+': '+effects[key].frameCount+' effect frames');}
 const sourceArt='assets/ui/project-v/mercenaries/approved-20260930/crimson-silver-knight-source-art-approved-v8.png',sourceBytes=await fs.readFile(path.join(project,sourceArt));if(sha(sourceBytes)!=='8B94E60670355AF87D13802FD68AD4DE22F8E7F23C65028CC97DD1D1F78BE838')throw Error('Approved source art changed');
 await write('assets/source-art-preview.webp',await sharp(sourceBytes).resize({width:640}).webp({quality:94}).toBuffer());
 const sprite='assets/knight-sd-v6-original-sword.png',sd=await read(sprite),lock=JSON.parse(await fs.readFile(path.join(project,'package-lock.json'),'utf8')),weapon=JSON.parse(await fs.readFile(path.join(root,'assets/weapon/sword-original.json'),'utf8')),prefix='preview/mercenary-crimson-silver-knight-battle-v1/';
 const manifest={version:2,conceptId:'crimson-silver-knight',name:'은백·금색 대검 기사',nameStatus:'DESCRIPTION_NOT_ASSIGNED',rank:null,rankTarget:'HIGHEST_ENDGAME_TIER',code:'V-996',codeStatus:'PREVIEW_LOCAL_ONLY',runtimeEnabled:false,sourceArt,sourceArtSha256:sha(sourceBytes),battleSprite:prefix+sprite,battleSpriteInfo:sd.record,battleSpriteFootAnchor:{x:644/1408,y:1510/1664},bodyPixels:1452,battleSpriteStatus:'USER_REVIEW_PENDING',motionStatus:'USER_REVIEW_PENDING',effectStatus:'USER_REVIEW_PENDING',motion:motions,effects,weapon,renderer:{pixi:lock.packages['node_modules/pixi.js'].version,gsap:lock.packages['node_modules/gsap'].version,engine:'preview/project-v-v3/source/battle/BattleEngine.js',implementation:'source/KnightFX.js',clockOwner:'V3_REGISTERED_GSAP',aura:'CURRENT_POSE_ALPHA_RUBY_GOLD_OUTLINE_PLUS_TWO_LEGACY_CLEARING_BLUR_LAYERS',separateRenderer:false},processing:'Immutable approved sword pixels selected once. Bodies drawn with no weapon. The same sword is composited using only uniform scale, rigid rotation and translation, with body glove pixels in foreground. Transparent registration padding and lossless WebP packing. No still transforms counted as drawn body frames.',generation:{mode:'BUILT_IN_IMAGEGEN',promptDirectory:'prompts/'},release:{status:'INDEPENDENT_USER_REVIEW_PREVIEW',liveRuntimeChanged:false,balanceChanged:false,skillsAssigned:false},counts:{motion:Object.values(motions).reduce((n,s)=>n+s.frameCount,0),effects:Object.values(effects).reduce((n,s)=>n+s.frameCount,0)}};
 manifest.battleSpriteSha256=sd.record.sha256;
 manifest.displaySizing={baselineFullBodyHeight:260,initialRequestedScale:1.25,latestRequest:'MATCH_CRYVERN_BATTLE_CHARACTER_SIZE',fullBodyHeight:358,bodyHeight:358*1452/1664,reference:{name:'크라이베른',preview:'preview/mercenary-ice-crystal-dual-sword-v1/',fullBodyHeight:380,bodyPixels:1030,spriteHeight:1254,bodyHeight:380*1030/1254},policy:'UNIFORM_CHARACTER_WEAPON_AND_AURA_SCALE_EXCLUDING_TRANSPARENT_PADDING'};
 manifest.audio={...JSON.parse(await fs.readFile(path.resolve(root,'../mercenary-ragniel-v1/manifest.json'),'utf8')).audio,enabledByDefault:false,provenance:'Existing approved V3 Combat SFX assets; no new synthesis or license assumptions.'};
 manifest.technicalQaReport='qa-report.json';manifest.browserQaReport='qa/browser-report.json';
 await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest.counts));
}
