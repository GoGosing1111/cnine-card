import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {inspect} from '../mercenary-ragniel-v1/inspect-image.mjs';
import {MOTION_SPECS,EFFECT_SPECS} from './registration.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),project=path.resolve(root,'../..');
const hash=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
const read=async name=>{const bytes=await fs.readFile(path.join(root,name));const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});return {bytes,data,info,record:{...await inspect(path.join(root,name)),sha256:hash(bytes)}};};
const store=async(name,bytes)=>{await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),bytes);return {file:name,sha256:hash(bytes)};};
function partition(image,count,rows){
 const {width:w,height:h}=image.info,labels=new Int32Array(w*h),components=[];let label=0;
 for(let n=0;n<w*h;n++){
  if(labels[n]||image.data[n*4+3]<48)continue;
  const stack=[n];labels[n]=++label;let pixels=0,x0=w,y0=h,x1=-1,y1=-1;
  while(stack.length){const p=stack.pop(),x=p%w,y=Math.floor(p/w);pixels++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
   for(const q of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(q>=0&&!labels[q]&&image.data[q*4+3]>=48){labels[q]=label;stack.push(q);}
  }
  if(pixels>2000)components.push({label,pixels,x0,y0,x1,y1});
 }
 components.sort((a,b)=>(Math.round(a.y1/(h/rows))-Math.round(b.y1/(h/rows)))||a.x0-b.x0);
 if(components.length!==count)throw Error(`Expected ${count} distinct poses, found ${components.length}`);
 const big=new Map(components.map((c,i)=>[c.label,i+1])),owner=new Uint8Array(w*h),queue=new Int32Array(w*h);let end=0;
 for(let p=0;p<w*h;p++){const id=big.get(labels[p]);if(id){owner[p]=id;queue[end++]=p;}}
 for(let next=0;next<end;next++){
  const p=queue[next],x=p%w,y=Math.floor(p/w);
  for(const q of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(q>=0&&!owner[q]&&image.data[q*4+3]>0){owner[q]=owner[p];queue[end++]=q;}
 }
 for(let p=0;p<w*h;p++)if(!owner[p]&&image.data[p*4+3]>0){
  const x=p%w,y=Math.floor(p/w);let best=Infinity,id=0;
  components.forEach((c,i)=>{const dx=Math.max(c.x0-x,0,x-c.x1),dy=Math.max(c.y0-y,0,y-c.y1),d=dx*dx+dy*dy;if(d<best){best=d;id=i+1;}});owner[p]=id;
 }
 return {components,owner};
}
async function buildMotion(key,spec){
 const source=`assets/source/${spec.source}`,image=await read(source),{components,owner}=partition(image,spec.count,spec.rows);
 if(!image.record.hasAlpha||image.record.clear<.4)throw Error(`${key}: native alpha required`);
 const cell=768,tiles=[],frames=[];
 for(let i=0;i<spec.count;i++){
  const [footX,footY]=spec.feet[i],dx=Math.round(cell*.5-footX),dy=Math.round(cell*.90-footY),raw=Buffer.alloc(cell*cell*4);
  for(let p=0;p<owner.length;p++)if(owner[p]===i+1){const x=p%image.info.width+dx,y=Math.floor(p/image.info.width)+dy,a=image.data[p*4+3];
   if(x<8||y<8||x>=cell-8||y>=cell-8){if(a>=16)throw Error(`${key} frame ${i}: insufficient packing space`);continue;}
   image.data.copy(raw,(y*cell+x)*4,p*4,p*4+4);
  }
  const png=await sharp(raw,{raw:{width:cell,height:cell,channels:4}}).png().toBuffer();
  const entry=await store(`assets/frames/${key}/${String(i).padStart(2,'0')}.png`,png);
  frames.push({...entry,index:i,footAnchor:{x:.5,y:.90},sourceFeet:[footX,footY],sourceBounds:[components[i].x0,components[i].y0,components[i].x1,components[i].y1],headTop:spec.heads[i],bodyPixels:footY-spec.heads[i],registration:'AUTHORED_SHEET_FOOT_AND_HELMET_TOP'});
  tiles.push({input:png,left:i%spec.columns*cell,top:Math.floor(i/spec.columns)*cell});
 }
 const atlas=await sharp({create:{width:cell*spec.columns,height:cell*spec.rows,channels:4,background:'#00000000'}}).composite(tiles).webp({lossless:true}).toBuffer();
 await store(`assets/${key}-atlas.webp`,atlas);
 return {source,sourceInfo:image.record,atlas:`assets/${key}-atlas.webp`,atlasSha256:hash(atlas),cellSize:cell,columns:spec.columns,rows:spec.rows,frameCount:spec.count,bodyPixels:frames[spec.standingFrame].bodyPixels,frames};
}
async function buildEffect(key,file,columns,rows,anchorKind,collisionFrame){
 const source=`assets/source/${file}`,image=await read(source),cell=512,frames=[],tiles=[];
 if(!image.record.hasAlpha||image.record.clear<.4||image.record.border>0)throw Error(`${key}: alpha/margin inspection failed`);
 for(let i=0;i<columns*rows;i++){
  const col=i%columns,row=Math.floor(i/columns),x=Math.round(col*image.info.width/columns),y=Math.round(row*image.info.height/rows),w=Math.round((col+1)*image.info.width/columns)-x,h=Math.round((row+1)*image.info.height/rows)-y;
  let anchorY=Math.round(h*.5);
  if(anchorKind==='ground'){
   let score=-1;for(let yy=Math.floor(h*.82);yy<Math.floor(h*.96);yy++){let n=0;for(let xx=Math.floor(w*.24);xx<Math.floor(w*.76);xx++){const p=((y+yy)*image.info.width+x+xx)*4;n+=(image.data[p]+image.data[p+1]+image.data[p+2])*image.data[p+3]/255;}if(n>score){score=n;anchorY=yy;}}
  }
  const tile=await sharp(image.bytes).extract({left:x,top:y,width:w,height:h}).png().toBuffer(),left=Math.floor((cell-w)/2),top=Math.floor((cell-h)/2);
  const png=await sharp({create:{width:cell,height:cell,channels:4,background:'#00000000'}}).composite([{input:tile,left,top}]).png().toBuffer();
  const entry=await store(`assets/frames/fx-${key}/${String(i).padStart(2,'0')}.png`,png);
  frames.push({...entry,index:i,anchor:{x:(left+w*.5)/cell,y:(top+anchorY)/cell},sourceRect:[x,y,w,h]});
  tiles.push({input:png,left:col*cell,top:row*cell});
 }
 const atlas=await sharp({create:{width:cell*columns,height:cell*rows,channels:4,background:'#00000000'}}).composite(tiles).webp({lossless:true}).toBuffer();await store(`assets/fx-${key}-atlas.webp`,atlas);
 return {source,sourceInfo:image.record,atlas:`assets/fx-${key}-atlas.webp`,atlasSha256:hash(atlas),cellSize:cell,columns,rows,frameCount:columns*rows,collisionFrame,frames};
}

const sourcePath='redesign/standing-original-source-art-v3-short-crest.png',sdPath='assets/ice-dual-sword-sd-v7-forward-blade.png';
const source=await read(sourcePath),sd=await read(sdPath);
if(source.record.sha256!=='321600E04E4CDB3ABD9D35CCEEFCF4AFBD9F34AED73ABD5A8AD038123A999535')throw Error('Approved source art changed');
if(sd.record.sha256!=='DAE9EAA500E924E8561D6823D1A89C90F63A77EF5C8727A835E196C6F98016BD')throw Error('Approved battle SD changed');
if(!sd.record.hasAlpha||sd.record.border)throw Error('Invalid SD alpha/margins');
await store('assets/source-art-preview.webp',await sharp(source.bytes).resize({width:640}).webp({quality:94}).toBuffer());
const motion={};
for(const [key,spec] of Object.entries(MOTION_SPECS)){
 motion[key]=await buildMotion(key,spec);
 motion[key].contacts=(spec.contacts||[]).map(c=>({...c,sourceFoot:spec.feet[c.frame]}));
}
const effects={};
for(const [key,spec] of Object.entries(EFFECT_SPECS))effects[key]=await buildEffect(key,spec.source,spec.columns,spec.rows,spec.anchor,spec.collisionFrame);
const lock=JSON.parse(await fs.readFile(path.join(project,'package-lock.json'),'utf8'));
const audioRoot='preview/project-v-v3-event-fx-v1/',audioManifest=JSON.parse(await fs.readFile(path.join(project,audioRoot,'assets/audio/manifest.json'),'utf8'));
const audio={optional:true,defaultEnabled:false,sourceManifest:audioRoot+'assets/audio/manifest.json',license:audioManifest.license,licenseUrl:audioManifest.licenseUrl,proceduralSynthesis:false,runtimeSynthesis:false,assets:Object.fromEntries([['dash','dodge'],['slash','critical'],['ultimate','ultimate']].map(([key,id])=>{const a=audioManifest.assets[id];return [key,{file:audioRoot+a.src,sha256:a.sha256,sourceIds:a.sourceIds,syncPointMs:a.syncPointMs,design:a.design}];}))};
const prefix='preview/mercenary-ice-crystal-dual-sword-v1/';
const manifest={version:1,name:'크라이베른',title:'',nameStatus:'USER_ASSIGNED_NAME',rank:'SSS',rankStatus:'USER_ASSIGNED_RANK',code:'V-049',codeStatus:'LIVE_APPROVED',sourceArtStatus:'USER_APPROVED_SOURCE_ART',battleSpriteStatus:'USER_APPROVED_BATTLE_SPRITE',motionStatus:'USER_APPROVED',effectStatus:'USER_APPROVED',runtimeEnabled:true,skillsAssigned:true,
 sourceArt:prefix+sourcePath,sourceArtInfo:source.record,battleSprite:prefix+sdPath,battleSpriteInfo:sd.record,battleSpriteSha256:sd.record.sha256,battleSpriteFootAnchor:{x:669/1254,y:1150/1254},bodyPixels:1030,battleSpriteFacing:'RIGHT',motion,effects,
 renderer:{pixi:lock.packages['node_modules/pixi.js'].version,gsap:lock.packages['node_modules/gsap'].version,engine:'preview/project-v-v3/source/battle/BattleEngine.js',clockOwner:'V3_REGISTERED_GSAP',implementation:'source/IceDualSwordFX.js',aura:'CURRENT_POSE_NATIVE_ALPHA_DENSE_COBALT_RIM_PLUS_TWO_BLUR_LAYERS_AND_CYAN_EDGE',separateRenderer:false},audio,
 processing:'Generated RGBA masters preserved byte-for-byte. Native-alpha disconnected pose partition and transparent 768px packing. FX native grid extraction with transparent 512px padding. No AI redrawing or fabricated interpolation frames during packing. Runtime FX may cross-fade adjacent independently drawn frames; motion poses are discrete.',
 generation:{mode:'BUILT_IN_IMAGEGEN',prompts:[...Object.values(MOTION_SPECS),...Object.values(EFFECT_SPECS)].map(s=>'prompts/'+s.source.replace('.png','.txt'))},
 rejected:[{file:'assets/source/cast-v2.png',reason:'Clipped sword tips; replaced by independently generated cast-v3 with full margins.'}],
 release:{status:'LIVE_APPROVED',liveRuntimeChanged:true,approvalRequired:null,balanceChanged:true,preparedSkillId:'MS-049',target:'SLIGHTLY_ABOVE_RAGNIEL',balanceScope:'AUTHORIZED_LIVE_RELEASE'}
};
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({motions:Object.fromEntries(Object.entries(motion).map(([k,v])=>[k,{frames:v.frameCount,bodyPixels:v.bodyPixels}])),effects:Object.fromEntries(Object.entries(effects).map(([k,v])=>[k,v.frameCount])),renderer:manifest.renderer},null,2));
